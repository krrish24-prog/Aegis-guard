import { db } from '../firebase';
import {
  collection, doc, setDoc, getDocs, query, where,
  updateDoc, deleteDoc, serverTimestamp, onSnapshot, Timestamp
} from 'firebase/firestore';
import type { LinkedDevice } from '../types';
import { AuditLogService } from './auditLogService';

function getBrowserInfo(): { name: string; platform: string } {
  const ua = navigator.userAgent;
  let browser = 'Unknown Browser';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  const platform = navigator.platform || 'Unknown';
  return { name: browser, platform };
}

async function generateFingerprint(): Promise<string> {
  const data = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
  ].join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export class DeviceService {
  private static DEVICE_KEY = 'aegis_current_device_id';

  static getCurrentDeviceId(): string | null {
    return localStorage.getItem(this.DEVICE_KEY);
  }

  static async registerCurrentDevice(userId: string, publicKey: string): Promise<LinkedDevice> {
    const fingerprint = await generateFingerprint();
    const existingId = this.getCurrentDeviceId();
    const { name: browser, platform } = getBrowserInfo();
    const deviceName = `${browser} (${platform})`;

    if (existingId) {
      const existingRef = doc(db, 'devices', existingId);
      await updateDoc(existingRef, {
        lastActive: serverTimestamp(),
        isActive: true,
        publicKey,
      }).catch(() => null);
      const snap = await getDocs(query(collection(db, 'devices'), where('id', '==', existingId)));
      if (!snap.empty) {
        return { id: existingId, ...snap.docs[0].data() } as LinkedDevice;
      }
    }

    const deviceRef = doc(collection(db, 'devices'));
    const device: Omit<LinkedDevice, 'id'> & { id: string } = {
      id: deviceRef.id,
      userId,
      name: deviceName,
      platform,
      browser,
      fingerprint,
      publicKey,
      verified: false,
      lastActive: Timestamp.now(),
      isActive: true,
      createdAt: Timestamp.now(),
    };

    await setDoc(deviceRef, device);
    localStorage.setItem(this.DEVICE_KEY, deviceRef.id);

    await AuditLogService.log(userId, 'device_linked', `Device linked: ${deviceName}`, {
      severity: 'info',
      deviceId: deviceRef.id,
      metadata: { fingerprint, platform, browser },
    });

    return device as LinkedDevice;
  }

  static async verifyDevice(userId: string, deviceId: string): Promise<void> {
    await updateDoc(doc(db, 'devices', deviceId), {
      verified: true,
      verifiedAt: serverTimestamp(),
    });
    await AuditLogService.log(userId, 'device_verified', `Device verified: ${deviceId}`, {
      severity: 'info',
      deviceId,
    });
  }

  static async revokeDevice(userId: string, deviceId: string): Promise<void> {
    await updateDoc(doc(db, 'devices', deviceId), {
      isActive: false,
      verified: false,
    });
    if (this.getCurrentDeviceId() === deviceId) {
      localStorage.removeItem(this.DEVICE_KEY);
    }
    await AuditLogService.log(userId, 'device_revoked', `Device revoked: ${deviceId}`, {
      severity: 'warning',
      deviceId,
    });
  }

  static subscribeToUserDevices(
    userId: string,
    callback: (devices: LinkedDevice[]) => void
  ): () => void {
    const q = query(collection(db, 'devices'), where('userId', '==', userId));
    return onSnapshot(q, (snap) => {
      const devices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LinkedDevice));
      devices.sort((a, b) => (b.lastActive?.toMillis?.() ?? 0) - (a.lastActive?.toMillis?.() ?? 0));
      callback(devices);
    });
  }
}
