import { EncryptionService } from './encryptionService';

export function resolveSessionKey(
  userUid: string,
  userEmail: string | null | undefined,
  singleKey?: string,
  keyMap?: Record<string, string>,
): string | undefined {
  if (keyMap) {
    if (keyMap[userUid]) return keyMap[userUid];
    const email = userEmail?.toLowerCase() || '';
    if (email && keyMap[email]) return keyMap[email];
    const entry = Object.entries(keyMap).find(([k]) => email && k.toLowerCase() === email);
    if (entry) return entry[1];
  }
  return singleKey;
}

export function mimeFromFileName(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.txt') || n.endsWith('.log')) return 'text/plain';
  if (n.endsWith('.md')) return 'text/markdown';
  if (n.endsWith('.csv')) return 'text/csv';
  if (n.endsWith('.json')) return 'application/json';
  if (n.endsWith('.xml')) return 'application/xml';
  if (n.endsWith('.html') || n.endsWith('.htm')) return 'text/html';
  if (n.endsWith('.yml') || n.endsWith('.yaml')) return 'text/yaml';
  if (n.endsWith('.rtf')) return 'application/rtf';
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (n.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (n.endsWith('.odt')) return 'application/vnd.oasis.opendocument.text';
  if (n.endsWith('.ods')) return 'application/vnd.oasis.opendocument.spreadsheet';
  if (n.endsWith('.odp')) return 'application/vnd.oasis.opendocument.presentation';
  if (n.endsWith('.doc')) return 'application/msword';
  if (n.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (n.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (n.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

export interface MediaFields {
  content: string;
  text?: string;
  iv?: string;
  encryptedSessionKey?: string;
  encryptedSessionKeys?: Record<string, string>;
  imageUrl?: string;
  imageIv?: string;
  imagePrefix?: string;
  encryptedImageSessionKey?: string;
  encryptedImageSessionKeys?: Record<string, string>;
  fileName?: string;
  fileNameIv?: string;
  encryptedFileNameSessionKey?: string;
  encryptedFileNameSessionKeys?: Record<string, string>;
  fileUrl?: string;
  fileData?: string;
  fileDataIv?: string;
  encryptedFileDataSessionKey?: string;
  encryptedFileDataSessionKeys?: Record<string, string>;
  type?: string;
  voiceMessage?: unknown;
  deletedForEveryone?: boolean;
}

export interface DecryptedMedia {
  decryptedContent: string;
  decryptedImageUrl?: string;
  decryptedFileName?: string;
  decryptedFileData?: string;
  decryptedVoiceUrl?: string;
}

function isRemoteEncryptedUrl(url?: string): boolean {
  return !!url && (url.startsWith('http') || url.startsWith('/api/storage/'));
}

export async function decryptMessageMedia(
  m: MediaFields,
  userUid: string,
  userEmail: string | null | undefined,
  privateKey: string,
): Promise<DecryptedMedia> {
  if (m.deletedForEveryone) {
    return { decryptedContent: '🚫 This message was deleted' };
  }

  let decryptedContent = m.content;
  let decryptedImageUrl: string | undefined;
  let decryptedFileName: string | undefined;
  let decryptedFileData: string | undefined;
  let decryptedVoiceUrl: string | undefined;

  const sessionKey = resolveSessionKey(userUid, userEmail, m.encryptedSessionKey, m.encryptedSessionKeys);
  const imageKey = resolveSessionKey(userUid, userEmail, m.encryptedImageSessionKey, m.encryptedImageSessionKeys);
  const nameKey = resolveSessionKey(userUid, userEmail, m.encryptedFileNameSessionKey, m.encryptedFileNameSessionKeys);
  const dataKey = resolveSessionKey(userUid, userEmail, m.encryptedFileDataSessionKey, m.encryptedFileDataSessionKeys);

  if (m.iv) {
    if (sessionKey) {
      try {
        decryptedContent = await EncryptionService.decrypt(m.content, sessionKey, m.iv, privateKey);
      } catch {
        decryptedContent = m.text || '[Unable to decrypt message]';
      }
    } else {
      decryptedContent = m.text || '[Encrypted before you joined]';
    }
  }

  if (m.imageUrl && imageKey && m.imageIv && m.imageUrl !== 'uploading...') {
    try {
      const b64 = isRemoteEncryptedUrl(m.imageUrl)
        ? await EncryptionService.decryptFileUrl(m.imageUrl, imageKey, m.imageIv, privateKey)
        : await EncryptionService.decrypt(m.imageUrl, imageKey, m.imageIv, privateKey, true);
      decryptedImageUrl = `${m.imagePrefix || 'data:image/png;base64,'}${b64}`;
    } catch {
      console.warn('Failed to decrypt image');
    }
  }

  if (m.fileName && nameKey && m.fileNameIv) {
    try {
      decryptedFileName = await EncryptionService.decrypt(m.fileName, nameKey, m.fileNameIv, privateKey);
    } catch {
      console.warn('Failed to decrypt file name');
    }
  } else if (m.fileName && !m.fileNameIv) {
    try {
      decryptedFileName = new TextDecoder().decode(EncryptionService.str2ab(atob(m.fileName)));
    } catch {
      // ignore legacy plain-file-name format
    }
  }

  // Inline encrypted file blob (legacy)
  if (m.fileData && dataKey && m.fileDataIv && m.fileUrl !== 'uploading...') {
    try {
      // Documents are binary: decoding the decrypted buffer as text corrupts it,
      // so keep the bytes and rebuild a data URL that can actually be saved.
      const b64 = await EncryptionService.decrypt(m.fileData, dataKey, m.fileDataIv, privateKey, true);
      const mime = mimeFromFileName(decryptedFileName || 'file');
      decryptedFileData = `data:${mime};base64,${b64}`;
    } catch {
      console.warn('Failed to decrypt inline file data');
    }
  } else if (m.fileData && !m.fileDataIv) {
    try {
      if (m.fileData.startsWith('data:')) {
        decryptedFileData = m.fileData;
      } else {
        decryptedFileData = `data:${mimeFromFileName(m.fileName || 'file')};base64,${m.fileData}`;
      }
    } catch {
      // ignore plain file data fallback
    }
  }

  // E2EE files in remote storage (B2 or legacy Firebase/Appwrite)
  if (!decryptedFileData && isRemoteEncryptedUrl(m.fileUrl) && dataKey && m.fileDataIv) {
    try {
      const b64 = await EncryptionService.decryptFileUrl(m.fileUrl, dataKey, m.fileDataIv, privateKey);
      const mime = mimeFromFileName(decryptedFileName || 'file');
      decryptedFileData = `data:${mime};base64,${b64}`;
    } catch {
      console.warn('Failed to decrypt file from storage');
    }
  }

  if (!decryptedImageUrl && decryptedFileData && decryptedFileName) {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(decryptedFileName)) {
      decryptedImageUrl = decryptedFileData;
    }
  }

  if (m.type === 'voice' && isRemoteEncryptedUrl(m.fileUrl) && dataKey && m.fileDataIv) {
    try {
      const b64 = await EncryptionService.decryptFileUrl(m.fileUrl, dataKey, m.fileDataIv, privateKey);
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      decryptedVoiceUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/webm' }));
    } catch {
      console.warn('Failed to decrypt voice message');
    }
  }

  return { decryptedContent, decryptedImageUrl, decryptedFileName, decryptedFileData, decryptedVoiceUrl };
}

/** Payloads that are not real file content and must never be decoded. */
const NON_PAYLOAD_VALUES = new Set(['', 'inline', 'uploading...', 'uploading', 'undefined', 'null']);

export function isUsableFilePayload(value?: string | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || NON_PAYLOAD_VALUES.has(trimmed)) return false;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('http')) return true;
  if (trimmed.startsWith('/api/')) return true;
  // Raw base64 payload.
  return /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.replace(/[^A-Za-z0-9+/=]/g, '').length >= 8;
}

/**
 * Resolve the decrypted bytes of a message attachment as a `data:` URL.
 * Works for inline ciphertext, object storage (B2/Appwrite) and legacy plaintext
 * payloads, so the download button behaves the same in every case.
 */
export async function resolveMessageFileData(
  m: MediaFields,
  userUid: string,
  userEmail: string | null | undefined,
  privateKey: string,
  decryptedFileName?: string,
): Promise<string | undefined> {
  const dataKey = resolveSessionKey(userUid, userEmail, m.encryptedFileDataSessionKey, m.encryptedFileDataSessionKeys);
  const mime = mimeFromFileName(decryptedFileName || m.fileName || 'file');

  // 1. Inline ciphertext.
  if (m.fileData && dataKey && m.fileDataIv) {
    try {
      const b64 = await EncryptionService.decrypt(m.fileData, dataKey, m.fileDataIv, privateKey, true);
      return `data:${mime};base64,${b64}`;
    } catch {
      console.warn('Inline file decryption failed, trying stored copy');
    }
  }

  // 2. Legacy plaintext inline payload.
  if (m.fileData && !m.fileDataIv && isUsableFilePayload(m.fileData)) {
    return m.fileData.startsWith('data:')
      ? m.fileData
      : `data:${mime};base64,${m.fileData}`;
  }

  // 3. Encrypted copy in object storage.
  if (m.fileUrl && isUsableFilePayload(m.fileUrl) && dataKey && m.fileDataIv && isRemoteEncryptedUrl(m.fileUrl)) {
    const b64 = await EncryptionService.decryptFileUrl(m.fileUrl, dataKey, m.fileDataIv, privateKey);
    return `data:${mime};base64,${b64}`;
  }

  return undefined;
}

/** Shrink image data URLs for AI analysis (Gemini inline limit). */
export async function shrinkForAnalysis(dataUrl: string, maxDim = 1024): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  if (dataUrl.length < 800_000) return dataUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => reject(new Error('Image resize failed'));
    img.src = dataUrl;
  });
}

