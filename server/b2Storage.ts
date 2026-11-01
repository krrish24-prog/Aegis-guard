import * as crypto from "crypto";

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
export const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;

export interface B2Config {
  keyId: string;
  applicationKey: string;
  bucketName: string;
  region: string;
  endpoint: string;
}

export interface B2ListProbe {
  ok: true;
  bucket: string;
  region: string;
  endpoint: string;
  keyCount: number;
}

export class B2RequestError extends Error {
  status: number;
  operation: string;

  constructor(operation: string, status: number, details: string) {
    super(`B2 ${operation} failed (${status}): ${details.slice(0, 300)}`);
    this.name = "B2RequestError";
    this.status = status;
    this.operation = operation;
  }
}

/** Read B2 settings from the environment. Returns null until all required values are set. */
export function getB2Config(env: NodeJS.ProcessEnv = process.env): B2Config | null {
  const keyId = (env.B2_KEY_ID || "").trim();
  const applicationKey = (env.B2_APPLICATION_KEY || "").trim();
  const bucketName = (env.B2_BUCKET_NAME || "").trim();
  const region = (env.B2_REGION || "").trim();
  if (!keyId || !applicationKey || !bucketName || !region) return null;

  // Accept both "s3.<region>.backblazeb2.com" and "https://s3.<region>.backblazeb2.com".
  const endpointHost = (env.B2_ENDPOINT || `s3.${region}.backblazeb2.com`)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!endpointHost) return null;

  return { keyId, applicationKey, bucketName, region, endpoint: `https://${endpointHost}` };
}

export function isB2Configured(): boolean {
  return getB2Config() !== null;
}

/** RFC 3986 encoding as required by SigV4 (encodeURIComponent leaves a few characters alone). */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeKeyPath(key: string): string {
  return key.split("/").map(encodeRfc3986).join("/");
}

