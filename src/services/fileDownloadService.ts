/**
 * File download helpers.
 *
 * Desktop Chrome (and several other desktop browsers) do not reliably save
 * `data:` URL downloads: the download is started from an origin that has no
 * site, so Chrome pauses it and shows "Site wasn't available" with a Resume
 * button that never completes. Mobile browsers handle the same data: URL fine,
 * which is why these downloads used to work only on phones.
 *
 * Converting the payload to a Blob and downloading an object URL keeps the
 * download on the app's own origin, which works everywhere.
 */

export function base64ToBlob(base64: string, mimeType = 'application/octet-stream'): Blob {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]*)(;base64)?,/i.exec(dataUrl);
  const mimeType = match?.[1] || 'application/octet-stream';
  const isBase64 = !!match?.[2];
  if (!isBase64) {
    const comma = dataUrl.indexOf(',');
    return new Blob([decodeURIComponent(dataUrl.slice(comma + 1))], { type: mimeType });
  }
  return base64ToBlob(dataUrl, mimeType);
}

/** Save a Blob under `fileName` using an object URL that is revoked afterwards. */
export function saveBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName || 'aegis-file';
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }, 60_000);
}

function fileNameFromDataUrl(dataUrl: string): string | undefined {
  const match = /^data:([^;,]*)/i.exec(dataUrl);
  const mime = match?.[1] || '';
  if (!mime) return undefined;
  const ext = mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
  return `aegis-file.${ext}`;
}

/**
 * Download decrypted file content that may be a base64 string, a `data:` URL or
 * a `blob:` object URL (the optimistic local copy shown right after sending).
 */
export async function downloadDecryptedFile(finalData: string, fileName: string): Promise<void> {
  const safeName = fileName || fileNameFromDataUrl(finalData) || 'aegis-file';

  if (finalData.startsWith('blob:')) {
    const response = await fetch(finalData);
    saveBlob(await response.blob(), safeName);
    return;
  }

  if (finalData.startsWith('data:')) {
    saveBlob(dataUrlToBlob(finalData), safeName);
    return;
  }

  // Raw base64 with no data URL prefix.
  const mime = /\.pdf$/i.test(safeName) ? 'application/pdf' : 'application/octet-stream';
  saveBlob(base64ToBlob(finalData, mime), safeName);
}
