import { authenticatedFetch } from './apiClient';

export type MediaUploadPurpose = 'media' | 'status';

export interface MediaUploadResult {
  fileUrl: string;
  key?: string;
  provider?: string;
  expiresInSeconds?: number;
}

/** Convert bytes to base64 without blowing the call stack on large files. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload chat media, voice notes, or status media through the server.
 * The server stores it in Backblaze B2 and keeps credentials off the client.
 */
export async function uploadMediaToSecureStorage(
  data: ArrayBuffer | Blob,
  options: { fileName: string; purpose?: MediaUploadPurpose; contentType?: string }
): Promise<MediaUploadResult> {
  const base64 = data instanceof Blob
    ? await blobToBase64(data)
    : arrayBufferToBase64(data);

  const response = await authenticatedFetch('/api/storage/upload', {
    method: 'POST',
    body: JSON.stringify({
      fileName: options.fileName || 'encrypted-file.bin',
      encryptedBase64: base64,
      purpose: options.purpose || 'media',
      contentType: options.contentType,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.details || 'Secure media upload failed');
  }
  if (!payload.fileUrl) {
    throw new Error('Storage did not return a file URL.');
  }
  return payload as MediaUploadResult;
}
