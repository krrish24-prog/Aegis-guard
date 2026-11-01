import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { EncryptionService } from './encryptionService';
import { arrayBufferToBase64, uploadMediaToSecureStorage } from './mediaStorageService';
import { buildFileDataInfo, mimeFromFileName } from './messageMediaService';
import { SecurityAnalysis, SecurityService } from './securityService';

/**
 * Aegis Secure Vault.
 *
 * Files are encrypted on the device with the owner's own RSA public key before
 * they ever leave it, then stored through the server (Backblaze B2) or, for
 * small files, inline in the owner's private profile document. Names are
 * encrypted too, so the vault index reveals nothing about the contents.
 *
 * Every file is scanned by the same analyzer used for chat attachments before
 * it is accepted into the vault, and the verdict is stored alongside it.
 */

export interface VaultEntry {
  id: string;
  /** Encrypted file name (base64 ciphertext). */
  name: string;
  nameIv: string;
  nameKey: string;
  size: number;
  mimeType: string;
  addedAt: number;
  /** 'inline' or a /api/storage/... URL. */
  fileUrl: string;
  /** Encrypted bytes, base64, when fileUrl is 'inline'. */
  fileData?: string;
  fileDataIv: string;
  fileKey: string;
  analysis?: SecurityAnalysis | null;
}

export interface VaultFile extends VaultEntry {
  fileName: string;
  friendlyDate: string;
}

export const VAULT_MAX_BYTES = 25 * 1024 * 1024;
/** Larger payloads go to object storage; smaller ones can travel inside the profile doc. */
const INLINE_LIMIT = 600_000;

const VAULT_FIELD = 'vaultFiles';

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });
}

async function readEntries(uid: string): Promise<VaultEntry[]> {
  const snap = await getDoc(doc(db, 'users', uid));
  const raw = snap.data()?.[VAULT_FIELD];
  return Array.isArray(raw) ? (raw as VaultEntry[]) : [];
}

async function writeEntries(uid: string, entries: VaultEntry[]): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { [VAULT_FIELD]: entries });
}

/** Load the vault and decrypt file names for display. */
export async function loadVaultFiles(uid: string, privateKey: string): Promise<VaultFile[]> {
  const entries = await readEntries(uid);
  const sorted = [...entries].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  return Promise.all(
    sorted.map(async (entry) => {
      let fileName = 'Encrypted file';
      try {
        if (entry.name && entry.nameIv && entry.nameKey) {
          fileName = await EncryptionService.decrypt(entry.name, entry.nameKey, entry.nameIv, privateKey);
        }
      } catch {
        fileName = 'Encrypted file (name unavailable)';
      }
      return {
        ...entry,
        fileName,
        friendlyDate: new Date(entry.addedAt || Date.now()).toLocaleDateString(),
      };
    }),
  );
}

export interface AddVaultFileResult {
  entry: VaultFile;
  analysis: SecurityAnalysis | null;
  storedInObjectStorage: boolean;
}

/**
 * Analyze, encrypt and store a file in the vault.
 * `onStage` lets the UI show what step is running.
 */
export async function addVaultFile(
  uid: string,
  file: File,
  onStage?: (stage: string) => void,
): Promise<AddVaultFileResult> {
  if (file.size > VAULT_MAX_BYTES) {
    throw new Error('Vault files must be 25 MB or smaller.');
  }

  const mimeType = file.type || mimeFromFileName(file.name);
  const id = newId();

  onStage?.('Reading file');
  const dataUrl = await readFileAsDataUrl(file);
  const buffer = await file.arrayBuffer();

  onStage?.('Running AI security analysis');
  let analysis: SecurityAnalysis | null = null;
  try {
    const fileDataInfo = await buildFileDataInfo(undefined, dataUrl, file.name);
    analysis = await SecurityService.analyzeMessage('', fileDataInfo);
  } catch (error) {
    console.warn('Vault file analysis failed', error);
    analysis = null;
  }

  onStage?.('Encrypting on this device');
  const keys = await EncryptionService.getOrCreateKeyPair(uid);
  const encryptedFile = await EncryptionService.encryptBinaryWithSessionKeys(buffer, [
    { id: uid, publicKey: keys.publicKey },
  ]);
  const encryptedName = await EncryptionService.encryptBinaryWithSessionKeys(
    new TextEncoder().encode(file.name),
    [{ id: uid, publicKey: keys.publicKey }],
  );

  const baseUrlKey = encryptedFile.sessionKeys[uid];
  const nameKey = encryptedName.sessionKeys[uid];
  if (!baseUrlKey || !nameKey) {
    throw new Error('Could not encrypt this file for your account.');
  }

  const encryptedBase64 = arrayBufferToBase64(encryptedFile.encrypted);
  let fileUrl = 'inline';
  let fileData: string | undefined = encryptedBase64;

  if (encryptedBase64.length >= INLINE_LIMIT) {
    onStage?.('Uploading encrypted file');
    try {
      const upload = await uploadMediaToSecureStorage(encryptedFile.encrypted, {
        fileName: `${id}.bin`,
        purpose: 'media',
        contentType: 'application/octet-stream',
      });
      fileUrl = upload.fileUrl;
      fileData = undefined;
    } catch (error: any) {
      // Small enough to keep inline even though storage refused it.
      // Kept under the 1 MiB Firestore document limit.
      if (encryptedBase64.length > 700_000) {
        throw new Error(
          error?.message || 'Secure storage is unavailable and the file is too large to keep on-device.',
        );
      }
      console.warn('Vault upload fell back to inline storage', error);
    }
  }

  const entry: VaultEntry = {
    id,
    name: btoa(EncryptionService.ab2str(encryptedName.encrypted)),
    nameIv: encryptedName.iv,
    nameKey,
    size: file.size,
    mimeType,
    addedAt: Date.now(),
    fileUrl,
    fileData,
    fileDataIv: encryptedFile.iv,
    fileKey: baseUrlKey,
    analysis,
  };

  onStage?.('Saving to vault');
  const existing = await readEntries(uid);
  await writeEntries(uid, [entry, ...existing.filter((item) => item.id !== id)]);

  return {
    entry: {
      ...entry,
      fileName: file.name,
      friendlyDate: new Date(entry.addedAt).toLocaleDateString(),
    },
    analysis,
    storedInObjectStorage: fileUrl !== 'inline',
  };
}

/** Decrypt a vault file back to base64 bytes plus its MIME type. */
export async function readVaultFile(
  entry: VaultEntry,
  privateKey: string,
): Promise<{ base64: string; mimeType: string }> {
  const mimeType = entry.mimeType || 'application/octet-stream';

  if (entry.fileUrl === 'inline') {
    if (!entry.fileData) throw new Error('This vault file has no stored content.');
    const base64 = await EncryptionService.decrypt(
      entry.fileData,
      entry.fileKey,
      entry.fileDataIv,
      privateKey,
      true,
    );
    return { base64, mimeType };
  }

  const base64 = await EncryptionService.decryptFileUrl(
    entry.fileUrl,
    entry.fileKey,
    entry.fileDataIv,
    privateKey,
  );
  return { base64, mimeType };
}

export async function deleteVaultFile(uid: string, fileId: string): Promise<void> {
  const existing = await readEntries(uid);
  await writeEntries(uid, existing.filter((entry) => entry.id !== fileId));
}

export function vaultUsageBytes(entries: Pick<VaultEntry, 'size'>[]): number {
  return entries.reduce((total, entry) => total + (Number(entry.size) || 0), 0);
}
