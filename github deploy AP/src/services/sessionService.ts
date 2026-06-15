import { db } from '../firebase';
import {
  collection, doc, setDoc, updateDoc, query, where,
  onSnapshot, serverTimestamp, Timestamp, getDocs
} from 'firebase/firestore';
import type { UserSession } from '../types';
import { AuditLogService } from './auditLogService';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class SessionService {
  private static SESSION_KEY = 'aegis_session_token';

  static getLocalToken(): string | null {
    return sessionStorage.getItem(this.SESSION_KEY);
  }

  static async createSession(userId: string, deviceId: string): Promise<UserSession> {
    const token = crypto.randomUUID();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(Date.now() + SESSION_DURATION_MS);

    const sessionRef = doc(collection(db, 'user_sessions'));
    const session: UserSession = {
      id: sessionRef.id,
      userId,
      deviceId,
      token,
      expiresAt,
      createdAt: now,
      lastActivity: now,
      isRevoked: false,
    };

    await setDoc(sessionRef, session);
    sessionStorage.setItem(this.SESSION_KEY, token);

    await AuditLogService.log(userId, 'session_created', 'New session created', {
      severity: 'info',
      deviceId,
      metadata: { sessionId: sessionRef.id },
    });

    return session;
  }

  static async refreshActivity(sessionId: string): Promise<void> {
    await updateDoc(doc(db, 'user_sessions', sessionId), {
      lastActivity: serverTimestamp(),
    }).catch(() => null);
  }

  static async revokeSession(userId: string, sessionId: string): Promise<void> {
    await updateDoc(doc(db, 'user_sessions', sessionId), { isRevoked: true });
    await AuditLogService.log(userId, 'session_revoked', `Session revoked: ${sessionId}`, {
      severity: 'warning',
    });
  }

  static async revokeAllSessions(userId: string, exceptDeviceId?: string): Promise<void> {
    const snap = await getDocs(query(collection(db, 'user_sessions'), where('userId', '==', userId)));
    const batch = snap.docs.filter((d) => {
      const data = d.data() as UserSession;
      return !data.isRevoked && data.deviceId !== exceptDeviceId;
    });
    await Promise.all(batch.map((d) => updateDoc(d.ref, { isRevoked: true })));
    await AuditLogService.log(userId, 'session_revoked', `Revoked ${batch.length} sessions`, {
      severity: 'warning',
    });
  }

  static subscribeToUserSessions(
    userId: string,
    callback: (sessions: UserSession[]) => void
  ): () => void {
    const q = query(collection(db, 'user_sessions'), where('userId', '==', userId));
    return onSnapshot(q, (snap) => {
      const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserSession));
      callback(sessions.filter((s) => !s.isRevoked));
    });
  }
}