const IGNORED_DOCUMENT_URL = /schemas\.openxmlformats\.org|schemas\.microsoft\.com|w3\.org|purl\.org|openoffice\.org\/namespaces|adobe\.com\/xap|ns\.adobe\.com/i;

function summarizePdfStructure(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(bytes);
  const urls = [...new Set(raw.match(/https?:\/\/[^\s<>()\[\]{}"']+/gi) ?? [])]
    .filter((url) => !IGNORED_DOCUMENT_URL.test(url))
    .slice(0, 20);
  const markers = [
    ['/JavaScript', 'Embedded JavaScript action'],
    ['/JS', 'JavaScript action shortcut'],
    ['/OpenAction', 'Automatic open action'],
    ['/AA', 'Additional automatic action'],
    ['/Launch', 'Launch action'],
    ['/EmbeddedFile', 'Embedded file attachment'],
    ['/AcroForm', 'Interactive form'],
  ]
    .filter(([token]) => raw.includes(token))
    .map(([, label]) => label);

  const parts: string[] = [];
  if (urls.length) parts.push(`Links found:\n${urls.join('\n')}`);
  if (markers.length) parts.push(`PDF security markers:\n${markers.join('\n')}`);
  return parts.join('\n\n');
}

async function extractPdfText(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const structureReport = summarizePdfStructure(bytes);
  const pages: string[] = [];

  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();

    const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: true } as any).promise;
    const pageCount = Math.min(pdf.numPages, 8);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => item.str || '').join(' '));
      if (pages.join('\n').length >= 12_000) break;
    }
  } catch (error) {
    console.warn('PDF text extraction failed', error);
  }

  return [pages.join('\n'), structureReport].filter(Boolean).join('\n\n').slice(0, 12_000);
}

