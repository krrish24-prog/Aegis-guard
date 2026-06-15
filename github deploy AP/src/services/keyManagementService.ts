import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { EncryptionService } from './encryptionService';
import type { KeyMetadata } from '../types';
import { AuditLogService } from './auditLogService';

export class KeyManagementService {
  static async computeFingerprint(publicKey: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicKey));
    const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 16).match(/.{4}/g)?.join(' ') ?? hex.slice(0, 16);
  }

  /** Keys live in localStorage only; Firestore stores public key metadata. */
  static async getOrCreateKeys(userId: string): Promise<{ publicKey: string; privateKey: string; metadata: KeyMetadata }> {
    const publicDoc = await getDoc(doc(db, 'users_public', userId));
    const existingPublic = publicDoc.exists() ? publicDoc.data().publicKey : undefined;

    const keys = await EncryptionService.getOrCreateKeyPair(userId, existingPublic);
    const fingerprint = await this.computeFingerprint(keys.publicKey);
    const keyVersion = (publicDoc.exists() ? publicDoc.data().keyVersion ?? 1 : 1) as number;

    const metadata: KeyMetadata = {
      userId,
      publicKey: keys.publicKey,
      keyVersion,
      algorithm: 'RSA-OAEP-2048',
      createdAt: serverTimestamp() as KeyMetadata['createdAt'],
      fingerprint,
      verifiedDevices: publicDoc.exists() ? (publicDoc.data().verifiedDevices ?? []) : [],
    };

    return { ...keys, metadata };
  }

  static async rotateKeys(userId: string): Promise<{ publicKey: string; fingerprint: string }> {
    localStorage.removeItem(`aegis_rsa_private_key_${userId}`);
    localStorage.removeItem(`aegis_rsa_public_key_${userId}`);

    const keys = await EncryptionService.getOrCreateKeyPair(userId);
    const fingerprint = await this.computeFingerprint(keys.publicKey);
    const publicDoc = await getDoc(doc(db, 'users_public', userId));
    const newVersion = (publicDoc.exists() ? (publicDoc.data().keyVersion ?? 1) : 0) + 1;

    await updateDoc(doc(db, 'users_public', userId), {
      publicKey: keys.publicKey,
      keyVersion: newVersion,
      rotatedAt: serverTimestamp(),
    });

    await AuditLogService.log(userId, 'key_rotated', `Encryption keys rotated to v${newVersion}`, {
      severity: 'warning',
      metadata: { keyVersion: newVersion, fingerprint },
    });

    return { publicKey: keys.publicKey, fingerprint };
  }

  static async verifyContactKey(contactUserId: string, expectedFingerprint: string): Promise<boolean> {
    const publicDoc = await getDoc(doc(db, 'users_public', contactUserId));
    if (!publicDoc.exists()) return false;
    const publicKey = publicDoc.data().publicKey;
    const fingerprint = await this.computeFingerprint(publicKey);
    return fingerprint === expectedFingerprint;
  }
}
