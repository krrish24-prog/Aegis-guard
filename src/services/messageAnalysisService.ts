import { doc, updateDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { SecurityService, SecurityAnalysis } from './securityService';
import { ThreatIntelligenceService } from './threatIntelligenceService';
import { buildFileDataInfo } from './messageMediaService';

const pending = new Set<string>();
const completed = new Set<string>();

export function isMessageReadyForAnalysis(msg: {
  status?: string;
  fileUrl?: string;
  imageUrl?: string;
}): boolean {
  if (msg.status === 'uploading' || msg.status === 'sending') return false;
  if (msg.fileUrl === 'uploading...' || msg.imageUrl === 'uploading...') return false;
  return true;
}

export function resetAnalysisCache(messageId?: string) {
  if (messageId) {
    pending.delete(messageId);
    completed.delete(messageId);
  }
}

export async function analyzeDecryptedMessage(
  msg: {
    id: string;
    content: string;
    status?: string;
    fileUrl?: string;
    imageUrl?: string;
    encryptedSessionKeys?: Record<string, string>;
    decryptedContent?: string;
    decryptedImageUrl?: string;
    decryptedFileData?: string;
    decryptedFileName?: string;
    securityStatus?: SecurityAnalysis;
  },
  ctx: { chatId: string; userId: string; skipThreatIntel?: boolean },
): Promise<SecurityAnalysis | null> {
  if (msg.securityStatus?.isAnalyzed) return msg.securityStatus;
  if (!isMessageReadyForAnalysis(msg)) return null;
  if (pending.has(msg.id) || completed.has(msg.id)) return null;

  const content = msg.decryptedContent ?? '';
  if (content.includes('[Encrypted before you joined]') || content.includes('[Unable to decrypt message]')) {
    return null;
  }
  const stillEncrypted = msg.encryptedSessionKeys && content === msg.content;
  if (stillEncrypted && !msg.decryptedImageUrl && !msg.decryptedFileData) return null;

  pending.add(msg.id);

  try {
    const fileDataInfo = await buildFileDataInfo(
      msg.decryptedImageUrl,
      msg.decryptedFileData,
      msg.decryptedFileName,
    );

    if (!content && !fileDataInfo) return null;

    const analysis = await SecurityService.analyzeMessage(content, fileDataInfo);

    if (!ctx.skipThreatIntel) {
      ThreatIntelligenceService.fullScan(ctx.userId, content, {
        messageId: msg.id,
        chatId: ctx.chatId,
        fileDataInfo,
        fileName: msg.decryptedFileName,
      }).catch(console.error);
    }

    await updateDoc(doc(db, 'conversations', ctx.chatId, 'messages', msg.id), {
      securityStatus: analysis,
    });

    completed.add(msg.id);
    return analysis;
  } catch (e: any) {
    const fallback: SecurityAnalysis = {
      isAnalyzed: true,
      isSafe: false,
      score: 0,
      threatType: 'phishing',
      summary: `Security scan failed: ${e.message || 'Unknown error'}`,
      points: ['Automated analysis could not complete — treat as unsafe'],
      steganographyReport: 'N/A',
    };
    try {
      await updateDoc(doc(db, 'conversations', ctx.chatId, 'messages', msg.id), {
        securityStatus: fallback,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `conversations/${ctx.chatId}/messages/${msg.id}`);
    }
    completed.add(msg.id);
    return fallback;
  } finally {
    pending.delete(msg.id);
  }
}
