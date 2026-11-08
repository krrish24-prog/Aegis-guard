import { db } from '../firebase';
import {
  doc, setDoc, updateDoc, getDocs, collection, query, where,
  orderBy, limit, serverTimestamp, arrayUnion, arrayRemove
} from 'firebase/firestore';
import type { MessageReaction, ForwardedMessageMeta } from '../types';
import { AuditLogService } from './auditLogService';

/** Selective-recipient messages live beside the shared message log. */
export type MessageCollection = 'messages' | 'private_messages';

export class MessageEnhancementsService {
  static async addReaction(
    chatId: string,
    messageId: string,
    userId: string,
    emoji: string,
    collectionName: MessageCollection = 'messages'
  ): Promise<void> {
    const msgRef = doc(db, 'conversations', chatId, collectionName, messageId);
    const fieldPath = `reactions.${emoji}.userIds`;
    await updateDoc(msgRef, {
      [fieldPath]: arrayUnion(userId),
      [`reactions.${emoji}.emoji`]: emoji,
      [`reactions.${emoji}.count`]: 1,
    });
  }

  static async removeReaction(
    chatId: string,
    messageId: string,
    userId: string,
    emoji: string,
    collectionName: MessageCollection = 'messages'
  ): Promise<void> {
    const msgRef = doc(db, 'conversations', chatId, collectionName, messageId);
    await updateDoc(msgRef, {
      [`reactions.${emoji}.userIds`]: arrayRemove(userId),
    });
  }

  static async toggleReaction(
    chatId: string,
    messageId: string,
    userId: string,
    emoji: string,
    currentReactions?: Record<string, MessageReaction>,
    collectionName: MessageCollection = 'messages'
  ): Promise<void> {
    const existing = currentReactions?.[emoji];
    const hasReacted = existing?.userIds?.includes(userId);
    if (hasReacted) {
      await this.removeReaction(chatId, messageId, userId, emoji, collectionName);
    } else {
      await this.addReaction(chatId, messageId, userId, emoji, collectionName);
    }
  }

  static async pinMessage(
    chatId: string,
    messageId: string,
    userId: string,
    collectionName: MessageCollection = 'messages'
  ): Promise<void> {
    await updateDoc(doc(db, 'conversations', chatId, collectionName, messageId), {
      pinnedAt: serverTimestamp(),
      pinnedBy: userId,
    });
    // A private message ID is not written to the shared conversation document,
    // which every group member can read.
    if (collectionName === 'messages') {
      await updateDoc(doc(db, 'conversations', chatId), {
        pinnedMessageIds: arrayUnion(messageId),
      });
    }
  }

  static async unpinMessage(chatId: string, messageId: string, collectionName: MessageCollection = 'messages'): Promise<void> {
    await updateDoc(doc(db, 'conversations', chatId, collectionName, messageId), {
      pinnedAt: null,
      pinnedBy: null,
    });
    if (collectionName === 'messages') {
      await updateDoc(doc(db, 'conversations', chatId), {
        pinnedMessageIds: arrayRemove(messageId),
      });
    }
  }

  static async forwardMessage(
    sourceChatId: string,
    targetChatId: string,
    messageId: string,
    forwardedBy: string,
    originalSenderId: string,
    encryptedPayload: Record<string, unknown>
  ): Promise<string> {
    const newMsgRef = doc(collection(db, 'conversations', targetChatId, 'messages'));
    const forwardedFrom: ForwardedMessageMeta = {
      originalMessageId: messageId,
      originalChatId: sourceChatId,
      originalSenderId,
      forwardedAt: serverTimestamp() as ForwardedMessageMeta['forwardedAt'],
      forwardedBy,
    };

    await setDoc(newMsgRef, {
      id: newMsgRef.id,
      chatId: targetChatId,
      senderId: forwardedBy,
      forwardedFrom,
      timestamp: serverTimestamp(),
      delivered: true,
      seen: false,
      ...encryptedPayload,
    });

    await AuditLogService.log(forwardedBy, 'message_sent', `Message forwarded to ${targetChatId}`, {
      metadata: { sourceChatId, messageId, targetChatId },
    });

    return newMsgRef.id;
  }

  static async searchMessages(
    chatId: string,
    searchTerm: string,
    maxResults = 30,
    options: { userId?: string; includePrivate?: boolean } = {}
  ): Promise<Array<{ id: string; decryptedContent?: string; timestamp: unknown; senderId: string }>> {
    if (!searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase();
    const matches = (m: Record<string, unknown>) => {
      const text = String(m.decryptedContent ?? m.content ?? m.text ?? '').toLowerCase();
      const fileName = String(m.fileName ?? '').toLowerCase();
      return text.includes(term) || fileName.includes(term);
    };

    type SearchableMessage = { id: string; timestamp?: unknown; [key: string]: unknown };

    const q = query(
      collection(db, 'conversations', chatId, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );
    const snap = await getDocs(q);
    const shared: SearchableMessage[] = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as SearchableMessage))
      .filter(matches);

    // Selective-recipient messages are only searchable by their recipients. The
    // array-contains filter is required by the security rules for list reads.
    let privateMatches: SearchableMessage[] = [];
    if (options.includePrivate && options.userId) {
      try {
        const privateSnap = await getDocs(query(
          collection(db, 'conversations', chatId, 'private_messages'),
          where('visibleTo', 'array-contains', options.userId),
        ));
        privateMatches = privateSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as SearchableMessage))
          .filter(matches);
      } catch (error) {
        console.warn('Private message search skipped', error);
      }
    }

    return [...shared, ...privateMatches]
      .sort((a, b) => {
        const toMs = (value: unknown) => {
          const t = value as { toMillis?: () => number } | undefined;
          return t?.toMillis?.() ?? 0;
        };
        return toMs(b.timestamp) - toMs(a.timestamp);
      })
      .slice(0, maxResults) as Array<{ id: string; decryptedContent?: string; timestamp: unknown; senderId: string }>;
  }

  static async searchAllChats(
    chatIds: string[],
    searchTerm: string,
    maxPerChat = 5,
    userId?: string
  ): Promise<Array<{ chatId: string; messageId: string; preview: string; senderId: string }>> {
    const results: Array<{ chatId: string; messageId: string; preview: string; senderId: string }> = [];
    for (const chatId of chatIds) {
      const msgs = await this.searchMessages(chatId, searchTerm, maxPerChat, { userId, includePrivate: !!userId });
      for (const m of msgs) {
        results.push({
          chatId,
          messageId: m.id,
          preview: String(m.decryptedContent ?? '').slice(0, 100),
          senderId: m.senderId,
        });
      }
    }
    return results;
  }

  static async deleteForEveryone(
    chatId: string,
    messageId: string,
    userId: string,
    collectionName: MessageCollection = 'messages'
  ): Promise<void> {
    await updateDoc(doc(db, 'conversations', chatId, collectionName, messageId), {
      deletedForEveryone: true,
      deletedAt: serverTimestamp(),
      deletedBy: userId,
      content: '🚫 This message was deleted',
      text: '🚫 This message was deleted',
      fileUrl: null,
      imageUrl: null,
      fileData: null,
      fileName: null,
      encryptedSessionKeys: {},
      encryptedImageSessionKeys: {},
      encryptedFileDataSessionKeys: {},
      encryptedFileNameSessionKeys: {},
      securityStatus: null,
      reactions: {},
    });
    await AuditLogService.log(userId, 'admin_action', `Message deleted for everyone in ${chatId}`, {
      severity: 'warning',
      metadata: { chatId, messageId, action: 'delete_for_everyone' },
    });
  }
}
