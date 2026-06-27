import { db } from "../firebase";
import { doc, setDoc, updateDoc, getDoc, collection, query, where, onSnapshot, serverTimestamp, Timestamp } from "firebase/firestore";

export interface ContactStatus {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  online: boolean;
  lastSeen: Timestamp | null;
  currentStatus?: string; // "Available", "Busy", "Away", etc.
  statusColor?: string; // hex color for status indicator
}

export class ContactStatusService {
  /**
   * Update current user's online status and profile in real-time
   */
  static async updateUserOnlineStatus(userId: string, online: boolean, statusMessage?: string) {
    try {
      const userRef = doc(db, 'users_public', userId);
      await updateDoc(userRef, {
        online,
        lastSeen: online ? null : serverTimestamp(),
        currentStatus: statusMessage || (online ? 'Available' : 'Away'),
        statusUpdatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to update user online status:", error);
    }
  }

  /**
   * Listen to a contact's live status and presence
   */
  static subscribeToContactStatus(userId: string, onStatusChange: (status: ContactStatus) => void): () => void {
    const userRef = doc(db, 'users_public', userId);
    
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        onStatusChange({
          uid: userId,
          email: data.email,
          displayName: data.displayName,
          photoURL: data.photoURL,
          online: data.online || false,
          lastSeen: data.lastSeen || null,
          currentStatus: data.currentStatus || 'Away',
          statusColor: data.statusColor || '#gray'
        });
      }
    }, (error) => {
      console.error("Error subscribing to contact status:", error);
    });

    return unsubscribe;
  }

  /**
   * Subscribe to multiple contacts' status updates (for sidebar)
   */
  static subscribeToContactsStatus(
    contactIds: string[],
    onStatusesChange: (statuses: Map<string, ContactStatus>) => void
  ): () => void {
    const unsubscribers: (() => void)[] = [];
    const statusMap = new Map<string, ContactStatus>();

    contactIds.forEach(contactId => {
      const unsub = this.subscribeToContactStatus(contactId, (status) => {
        statusMap.set(contactId, status);
        onStatusesChange(new Map(statusMap)); // Create new map instance to trigger React updates
      });
      unsubscribers.push(unsub);
    });

    // Return cleanup function
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * Set custom status message
   */
  static async setCustomStatus(userId: string, status: string, color?: string) {
    try {
      const userRef = doc(db, 'users_public', userId);
      await updateDoc(userRef, {
        currentStatus: status,
        statusColor: color || '#10b981',
        statusUpdatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to set custom status:", error);
    }
  }

  /**
   * Get last seen timestamp of a contact
   */
  static formatLastSeen(lastSeen: Timestamp | null): string {
    if (!lastSeen) return 'Online';
    
    const now = Date.now();
    const lastSeenMs = lastSeen.toMillis();
    const diffMs = now - lastSeenMs;

    if (diffMs < 60000) return 'Just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    if (diffMs < 604800000) return `${Math.floor(diffMs / 86400000)}d ago`;
    
    return 'Long ago';
  }
}