function sha256Hex(value: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: crypto.BinaryLike, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalQueryFromUrl(url: URL): string {
  const entries: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => entries.push([key, value]));
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return entries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function canonicalQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key])}`)
    .join("&");
}

function signingKey(config: B2Config, dateStamp: string): Buffer {
  const dateKey = hmac(`AWS4${config.applicationKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function signatureFor(
  config: B2Config,
  dateStamp: string,
  amzDate: string,
  canonicalRequest: string
): { signature: string; credentialScope: string } {
  const credentialScope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = crypto
    .createHmac("sha256", signingKey(config, dateStamp))
    .update(stringToSign, "utf8")
    .digest("hex");
  return { signature, credentialScope };
}

export interface SignS3RequestOptions {
  method: string;
  url: string;
  payloadHash: string;
  now?: Date;
  /** Extra headers to sign and send, e.g. content-type. Host is added automatically. */
  extraHeaders?: Record<string, string>;
}

/** Sign a normal (header-based) S3 request. Returns headers ready for fetch(). */
export function signS3Request(
  config: B2Config,
  options: SignS3RequestOptions
): Record<string, string> {
  const { method, url, payloadHash, now = new Date(), extraHeaders = {} } = options;
  const parsed = new URL(url);
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  const signedHeaderValues: Record<string, string> = {
    host: parsed.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  for (const [name, value] of Object.entries(extraHeaders)) {
    signedHeaderValues[name.toLowerCase()] = value.trim();
  }

  const signedHeaderNames = Object.keys(signedHeaderValues).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${signedHeaderValues[name]}\n`)
    .join("");
  const canonicalRequest = [
    method.toUpperCase(),
    parsed.pathname || "/",
    canonicalQueryFromUrl(parsed),
    canonicalHeaders,
    signedHeaderNames.join(";"),
    payloadHash,
  ].join("\n");

  const { signature, credentialScope } = signatureFor(
    config,
    dateStamp,
    amzDate,
    canonicalRequest
  );

  const headers: Record<string, string> = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: `${ALGORITHM} Credential=${config.keyId}/${credentialScope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`,
  };
  for (const [name, value] of Object.entries(extraHeaders)) {
    // Host is set by fetch itself; sending it manually can cause a mismatch.
    if (name.toLowerCase() !== "host") headers[name] = value;
  }
  return headers;
}

/** Build a stable S3 object URL using path-style addressing. */
export function b2ObjectUrl(config: B2Config, key: string): string {
  const bucketUrl = `${config.endpoint}/${encodeRfc3986(config.bucketName)}`;
  return key ? `${bucketUrl}/${encodeKeyPath(key)}` : bucketUrl;
}

/** Create a presigned GET URL. B2 accepts at most seven days. */
export function createPresignedGetUrl(
  config: B2Config,
  objectUrl: string,
  expiresInSeconds: number = MAX_PRESIGN_SECONDS,
  now: Date = new Date()
): string {
  const parsed = new URL(objectUrl);
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const expires = Math.min(
    MAX_PRESIGN_SECONDS,
    Math.max(1, Math.floor(expiresInSeconds))
  );

  const params: Record<string, string> = {
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${config.keyId}/${dateStamp}/${config.region}/${SERVICE}/aws4_request`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = canonicalQueryString(params);
  const canonicalRequest = [
    "GET",
    parsed.pathname || "/",
    canonicalQuery,
    `host:${parsed.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const { signature } = signatureFor(config, dateStamp, amzDate, canonicalRequest);
  return `${parsed.origin}${parsed.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Sanitize a file name and build a collision-free, console-friendly B2 key. */
export function buildB2ObjectKey(
  prefix: "media" | "status",
  ownerId: string,
  fileName: string
): string {
  const safePrefix = prefix === "status" ? "status" : "media";
  const owner =
    (ownerId || "unknown").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "unknown";
  const baseName =
    (fileName || "file.bin")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(-80) || "file.bin";
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${safePrefix}/${owner}/${year}${month}/${crypto.randomUUID()}-${baseName}`;
}

export async function putB2Object(
  config: B2Config,
  key: string,
  body: Buffer,
  contentType = "application/octet-stream"
): Promise<void> {
  const url = b2ObjectUrl(config, key);
  const headers = signS3Request(config, {
    method: "PUT",
    url,
    payloadHash: sha256Hex(body),
    extraHeaders: { "content-type": contentType },
  });

  const response = await fetch(url, { method: "PUT", headers, body });
  if (!response.ok) {
    throw new B2RequestError("upload", response.status, await response.text());
  }
}

export async function deleteB2Object(config: B2Config, key: string): Promise<void> {
  const url = b2ObjectUrl(config, key);
  const headers = signS3Request(config, {
    method: "DELETE",
    url,
    payloadHash: sha256Hex(""),
  });

  const response = await fetch(url, { method: "DELETE", headers });
  if (!response.ok && response.status !== 404) {
    throw new B2RequestError("delete", response.status, await response.text());
  }
}

export async function getB2Object(
  config: B2Config,
  key: string
): Promise<{ body: Buffer; contentType: string; contentLength: number | null }> {
  const url = b2ObjectUrl(config, key);
  const headers = signS3Request(config, {
    method: "GET",
    url,
    payloadHash: sha256Hex(""),
  });

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new B2RequestError("download", response.status, await response.text());
  }

  const contentLengthHeader = response.headers.get("content-length");
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentLength: contentLengthHeader ? Number(contentLengthHeader) : null,
  };
}

/** List one object so /api/storage/status can prove the key can read the bucket. */
export async function probeB2(config: B2Config): Promise<B2ListProbe> {
  const url = new URL(b2ObjectUrl(config, ""));
  url.searchParams.set("list-type", "2");
  url.searchParams.set("max-keys", "1");

  const headers = signS3Request(config, {
    method: "GET",
    url: url.toString(),
    payloadHash: sha256Hex(""),
  });

  const response = await fetch(url.toString(), { headers });
  const text = await response.text();
  if (!response.ok) {
    throw new B2RequestError("status check", response.status, text);
  }

  const keyCount = Number(text.match(/<KeyCount>(\d+)<\/KeyCount>/)?.[1] || 0);
  return {
    ok: true,
    bucket: config.bucketName,
    region: config.region,
    endpoint: config.endpoint,
    keyCount,
  };
}
