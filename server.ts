import dotenv from "dotenv";
import * as crypto from "crypto";
import fs from "fs";
import express from "express";
import path from "path";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { requireFirebaseAuth, type AuthenticatedRequest } from "./server/authMiddleware";

const envBasePath = path.resolve(process.cwd(), ".env");
const envLocalPath = path.resolve(process.cwd(), ".env.local");
dotenv.config({ path: envBasePath });
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const DEFAULT_NVIDIA_URL = process.env.NVIDIA_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct";

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1").replace(/\/$/, "");
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || "";
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || "";
const APPWRITE_BUCKET_ID = process.env.APPWRITE_BUCKET_ID || "aegis-media";
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const GOOGLE_CALENDAR_IMPERSONATE = process.env.GOOGLE_CALENDAR_IMPERSONATE || "";

const appwriteEndpointCandidates = () => {
  const endpoints = new Set<string>();
  const region = APPWRITE_PROJECT_ID.split("-")[0];
  if (region && /^[a-z]{2,5}$/.test(region)) {
    endpoints.add(`https://${region}.cloud.appwrite.io/v1`);
  }
  endpoints.add(APPWRITE_ENDPOINT);
  endpoints.add("https://cloud.appwrite.io/v1");
  return [...endpoints].map((endpoint) => endpoint.replace(/\/$/, ""));
};

type AiClient =
  | { type: "nvidia"; apiKey: string; url: string; model: string };

const getAIClient = (): AiClient | null => {
  if (process.env.NVIDIA_API_KEY) {
    console.log(`NVIDIA API key loaded; using model ${process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL}`);
    return {
      type: "nvidia",
      apiKey: process.env.NVIDIA_API_KEY,
      url: process.env.NVIDIA_API_URL || DEFAULT_NVIDIA_URL,
      model: process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL,
    };
  }

  console.log("Warning: No AI API key configured. Set NVIDIA_API_KEY.");
  return null;
};

const FAIL_CLOSED_ANALYSIS = JSON.stringify({
  isSafe: false,
  score: 0,
  threatType: "phishing",
  summary: "Security analysis unavailable — content treated as unsafe.",
  points: ["Automated scan could not complete"],
  steganographyReport: "N/A",
});

const FAIL_CLOSED_CALL = JSON.stringify({
  isSafe: false,
  threatType: "phishing",
  summary: "Call analysis unavailable — treat as potentially unsafe.",
  points: ["Automated scan could not complete"],
});