const TEXT_DOCUMENT_MIME = /^(text\/|application\/(json|xml|rtf|javascript|x-www-form-urlencoded))/i;
const ARCHIVE_DOCUMENT_MIME = /(officedocument|opendocument|msword|ms-excel|ms-powerpoint|zip|rtf)/i;

function base64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeTextDocument(dataUrl: string, limit = 12_000): string {
  try {
    return new TextDecoder('utf-8').decode(base64ToBytes(dataUrl)).slice(0, limit);
  } catch {
    return '';
  }
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

/** Read the ZIP central directory of an OOXML/ODF/zip container. */
function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const minOffset = Math.max(0, bytes.length - 65_557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count && offset + 46 <= bytes.length; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      name: new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.localOffset + 30 > bytes.length) return null;
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) return null;

  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) return null;

  const raw = bytes.subarray(start, end);
  if (entry.method === 0) return raw;
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') return null;

  try {
    const source = new Uint8Array(raw).buffer;
    const stream = new Blob([source]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Extract readable text and links from OOXML/ODF/zip documents for analysis. */
async function extractArchiveDocumentText(dataUrl: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(dataUrl);
  } catch {
    return '';
  }

  const entries = listZipEntries(bytes);
  if (entries.length === 0) return '';

  const texts: string[] = [];
  const urls = new Set<string>();
  let budget = 600_000;

  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (!name.endsWith('.xml') && !name.endsWith('.txt') && !name.endsWith('.rels')) continue;
    if (entry.compressedSize > 2_000_000 || budget <= 0) continue;

    const data = await readZipEntry(bytes, entry);
    if (!data?.length) continue;
    budget -= data.length;

    const xml = new TextDecoder('utf-8').decode(data.subarray(0, Math.min(data.length, 400_000)));
    for (const url of xml.match(/https?:\/\/[^\s<>"')\]}]+/g) ?? []) {
      if (!IGNORED_DOCUMENT_URL.test(url)) urls.add(url);
    }

    const plain = xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (plain) texts.push(plain);
    if (texts.join(' ').length > 12_000) break;
  }

  const parts: string[] = [];
  const body = texts.join(' ').slice(0, 12_000);
  if (body) parts.push(body);
  if (urls.size > 0) parts.push(`Links found:\n${[...urls].slice(0, 20).join('\n')}`);
  return parts.join('\n\n');
}

function describeUnreadableAttachment(mimeType: string, fileName?: string): string {
  return `[No text could be extracted from "${fileName || 'attachment'}" (type: ${mimeType}). Only file metadata is available for this attachment.]`;
}

export async function buildFileDataInfo(
  decryptedImageUrl?: string,
  decryptedFileData?: string,
  decryptedFileName?: string,
): Promise<{ data: string; mimeType: string } | undefined> {
  let data = decryptedImageUrl || decryptedFileData;
  if (!data) return undefined;

  let mimeType = 'application/octet-stream';
  if (data.startsWith('data:')) {
    mimeType = data.split(';')[0].split(':')[1] || mimeType;
  } else if (decryptedFileName) {
    mimeType = mimeFromFileName(decryptedFileName);
    data = `data:${mimeType};base64,${data}`;
  }

  if (mimeType.startsWith('image/')) {
    data = await shrinkForAnalysis(data);
    return { data, mimeType };
  }

  if (!data.startsWith('data:')) return { data, mimeType };

  if (mimeType === 'application/pdf') {
    const pdfText = await extractPdfText(data);
    data = pdfText || describeUnreadableAttachment(mimeType, decryptedFileName);
  } else if (ARCHIVE_DOCUMENT_MIME.test(mimeType)) {
    const archiveText = await extractArchiveDocumentText(data);
    data = archiveText || describeUnreadableAttachment(mimeType, decryptedFileName);
  } else if (TEXT_DOCUMENT_MIME.test(mimeType)) {
    const text = decodeTextDocument(data).trim();
    data = text || describeUnreadableAttachment(mimeType, decryptedFileName);
  } else {
    data = describeUnreadableAttachment(mimeType, decryptedFileName);
  }

  return { data, mimeType };
}

