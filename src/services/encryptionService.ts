import { authenticatedFetch } from './apiClient';

/**
 * True E2EE Service for Aegis Guard
 * Uses Web Crypto API for RSA-OAEP (Key Exchange) and AES-GCM (Message Encryption).
 */

export class EncryptionService {
  private static STORAGE_PRIVATE_KEY = 'aegis_rsa_private_key';
  private static STORAGE_PUBLIC_KEY = 'aegis_rsa_public_key';

  static async getOrCreateKeyPair(userId: string, existingPublicKey?: string): Promise<{ publicKey: string; privateKey: string }> {
    let priv = localStorage.getItem(`${this.STORAGE_PRIVATE_KEY}_${userId}`);
    let pub = localStorage.getItem(`${this.STORAGE_PUBLIC_KEY}_${userId}`);

    // Sync public key from Firestore when local copy is missing
    if (!pub && existingPublicKey) {
      pub = existingPublicKey;
      localStorage.setItem(`${this.STORAGE_PUBLIC_KEY}_${userId}`, pub);
    }

    // Migration for older keys stored without userId
    if (!priv || !pub) {
      const oldPriv = localStorage.getItem(this.STORAGE_PRIVATE_KEY);
      const oldPub = localStorage.getItem(this.STORAGE_PUBLIC_KEY);
      if (oldPriv && oldPub) {
        priv = oldPriv;
        pub = oldPub;
        localStorage.setItem(`${this.STORAGE_PRIVATE_KEY}_${userId}`, oldPriv);
        localStorage.setItem(`${this.STORAGE_PUBLIC_KEY}_${userId}`, oldPub);
      }
    }

    // Basic validation: keys should be non-empty and have a reasonable length for RSA-2048 SPKI/PKCS8
    if (priv && pub && pub.length > 100 && priv.length > 100) {
      try {
        // Validate that the stored public key is actually importable
        const trimmedPub = pub.trim().replace(/\s/g, '');
        const binaryPub = atob(trimmedPub);
        const pubBuffer = this.str2ab(binaryPub);
        await window.crypto.subtle.importKey(
          "spki",
          pubBuffer,
          { name: "RSA-OAEP", hash: "SHA-256" },
          false,
          ["encrypt"]
        );
        console.log(`[E2EE] Loaded existing keys for ${userId}. Pub: ${pub.substring(0, 10)}...${pub.substring(pub.length-10)} Priv: ${priv.substring(0, 10)}...${priv.substring(priv.length-10)}`);
        return { publicKey: pub, privateKey: priv };
      } catch (e) {
        console.warn(`[E2EE] Stored security keys are invalid or corrupted for ${userId}. Regenerating...`, e);
        localStorage.removeItem(`${this.STORAGE_PUBLIC_KEY}_${userId}`);
        localStorage.removeItem(`${this.STORAGE_PRIVATE_KEY}_${userId}`);
      }
    }

    console.log(`[E2EE] Generating new E2EE RSA key pair for ${userId}...`);
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    const pubExport = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privExport = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    const pubStr = btoa(this.ab2str(pubExport));
    const privStr = btoa(this.ab2str(privExport));

    localStorage.setItem(`${this.STORAGE_PUBLIC_KEY}_${userId}`, pubStr);
    localStorage.setItem(`${this.STORAGE_PRIVATE_KEY}_${userId}`, privStr);

    console.log(`[E2EE] Generated keys for ${userId}. Pub: ${pubStr.substring(0, 10)}...${pubStr.substring(pubStr.length-10)} Priv: ${privStr.substring(0, 10)}...${privStr.substring(privStr.length-10)}`);
    return { publicKey: pubStr, privateKey: privStr };
  }