const FAIL_CLOSED_GROUP = JSON.stringify({
  isVerified: false,
  status: "unverified",
  reason: "Verification unavailable — proceed with caution.",
  threatMarkers: ["Service Error"],
});

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  // General API rate limit: 100 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  // Stricter limit for AI-heavy endpoints: 20 requests per minute per IP
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many AI requests, please slow down." },
  });

  app.use("/api/storage/status", apiLimiter);
  app.use("/api/storage/upload", apiLimiter);
  app.use("/api/storage/write-test", apiLimiter);
  app.use("/api/storage/files/:fileId/download", apiLimiter);
  app.use("/api/meet/create", apiLimiter);
  app.use("/api/security-assistant", aiLimiter);
  app.use("/api/malware-score", aiLimiter);
  app.use("/api/chat", aiLimiter);
  app.use("/api/analyze", aiLimiter);
  app.use("/api/analyze-call", aiLimiter);
  app.use("/api/analyze-group", aiLimiter);
  app.use("/api/threat-explain", aiLimiter);

  app.use(express.json({ limit: "70mb" }));
  app.use("/api", (req, res, next) => {
    if (req.path === "/storage/status") return next();
    return requireFirebaseAuth(req as AuthenticatedRequest, res, next);
  });

  const DEFAULT_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 650;
  const MAX_CHAT_HISTORY = 10;
  const MAX_TEXT_LENGTH = 12_000;
  const cleanText = (value: unknown, maxLength = MAX_TEXT_LENGTH) =>
    typeof value === "string" ? value.trim().slice(0, maxLength) : "";

  type MessageContent =
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;

  type AiMessage = { role: "system" | "user" | "assistant"; content: MessageContent };

  const aiUnavailableResponse = (res: express.Response, fallbackText: string) => {
    return res.status(503).json({ text: fallbackText, error: "AI service unavailable because no AI API key is configured." });
  };

  const appwriteHeaders = () => ({
    "X-Appwrite-Project": APPWRITE_PROJECT_ID,
    "X-Appwrite-Key": APPWRITE_API_KEY,
  });

  const isAppwriteConfigured = () => Boolean(APPWRITE_PROJECT_ID && APPWRITE_API_KEY && APPWRITE_BUCKET_ID);

  const cleanFileName = (name: unknown) => {
    const safe = typeof name === "string" ? name : "encrypted-file.bin";
    return safe.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "encrypted-file.bin";
  };

  const fetchAppwrite = async (pathName: string, init: RequestInit = {}) => {
    const errors: string[] = [];
    for (const endpoint of appwriteEndpointCandidates()) {
      try {
        const response = await fetch(`${endpoint}${pathName}`, {
          ...init,
          headers: {
            ...appwriteHeaders(),
            ...(init.headers || {}),
          },
        });
        if (response.ok || response.status !== 404) {
          return { response, endpoint };
        }
        errors.push(`${endpoint}: ${response.status} ${await response.text()}`);
      } catch (error: any) {
        errors.push(`${endpoint}: ${error.message || String(error)}`);
      }
    }
    throw new Error(`Appwrite request failed on all endpoints. ${errors.join(" | ")}`);
  };

  const base64Url = (input: string | Buffer) =>
    Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const getGoogleAccessToken = async () => {
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      throw new Error("Google Meet is not configured on the server.");
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claimSet: Record<string, unknown> = {
      iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };
    if (GOOGLE_CALENDAR_IMPERSONATE) {
      claimSet.sub = GOOGLE_CALENDAR_IMPERSONATE;
    }

    const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
    const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
    const assertion = `${unsigned}.${base64Url(signature)}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      throw new Error(`Google token request failed (${tokenRes.status}): ${tokenText}`);
    }
    const token = JSON.parse(tokenText);
    return token.access_token as string;
  };

  const createGoogleMeetEvent = async (params: {
    title: string;
    scheduledAt: string;
    guests?: Array<{ name?: string; contactDetail?: string }>;
  }) => {
    const accessToken = await getGoogleAccessToken();
    const start = new Date(params.scheduledAt);
    if (Number.isNaN(start.getTime())) {
      throw new Error("Invalid scheduled date/time.");
    }
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const attendees = (params.guests || [])
      .map((guest) => String(guest.contactDetail || "").trim())
      .filter((detail) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(detail))
      .map((email) => ({ email }));

    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: params.title || "Aegis Meeting",
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees,
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      }
    );

    const eventText = await eventRes.text();
    if (!eventRes.ok) {
      throw new Error(`Google Calendar event failed (${eventRes.status}): ${eventText}`);
    }
    const event = JSON.parse(eventText);
    return {
      eventId: event.id,
      htmlLink: event.htmlLink,
      meetLink: event.hangoutLink || event.conferenceData?.entryPoints?.find((entry: any) => entry.entryPointType === "video")?.uri,
    };
  };

  app.get("/api/storage/status", async (_req: AuthenticatedRequest, res) => {
    try {
      if (!isAppwriteConfigured()) {
        return res.status(503).json({
          ok: false,
          configured: false,
          missing: {
            APPWRITE_PROJECT_ID: !APPWRITE_PROJECT_ID,
            APPWRITE_API_KEY: !APPWRITE_API_KEY,
            APPWRITE_BUCKET_ID: !APPWRITE_BUCKET_ID,
          },
        });
      }

      const { response, endpoint } = await fetchAppwrite(`/storage/buckets/${APPWRITE_BUCKET_ID}`);
      const text = await response.text();
      let details: unknown = text;
      try {
        details = text ? JSON.parse(text) : null;
      } catch {
        details = text || null;
      }
      res.status(response.ok ? 200 : response.status).json({
        ok: response.ok,
        endpoint,
        bucketId: APPWRITE_BUCKET_ID,
        details,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message || "Storage status failed" });
    }
  });

  app.post("/api/storage/upload", async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAppwriteConfigured()) {
        return res.status(503).json({ error: "Appwrite storage is not configured on the server." });
      }

      const encryptedBase64 = typeof req.body?.encryptedBase64 === "string" ? req.body.encryptedBase64 : "";
      if (!encryptedBase64) {
        return res.status(400).json({ error: "Missing encrypted file data." });
      }

      const encryptedBytes = Buffer.from(encryptedBase64, "base64");
      if (encryptedBytes.byteLength > 50 * 1024 * 1024) {
        return res.status(413).json({ error: "Encrypted file is larger than Appwrite free bucket limit." });
      }

      const fileName = cleanFileName(req.body?.fileName);
      const form = new FormData();
      form.append("fileId", "unique()");
      form.append("file", new Blob([encryptedBytes], { type: "application/octet-stream" }), fileName);

      const { response: uploadRes } = await fetchAppwrite(`/storage/buckets/${APPWRITE_BUCKET_ID}/files`, {
        method: "POST",
        body: form,
      });

      const text = await uploadRes.text();
      if (!uploadRes.ok) {
        return res.status(uploadRes.status).json({ error: "Appwrite upload failed", details: text });
      }

      const uploaded = JSON.parse(text);
      res.json({
        fileId: uploaded.$id,
        fileUrl: `/api/storage/files/${uploaded.$id}/download`,
      });
    } catch (error: any) {
      console.error("Appwrite upload error:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  });

  app.post("/api/storage/write-test", async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAppwriteConfigured()) {
        return res.status(503).json({ ok: false, error: "Appwrite storage is not configured on the server." });
      }

      const probe = Buffer.from(`aegis-write-test:${Date.now()}:${crypto.randomUUID()}`, "utf8");
      const form = new FormData();
      form.append("fileId", "unique()");
      form.append("file", new Blob([probe], { type: "text/plain" }), "aegis-write-test.txt");

      const { response: uploadRes, endpoint } = await fetchAppwrite(`/storage/buckets/${APPWRITE_BUCKET_ID}/files`, {
        method: "POST",
        body: form,
      });
      const uploadText = await uploadRes.text();
      if (!uploadRes.ok) {
        return res.status(uploadRes.status).json({ ok: false, error: "Appwrite write test failed", details: uploadText });
      }

      const uploaded = JSON.parse(uploadText);
      await fetchAppwrite(`/storage/buckets/${APPWRITE_BUCKET_ID}/files/${uploaded.$id}`, { method: "DELETE" }).catch(() => null);
      res.json({ ok: true, endpoint, bucketId: APPWRITE_BUCKET_ID, fileId: uploaded.$id });
    } catch (error: any) {
      console.error("Appwrite write test error:", error);
      res.status(500).json({ ok: false, error: error.message || "Write test failed" });
    }
  });

  app.post("/api/meet/create", async (req: AuthenticatedRequest, res) => {
    try {
      const title = cleanText(req.body?.title, 200) || "Aegis Meeting";
      const scheduledAt = cleanText(req.body?.scheduledAt, 100);
      const guests = Array.isArray(req.body?.guests) ? req.body.guests.slice(0, 50) : [];
      const result = await createGoogleMeetEvent({ title, scheduledAt, guests });
      if (!result.meetLink) {
        return res.status(502).json({ error: "Google created the event but did not return a Meet link.", details: result });
      }
      res.json(result);
    } catch (error: any) {
      console.error("Google Meet create error:", error);
      res.status(500).json({ error: error.message || "Google Meet creation failed" });
    }
  });

  app.get("/api/storage/files/:fileId/download", async (req: AuthenticatedRequest, res) => {
    try {
      if (!isAppwriteConfigured()) {
        return res.status(503).json({ error: "Appwrite storage is not configured on the server." });
      }

      const fileId = String(req.params.fileId || "").replace(/[^A-Za-z0-9_.$-]/g, "");
      if (!fileId) return res.status(400).json({ error: "Missing file ID." });

      const { response: fileRes } = await fetchAppwrite(`/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}/download`);

      if (!fileRes.ok || !fileRes.body) {
        const text = await fileRes.text();
        return res.status(fileRes.status).json({ error: "Appwrite download failed", details: text });
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "private, max-age=300");
      const bytes = Buffer.from(await fileRes.arrayBuffer());
      res.send(bytes);
    } catch (error: any) {
      console.error("Appwrite download error:", error);
      res.status(500).json({ error: error.message || "Download failed" });
    }
  });

  const createNvidiaCompletion = async (params: {
    messages: AiMessage[];
    stream?: boolean;
    maxTokens?: number;
  }) => {
    const aiClient = getAIClient();
    if (!aiClient || aiClient.type !== "nvidia") {
      throw new Error("NVIDIA client not configured");
    }

    const response = await fetch(aiClient.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${aiClient.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: aiClient.model,
        messages: params.messages,
        temperature: 0.0,
        max_tokens: params.maxTokens || DEFAULT_MAX_TOKENS,
        stream: !!params.stream,
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      const err = new Error(`NVIDIA request failed: ${response.status} ${errText}`);
      (err as any).status = response.status;
      throw err;
    }

    if (params.stream) {
      return response;
    }

    return response.json();
  };

  const createAICompletion = async (params: {
    messages: AiMessage[];
    stream?: boolean;
    maxTokens?: number;
  }) => {
    return createNvidiaCompletion(params);
  };

  const getAsOpenAICompatibleMessages = (
    history: unknown,
    userMsg?: unknown,
    imageData?: unknown,
  ): AiMessage[] => {
    const messages: AiMessage[] = [{
      role: "system",
      content: `You are Aegis Guard, the built-in AI assistant for Aegis Guard.

