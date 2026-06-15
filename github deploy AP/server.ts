import dotenv from "dotenv";
import fs from "fs";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { requireFirebaseAuth } from "./server/authMiddleware";

const envBasePath = path.resolve(process.cwd(), ".env");
const envLocalPath = path.resolve(process.cwd(), ".env.local");
dotenv.config({ path: envBasePath });
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const DEFAULT_NVIDIA_URL = process.env.NVIDIA_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct";

type AiClient =
  | { type: "nvidia"; apiKey: string; url: string; model: string };

const getAIClient = (): AiClient | null => {
  if (process.env.NVIDIA_API_KEY) {
    console.log("NVIDIA API key loaded");
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
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  app.use(express.json({ limit: "16mb" }));
  app.use("/api", requireFirebaseAuth);

  const DEFAULT_MAX_TOKENS = 220;
  const MAX_CHAT_HISTORY = 10;
  const MAX_TEXT_LENGTH = 12_000;

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

  const cleanText = (value: unknown, maxLength = MAX_TEXT_LENGTH) =>
    typeof value === "string" ? value.trim().slice(0, maxLength) : "";

  const getAsOpenAICompatibleMessages = (
    history: unknown,
    userMsg?: unknown,
    imageData?: unknown,
  ): AiMessage[] => {
    const messages: AiMessage[] = [{
      role: "system",
      content: "You are Aegis Guard, a concise security-aware assistant. Answer directly and do not invent facts.",
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

  const extractJsonObject = (value: string): Record<string, any> | null => {
    const cleaned = stripJsonFence(value).replace(/^\s*json\s*/i, "");
    try {
      const parsed = JSON.parse(cleaned);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      // NVIDIA may wrap the object in prose or markdown.
    }

    for (let start = cleaned.indexOf("{"); start >= 0; start = cleaned.indexOf("{", start + 1)) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < cleaned.length; i++) {
        const char = cleaned[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') inString = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          try {
            return JSON.parse(cleaned.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
    return null;
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
      
      const systemPrompt = `You are a Cybersecurity Analyst. Return exactly one valid JSON object with no markdown or commentary.

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
      const raw = extractResponseText(response);
      const parsed = extractJsonObject(raw);
      if (!parsed) {
        console.warn("NVIDIA returned unstructured analysis:", raw.slice(0, 500));
        return res.status(502).json({ text: FAIL_CLOSED_ANALYSIS });
      }

      const isSafe = parsed.isSafe === true;
      const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
      res.json({ text: JSON.stringify({
        isSafe,
        score: isSafe && score === 0 ? 100 : score,
        threatType: isSafe ? "none" : cleanText(parsed.threatType, 50) || "unknown",
        summary: cleanText(parsed.summary, 500) || "Analysis completed.",
        points: Array.isArray(parsed.points) ? parsed.points.slice(0, 8).map((point: unknown) => cleanText(point, 300)) : [],
        steganographyReport: cleanText(parsed.steganographyReport, 1_000) || "N/A",
      }) });
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
        { role: "system" as const, content: "You are an expert cybersecurity assistant built into Aegis Messenger. Provide clear, actionable security advice." },
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { maxAge: '1y', immutable: true }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