  public static str2ab(str: string): ArrayBuffer {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  public static ab2str(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return binary;
  }

  static async encrypt(content: string, recipientPublicKeyStr: string): Promise<{ encryptedContent: string; encryptedSessionKey: string; iv: string }> {
    try {
      if (!recipientPublicKeyStr || typeof recipientPublicKeyStr !== 'string') {
        throw new Error(`Recipient public key is invalid: ${typeof recipientPublicKeyStr}`);
      }

      // 1. Generate a random AES-GCM session key
      const sessionKey = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      // 2. Encrypt the content with the session key
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encodedContent = new TextEncoder().encode(content);
      const encryptedContentBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sessionKey,
        encodedContent
      );

      // 3. Import the recipient's public key
      const trimmedPub = recipientPublicKeyStr.trim().replace(/\s/g, '');
      let binaryPub;
      try {
        binaryPub = atob(trimmedPub);
      } catch (e) {
        throw new Error("Public key is not a valid base64 string.");
      }
      
      const pubBuffer = this.str2ab(binaryPub);
      let recipientPublicKey;
      try {
        recipientPublicKey = await window.crypto.subtle.importKey(
          "spki",
          pubBuffer,
          { name: "RSA-OAEP", hash: "SHA-256" },
          false,
          ["encrypt"]
        );
      } catch (e: any) {
        throw new Error(`Failed to import public key: ${e.message || 'Invalid SPKI format'}`);
      }

      // 4. Encrypt the session key with the recipient's public key
      const exportedSessionKey = await window.crypto.subtle.exportKey("raw", sessionKey);
      const encryptedSessionKeyBuffer = await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        recipientPublicKey,
        exportedSessionKey
      );

      return {
        encryptedContent: btoa(this.ab2str(encryptedContentBuffer)),
        encryptedSessionKey: btoa(this.ab2str(encryptedSessionKeyBuffer)),
        iv: btoa(this.ab2str(iv.buffer))
      };
    } catch (e: any) {
      console.error("Encryption failed details:", e);
      throw new Error(`Encryption failed: ${e.message || 'Unknown cryptographic error'}`);
    }
  }

  static async decrypt(encryptedContent: string, encryptedSessionKey: string, iv: string, myPrivateKeyStr: string, returnBase64: boolean = false): Promise<string> {
    try {
      if (!myPrivateKeyStr || typeof myPrivateKeyStr !== 'string') {
        throw new Error(`Private key is invalid or missing.`);
      }
      if (!encryptedContent || !encryptedSessionKey || !iv) {
        throw new Error("Missing encrypted data parts (content, key, or IV).");
      }

      // 1. Import my private key
      let myPrivateKey;
      try {
        const trimmedPriv = myPrivateKeyStr.trim().replace(/\s/g, '');
        const binaryPriv = atob(trimmedPriv);
        const privBuffer = this.str2ab(binaryPriv);
        myPrivateKey = await window.crypto.subtle.importKey(
          "pkcs8",
          privBuffer,
          { name: "RSA-OAEP", hash: "SHA-256" },
          false,
          ["decrypt"]
        );
      } catch (e: any) {
        throw new Error(`Failed to import your private key: ${e.message}`);
      }

      // 2. Decrypt the session key (RSA-OAEP)
      let sessionKeyBuffer;
      try {
        const encryptedSessionKeyBuffer = this.str2ab(atob(encryptedSessionKey));
        sessionKeyBuffer = await window.crypto.subtle.decrypt(
          { name: "RSA-OAEP" },
          myPrivateKey,
          encryptedSessionKeyBuffer
        );
      } catch (e: any) {
        throw new Error("RSA decryption failed (Incorrect private key for this message or corrupted session key)");
      }

      // 3. Import the session key (AES-GCM)
      let sessionKey;
      try {
        sessionKey = await window.crypto.subtle.importKey(
          "raw",
          sessionKeyBuffer,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );
      } catch (e: any) {
        throw new Error("Failed to reconstruct the session key.");
      }

      // 4. Decrypt the content (AES-GCM)
      try {
        const ivBuffer = this.str2ab(atob(iv));
        const encryptedContentBuffer = this.str2ab(atob(encryptedContent));
        const decryptedContentBuffer = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: new Uint8Array(ivBuffer) },
          sessionKey,
          encryptedContentBuffer
        );
        return returnBase64 ? btoa(this.ab2str(decryptedContentBuffer)) : new TextDecoder().decode(decryptedContentBuffer);
      } catch (e: any) {
        throw new Error("AES decryption failed (Data might be corrupted or IV is wrong)");
      }
    } catch (e: any) {
      console.warn('Cryptographic failure details:', e);
      throw new Error(`Decryption error: ${e.message}`);
    }
  }

  static async decryptFileUrl(url: string, encryptedSessionKey: string, iv: string, myPrivateKeyStr: string): Promise<string> {
    try {
      const myPrivateKey = await window.crypto.subtle.importKey(
        "pkcs8",
        this.str2ab(atob(myPrivateKeyStr.trim().replace(/\s/g, ''))),
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["decrypt"]
      );

      const sessionKeyBuffer = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        myPrivateKey,
        this.str2ab(atob(encryptedSessionKey))
      );

      const sessionKey = await window.crypto.subtle.importKey(
        "raw",
        sessionKeyBuffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      const res = url.startsWith('/api/')
        ? await authenticatedFetch(url)
        : await fetch(url);
      if (!res.ok) {
        throw new Error(`Encrypted file download failed (${res.status})`);
      }
      const encryptedBlob = await res.blob();
      const encryptedBuffer = await encryptedBlob.arrayBuffer();

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(this.str2ab(atob(iv))) },
        sessionKey,
        encryptedBuffer
      );

      // Fast native Base64 encoding using FileReader
      const blob = new Blob([decryptedBuffer]);
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result.split(',')[1]);
          } else {
            reject(new Error("Failed to read decrypted file"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e: any) {
      console.warn('File decryption failed:', e);
      throw new Error(`File decryption failed: ${e.message}`);
    }
  }

  /** Encrypt binary data (e.g. voice) with per-recipient RSA-wrapped AES session keys. */
  static async encryptBinaryWithSessionKeys(
    data: ArrayBuffer,
    recipients: Array<{ id: string; publicKey: string }>
  ): Promise<{ encrypted: ArrayBuffer; iv: string; sessionKeys: Record<string, string> }> {
    const sessionKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, data);
    const exportedSessionKey = await window.crypto.subtle.exportKey('raw', sessionKey);

    const sessionKeys: Record<string, string> = {};
    for (const r of recipients) {
      try {
        const pubString = r.publicKey.trim().replace(/\s/g, '');
        const pubBuffer = this.str2ab(atob(pubString));
        const recipientPublicKey = await window.crypto.subtle.importKey(
          'spki', pubBuffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']
        );
        const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
          { name: 'RSA-OAEP' }, recipientPublicKey, exportedSessionKey
        );
        sessionKeys[r.id] = btoa(this.ab2str(encryptedKeyBuffer));
      } catch (e) {
        console.error(`Failed to encrypt session key for ${r.id}`, e);
      }
    }

    return { encrypted, iv: btoa(this.ab2str(iv)), sessionKeys };
  }
}