Speak like a helpful mid-level assistant: clear, friendly, and practical. Give enough explanation to be useful, but do not write long essays unless the user asks.

Default response style:
- Start with the direct answer.
- Use 2-5 short paragraphs or a small bullet list when it improves clarity.
- For technical or security questions, explain the reason and give actionable next steps.
- Ask one focused follow-up question only when needed.
- Be conversational and supportive, not robotic.
- Do not invent facts. If you are unsure, say what you can infer and what should be checked.

You are security-aware, so warn about scams, phishing, malware, risky links, privacy, and account safety when relevant. Do not over-warn when the user is asking ordinary questions.`,
    }];

    if (Array.isArray(history)) {
      for (const item of history.slice(-MAX_CHAT_HISTORY)) {
        if (!item || typeof item !== "object") continue;
        const role = (item as any).role;
        const content = cleanText((item as any).content, 2_000);
        if ((role === "user" || role === "assistant") && content) {
          messages.push({ role, content });
        }
      }
    }

    const text = cleanText(userMsg, 4_000) || (imageData ? "Analyze this image and answer the user's request." : "");
    const imageUrl = cleanText(imageData, 8_000_000);
    if (imageUrl.startsWith("data:image/")) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      });
    } else if (text) {
      messages.push({ role: "user", content: text });
    }
    return messages;
  };

  const extractResponseText = (response: any): string =>
    response?.choices?.[0]?.message?.content || response?.message?.content || "";

  const stripJsonFence = (value: string): string => {
    const trimmed = value.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  };

  // API wrapper for Aegis Guard Chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { userMsg, history, imageData } = req.body || {};
      const aiClient = getAIClient();
      if (!aiClient) {
        return aiUnavailableResponse(res, FAIL_CLOSED_ANALYSIS);
      }

      const messages = getAsOpenAICompatibleMessages(history, userMsg, imageData);
      if (messages.length === 1) {
        return res.status(400).json({ error: "Message or image is required." });
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const response = await createNvidiaCompletion({ messages, stream: true });
      if (!response.body) {
        throw new Error("NVIDIA stream body unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.replace("data: ", "").trim();
          if (dataStr === "[DONE]") continue;
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content || "";
            if (content) {
              res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
          } catch (e) {
            console.warn("NVIDIA stream parse error", e);
          }
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      if (!res.headersSent) {
          if (error?.status === 429) {
              res.status(429).json({ error: "Rate limit exceeded. Please wait a few seconds before sending another message." });
          } else {
              res.status(500).json({ error: error.message });
          }
      } else {
          res.write(`data: ${JSON.stringify({ error: error.message || 'Stream error' })}\n\n`);
          res.end();
      }
    }
  });

  // API wrapper for Message Analysis
  app.post("/api/analyze", async (req, res) => {
    try {
      const { content, contentHash, fileDataInfo } = req.body || {};
      const aiClient = getAIClient();
      if (!aiClient) {
        return aiUnavailableResponse(res, FAIL_CLOSED_ANALYSIS);
      }
      
      const systemPrompt = `You are a Cybersecurity Analyst. Respond with MINIMAL JSON.

      1. STEGANOGRAPHY (Images): Look for LSB manipulation or spectral noise signaling hidden payloads. Extract, decode, and put result in 'steganographyReport'.
      2. CRYPTOGRAPHY:
         - PASS: Normal text, valid/contextual E2EE (standard length, structure), short base64/hex blocks.
         - FLAG: Recursive encoding (e.g., base64 inside URL-encoded string), obfuscated code injection, non-standard high-entropy patterns that do NOT match common E2EE protocols.
      3. PHISHING: Flag malicious links/domains and deceit context.
      4. DOCUMENTS (PDFs): If analyzing a PDF, look for embedded scripts, phishing links, malicious macros, or deceptive content. Say whether the document is safe.
      5. SCORE: 0(Critical)-100(Safe).
      6. EXPLAIN: BRIEF.`;

      const safeContent = cleanText(content, 6_000);
      const mimeType = cleanText(fileDataInfo?.mimeType, 100);
      const attachmentText =
        mimeType === "application/pdf"
          ? cleanText(fileDataInfo?.data, 12_000)
          : "";
      const userPrompt = `Analyze this message. Hash ID: ${cleanText(contentHash, 100)}
      ${safeContent ? `Message: "${safeContent}"` : 'Message for file/image analysis.'}
      ${fileDataInfo ? `An attachment is present (${mimeType || "unknown type"}).` : ''}
      ${attachmentText ? `Extracted PDF text:\n${attachmentText}` : ''}
      
      Respond as JSON with these fields: isSafe (boolean), score (0-100), threatType (string), summary (string), points (array of strings), steganographyReport (string)`;

      const userContent: MessageContent =
        mimeType.startsWith("image/") && typeof fileDataInfo?.data === "string" && fileDataInfo.data.startsWith("data:image/")
          ? [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: fileDataInfo.data.slice(0, 8_000_000) } },
            ]
          : userPrompt;

      const messages: AiMessage[] = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userContent }
      ];

      const response = await createAICompletion({ messages, maxTokens: 260 });

      res.json({ text: stripJsonFence(extractResponseText(response) || '{}') });
    } catch (error: any) {
      if (error?.status === 429 || error?.status === 404 || error?.status === 503) {
        res.status(503).json({ text: FAIL_CLOSED_ANALYSIS });
        return;
      }
      console.error("AI Analyze Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API wrapper for Call Analysis
  app.post("/api/analyze-call", async (req, res) => {
    try {
      const { transcript } = req.body;
      const aiClient = getAIClient();
      if (!aiClient) {
        return aiUnavailableResponse(res, FAIL_CLOSED_CALL);
      }
      const systemPrompt = `You are an advanced Cybersecurity Analyst specializing in real-time Vishing (Voice Phishing) detection.
      Your task is to analyze call transcripts for sophisticated social engineering and fraud markers:

      1. IMPERSONATION & AUTHORITY:
         - Detect impersonation of banks, government agencies (IRS, SSA), tech support (Microsoft, Apple), or law enforcement.
         - Look for "official" sounding language designed to bypass critical thinking.

      2. PSYCHOLOGICAL MANIPULATION:
         - Identify high-pressure tactics: threats of legal action, account suspension, or immediate financial loss.
         - Detect "urgency" markers that discourage the victim from verifying the caller's identity.

      3. SENSITIVE DATA HARVESTING:
         - Flag requests for: One-Time Passwords (OTPs), full Social Security Numbers, bank account details, or credit card CVVs.
         - Look for instructions to download remote access software (AnyDesk, TeamViewer).

      4. UNUSUAL PAYMENT METHODS:
         - Identify requests for payment via: gift cards (iTunes, Amazon), wire transfers (Western Union), or cryptocurrency.

      Provide a technical breakdown of the threat markers detected.`;

      const userPrompt = `Analyze this call transcript for Vishing threats:
        
        Transcript: "${transcript}"
        
        Perform the deep security scan as per your instructions.
        Respond as JSON with: isSafe (boolean), threatType (string), summary (string), points (array of strings)`;

      const messages: AiMessage[] = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userPrompt }
      ];

      const response = await createAICompletion({ messages, maxTokens: 220 });

      res.json({ text: stripJsonFence(extractResponseText(response) || '{}') });
    } catch (error: any) {
      if (error?.status === 429 || error?.status === 404 || error?.status === 503) {
        res.status(503).json({ text: FAIL_CLOSED_CALL });
        return;
      }
      console.error("AI Call Analyze Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API wrapper for Group Analysis
  app.post("/api/analyze-group", async (req, res) => {
    try {
        const { groupName, participantCount, creatorInfo } = req.body;
        const aiClient = getAIClient();
        if (!aiClient) {
          return aiUnavailableResponse(res, FAIL_CLOSED_GROUP);
        }
        const systemPrompt = `You are an advanced Cybersecurity Analyst specializing in Group Chat Verification.
        Your task is to analyze new group creation metadata to identify potential "Data Harvesting" or "Scam" groups.
        
        CRITERIA FOR VERIFICATION:
        1. GROUP NAME ANALYSIS:
           - Flag names that impersonate official entities (e.g., "Official Support", "Bank Admin", "WhatsApp Security").
           - Flag names that promise unrealistic rewards (e.g., "Free Crypto Giveaway", "Earn $1000 Daily").
           - Flag names that use excessive symbols or obfuscated characters to bypass filters.
           - Verified groups usually have descriptive, non-aggressive, and logical names.
  
        2. CREATOR REPUTATION (Simulated):
           - Analyze the creator's intent based on the group name and context.
           
        3. PARTICIPANT DENSITY:
           - Large groups created with suspicious names are high-risk.
  
        You MUST provide:
        - A verification status: 'verified' (safe), 'suspicious' (high risk), or 'unverified' (neutral/unknown).
        - A clear reason for the status.
        - A list of specific threat markers if any.`;

        const userPrompt = `Analyze this new group for verification:
            
            Group Name: "${groupName}"
            Initial Participant Count: ${participantCount}
            Creator Context: "${creatorInfo}"
            
            Perform the group verification scan as per your instructions.
            Respond as JSON with: isVerified (boolean), status (string: "verified"|"suspicious"|"unverified"), reason (string), threatMarkers (array of strings)`;

        const messages: AiMessage[] = [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: userPrompt }
        ];

        const response = await createAICompletion({ messages, maxTokens: 180 });
          
        res.json({ text: stripJsonFence(extractResponseText(response) || '{}') });
    } catch (error: any) {
        if (error?.status === 429 || error?.status === 404 || error?.status === 503) {
          res.status(503).json({ text: FAIL_CLOSED_GROUP });
          return;
        }
        console.error("AI Group Analyze Error:", error);
        res.status(500).json({ error: error.message });
    }
  });

  // Threat Explanation Engine
  app.post("/api/threat-explain", async (req, res) => {
    try {
      const { content, indicators, urlScanResults, attachmentScan } = req.body;
      const aiClient = getAIClient();
      if (!aiClient) {
        return res.status(503).json({
          explanation: "Threat explanation unavailable because no AI API key is configured.",
          incidentReport: "Automated incident report generation failed.",
        });
      }

      const userPrompt = `Analyze these security findings and provide:
        1. A clear explanation for the user (2-3 sentences)
        2. A formal incident report (structured, for security team)

        Message content: "${content || 'N/A'}"
        Indicators: ${JSON.stringify(indicators || [])}
        URL Scan: ${JSON.stringify(urlScanResults || [])}
        Attachment Scan: ${JSON.stringify(attachmentScan || {})}

        Respond as JSON with keys: explanation, incidentReport`;

      const messages: AiMessage[] = [{ role: "user", content: userPrompt }];

      const response = await createAICompletion({ messages, maxTokens: 260 });
      const responseContent = stripJsonFence(extractResponseText(response) || '{}');
      
      try {
        const result = JSON.parse(responseContent);
        res.json(result);
      } catch (parseError) {
        console.warn("JSON parse error, returning raw content:", parseError);
        res.json({ explanation: responseContent, incidentReport: responseContent });
      }
    } catch (error: any) {
      console.error("Threat Explain Error:", error);
      res.status(503).json({
        explanation: "Threat analysis unavailable. Do not trust this content until manually reviewed.",
        incidentReport: "Automated incident report generation failed. Escalate to security team.",
      });
    }
  });

  // AI Malware Risk Scoring
  app.post("/api/malware-score", async (req, res) => {
    try {
      const { fileName, mimeType, fileDataInfo } = req.body;
      const aiClient = getAIClient();
      if (!aiClient) {
        return res.status(503).json({ error: "AI service unavailable because no AI API key is configured." });
      }

      const userPrompt = `Score malware risk for file: "${fileName}" (${mimeType}). Return risk score 0-100 and findings.
        Respond as JSON with: malwareScore (number), isSafe (boolean), findings (array of strings), summary (string)`;

      const messages: AiMessage[] = [{ role: "user", content: userPrompt }];
      const response = await createAICompletion({ messages, maxTokens: 180 });
      const content = stripJsonFence(extractResponseText(response) || '{}');
      
      try {
        res.json(JSON.parse(content));
      } catch (parseError) {
        console.warn("Malware score JSON parse error:", parseError);
        res.json({ malwareScore: 50, isSafe: false, findings: [content], summary: "Unable to parse response" });
      }    } catch (error: any) {
      console.error("Malware Score Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Security Assistant (enhanced)
  app.post("/api/security-assistant", async (req, res) => {
    try {
      const { question, threatContext } = req.body;
      const aiClient = getAIClient();
      if (!aiClient) {
        return res.status(503).json({ error: "AI service unavailable because no AI API key is configured." });
      }

      const userPrompt = `You are Aegis Security Assistant. Answer this security question concisely.
        ${threatContext ? `Threat context: ${JSON.stringify(threatContext)}` : ''}
        Question: ${question}`;

      const messages: AiMessage[] = [
        { role: "system" as const, content: "You are an expert cybersecurity assistant built into Aegis Guard. Provide clear, actionable security advice." },
        { role: "user" as const, content: userPrompt }
      ];

      const response = await createAICompletion({ messages, maxTokens: 220 });

      res.json({ answer: extractResponseText(response) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Clear-Site-Data', '"cache"');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Clear-Site-Data', '"cache"');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
  });
}

startServer();
