import { db } from '../firebase';
import {
  addDoc, collection, getDocs, query, where, orderBy, limit,
  updateDoc, doc, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { AdminUserRecord, ModerationAction, PlatformAnalytics } from '../types';

/** Bootstrap admins — granted custom claim on first login via Cloud Function. */
const BOOTSTRAP_ADMIN_EMAILS = ['krrish95star@gmail.com'];

export class AdminService {
  static async hasAdminClaim(user: User | null): Promise<boolean> {
    if (!user) return false;
    try {
      const token = await user.getIdTokenResult();
      if (token.claims.admin === true) return true;
      // Fallback until custom claim is synced
      return BOOTSTRAP_ADMIN_EMAILS.includes((user.email ?? '').toLowerCase());
    } catch {
      return BOOTSTRAP_ADMIN_EMAILS.includes((user.email ?? '').toLowerCase());
    }
  }

  /** @deprecated Use hasAdminClaim — kept for sync checks during migration */
  static isAdmin(email?: string | null): boolean {
    if (!email) return false;
    return BOOTSTRAP_ADMIN_EMAILS.includes(email.toLowerCase());
  }

  static async getAllUsers(maxUsers = 100): Promise<AdminUserRecord[]> {
    const snap = await getDocs(query(collection(db, 'users_public'), limit(maxUsers)));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: data.uid ?? d.id,
        email: data.email ?? '',
        displayName: data.displayName ?? 'Unknown',
        status: data.status === 'suspended' ? 'suspended' : data.status === 'banned' ? 'banned' : 'active',
        role: data.role ?? 'user',
        createdAt: data.createdAt ?? serverTimestamp(),
        lastActive: data.lastSeen,
        threatCount: data.threatCount ?? 0,
        messageCount: data.messageCount ?? 0,
      } as AdminUserRecord;
    });
  }

  static async suspendUser(adminId: string, targetUserId: string, reason: string): Promise<void> {
    await updateDoc(doc(db, 'users_public', targetUserId), { status: 'suspended' });
    await this.logModerationAction(adminId, targetUserId, 'suspend', reason);
  }

  static async banUser(adminId: string, targetUserId: string, reason: string): Promise<void> {
    await updateDoc(doc(db, 'users_public', targetUserId), { status: 'banned' });
    await this.logModerationAction(adminId, targetUserId, 'ban', reason);
  }

  static async reinstateUser(adminId: string, targetUserId: string): Promise<void> {
    await updateDoc(doc(db, 'users_public', targetUserId), { status: 'active' });
    await this.logModerationAction(adminId, targetUserId, 'warn', 'Account reinstated');
  }

  static async logModerationAction(
    moderatorId: string,
    targetUserId: string,
    action: ModerationAction['action'],
    reason: string
  ): Promise<void> {
    await addDoc(collection(db, 'moderation_actions'), {
      moderatorId,
      targetUserId,
      action,
      reason,
      timestamp: serverTimestamp(),
    });
  }

  static subscribeToModerationActions(
    callback: (actions: ModerationAction[]) => void
  ): () => void {
    const q = query(collection(db, 'moderation_actions'), orderBy('timestamp', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ModerationAction)));
    });
  }

  static async getPlatformAnalytics(): Promise<PlatformAnalytics> {
    const [usersSnap, threatsSnap, roomsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users_public'), limit(500))),
      getDocs(query(collection(db, 'threat_intelligence'), where('isSafe', '==', false), limit(100))),
      getDocs(query(collection(db, 'meeting_rooms'), where('status', '==', 'active'), limit(50))),
    ]);

    const now = Date.now();
    const activeUsers24h = usersSnap.docs.filter((d) => {
      const lastSeen = d.data().lastSeen;
      return lastSeen && lastSeen.toMillis && now - lastSeen.toMillis() < 86400000;
    }).length;

    return {
      totalUsers: usersSnap.size,
      activeUsers24h,
      totalMessages: 0,
      threatsDetected: threatsSnap.size,
      activeCalls: roomsSnap.docs.filter((d) => d.data().type === 'voice' || d.data().type === 'video').length,
      activeMeetings: roomsSnap.docs.filter((d) => d.data().type === 'meeting').length,
      timestamp: serverTimestamp() as PlatformAnalytics['timestamp'],
    };
  }
}
