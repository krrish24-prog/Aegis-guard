import { db } from '../firebase';
import {
  doc, setDoc, updateDoc, getDocs, collection, query, where,
  orderBy, limit, serverTimestamp, arrayUnion, arrayRemove
} from 'firebase/firestore';
import type { MessageReaction, ForwardedMessageMeta } from '../types';
import { AuditLogService } from './auditLogService';

export class MessageEnhancementsService {
  static async addReaction(
    chatId: string,
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<void> {
    const msgRef = doc(db, 'conversations', chatId, 'messages', messageId);
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
    emoji: string
  ): Promise<void> {
    const msgRef = doc(db, 'conversations', chatId, 'messages', messageId);
    await updateDoc(msgRef, {
      [`reactions.${emoji}.userIds`]: arrayRemove(userId),
    });
  }

  static async toggleReaction(
    chatId: string,
    messageId: string,
    userId: string,
    emoji: string,
    currentReactions?: Record<string, MessageReaction>
  ): Promise<void> {
    const existing = currentReactions?.[emoji];
    const hasReacted = existing?.userIds?.includes(userId);
    if (hasReacted) {
      await this.removeReaction(chatId, messageId, userId, emoji);
    } else {
      await this.addReaction(chatId, messageId, userId, emoji);
    }
  }

  static async pinMessage(
    chatId: string,
    messageId: string,
    userId: string
  ): Promise<void> {
    await updateDoc(doc(db, 'conversations', chatId, 'messages', messageId), {
      pinnedAt: serverTimestamp(),
      pinnedBy: userId,
    });
    await updateDoc(doc(db, 'conversations', chatId), {
      pinnedMessageIds: arrayUnion(messageId),
    });
  }

  static async unpinMessage(chatId: string, messageId: string): Promise<void> {
    await updateDoc(doc(db, 'conversations', chatId, 'messages', messageId), {
      pinnedAt: null,
      pinnedBy: null,
    });
    await updateDoc(doc(db, 'conversations', chatId), {
      pinnedMessageIds: arrayRemove(messageId),
    });
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
    maxResults = 30
  ): Promise<Array<{ id: string; decryptedContent?: string; timestamp: unknown; senderId: string }>> {
    if (!searchTerm.trim()) return [];

    const q = query(
      collection(db, 'conversations', chatId, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );
    const snap = await getDocs(q);
    const term = searchTerm.toLowerCase();

    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m: Record<string, unknown>) => {
        const text = String(m.decryptedContent ?? m.content ?? m.text ?? '').toLowerCase();
        const fileName = String(m.fileName ?? '').toLowerCase();
        return text.includes(term) || fileName.includes(term);
      })
      .slice(0, maxResults) as Array<{ id: string; decryptedContent?: string; timestamp: unknown; senderId: string }>;
  }

  static async searchAllChats(
    chatIds: string[],
    searchTerm: string,
    maxPerChat = 5
  ): Promise<Array<{ chatId: string; messageId: string; preview: string; senderId: string }>> {
    const results: Array<{ chatId: string; messageId: string; preview: string; senderId: string }> = [];
    for (const chatId of chatIds) {
      const msgs = await this.searchMessages(chatId, searchTerm, maxPerChat);
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
    userId: string
  ): Promise<void> {
    await updateDoc(doc(db, 'conversations', chatId, 'messages', messageId), {
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
