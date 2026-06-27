import { db } from '../firebase';
import { collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import type { AuditEventType, AuditSeverity, SecurityAuditLog } from '../types';

export class AuditLogService {
  static async log(
    userId: string,
    eventType: AuditEventType,
    description: string,
    options?: {
      severity?: AuditSeverity;
      metadata?: Record<string, unknown>;
      deviceId?: string;
    }
  ): Promise<string | null> {
    try {
      const ref = await addDoc(collection(db, 'security_audit_logs'), {
        userId,
        eventType,
        severity: options?.severity ?? 'info',
        description,
        metadata: options?.metadata ?? {},
        deviceId: options?.deviceId ?? null,
        timestamp: serverTimestamp(),
      });
      return ref.id;
    } catch (err) {
      console.error('[AuditLog] Failed to write:', err);
      return null;
    }
  }

  static subscribeToUserLogs(
    userId: string,
    callback: (logs: SecurityAuditLog[]) => void,
    maxEntries = 50
  ): () => void {
    const q = query(
      collection(db, 'security_audit_logs'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(maxEntries)
    );
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SecurityAuditLog));
      callback(logs);
    }, (err) => console.error('[AuditLog] Subscribe error:', err));
  }

  static subscribeToAllLogs(
    callback: (logs: SecurityAuditLog[]) => void,
    maxEntries = 100
  ): () => void {
    const q = query(
      collection(db, 'security_audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(maxEntries)
    );
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SecurityAuditLog));
      callback(logs);
    }, (err) => console.error('[AuditLog] Admin subscribe error:', err));
  }
}
