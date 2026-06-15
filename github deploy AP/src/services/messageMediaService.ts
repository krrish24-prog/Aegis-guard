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
  if (n.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

export interface MediaFields {
  content: string;
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
        decryptedContent = '🔒 [Unable to decrypt message]';
      }
    } else {
      decryptedContent = '🔒 [Encrypted before you joined]';
    }
  }

  if (m.imageUrl && imageKey && m.imageIv && m.imageUrl !== 'uploading...') {
    try {
      const b64 = m.imageUrl.startsWith('http')
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
      decryptedFileData = await EncryptionService.decrypt(m.fileData, dataKey, m.fileDataIv, privateKey);
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

  // E2EE files in Firebase Storage
  if (!decryptedFileData && m.fileUrl?.startsWith('http') && dataKey && m.fileDataIv) {
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

  if (m.type === 'voice' && m.fileUrl?.startsWith('http') && dataKey && m.fileDataIv) {
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

async function extractPdfText(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pageCount = Math.min(pdf.numPages, 8);
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str || '').join(' '));
    if (pages.join('\n').length >= 12_000) break;
  }
  return pages.join('\n').slice(0, 12_000);
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
  } else if (mimeType === 'application/pdf' && data.startsWith('data:')) {
    const pdfText = await extractPdfText(data);
    data = pdfText || '[PDF contained no extractable text]';
  }

  return { data, mimeType };
}
