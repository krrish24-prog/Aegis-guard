import { db, storage } from '../firebase';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { EncryptionService } from './encryptionService';
import type { VoiceMessageMeta } from '../types';
import { isSystemParticipant } from '../utils/participants';

export class VoiceMessageService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private startTime = 0;

  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    this.audioChunks = [];
    this.startTime = Date.now();

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    this.mediaRecorder.start(100);
  }

  stopRecording(): Promise<{ blob: Blob; duration: number }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) { reject(new Error('Not recording')); return; }

      this.mediaRecorder.onstop = () => {
        const duration = Math.round((Date.now() - this.startTime) / 1000);
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
        resolve({ blob, duration });
      };

      this.mediaRecorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  static async fetchParticipantKeys(participantIds: string[]): Promise<Array<{ id: string; publicKey: string }>> {
    const recipients: Array<{ id: string; publicKey: string }> = [];
    const unique = [...new Set(participantIds.filter((id) => id && !isSystemParticipant(id)))];
    for (const pId of unique) {
      const snap = await getDoc(doc(db, 'users_public', pId));
      const key = snap.exists() ? snap.data().publicKey : undefined;
      if (key && key !== 'PENDING_REGISTRATION') {
        recipients.push({ id: pId, publicKey: key });
      }
    }
    return recipients;
  }

  static async encryptAndUploadVoice(
    chatId: string,
    messageId: string,
    audioBlob: Blob,
    duration: number,
    participantIds: string[],
    senderId: string
  ): Promise<{ fileUrl: string; voiceMeta: VoiceMessageMeta; encryptionFields: Record<string, unknown> }> {
    const audioBuffer = await audioBlob.arrayBuffer();
    let recipients = await this.fetchParticipantKeys(participantIds);

    const senderKeys = await EncryptionService.getOrCreateKeyPair(senderId);
    if (!recipients.some((r) => r.id === senderId)) {
      recipients.push({ id: senderId, publicKey: senderKeys.publicKey });
    }

    const { encrypted, iv, sessionKeys } = await EncryptionService.encryptBinaryWithSessionKeys(
      audioBuffer,
      recipients
    );

    const { fileUrl, voiceMeta } = await this.uploadVoiceMessage(
      chatId,
      messageId,
      audioBlob,
      duration,
      encrypted
    );

    return {
      fileUrl,
      voiceMeta,
      encryptionFields: {
        encryptedFileDataSessionKeys: sessionKeys,
        fileDataIv: iv,
        content: '🔒 [Encrypted Voice]',
      },
    };
  }

  static async uploadVoiceMessage(
    chatId: string,
    messageId: string,
    audioBlob: Blob,
    duration: number,
    encryptedBuffer?: ArrayBuffer
  ): Promise<{ fileUrl: string; voiceMeta: VoiceMessageMeta }> {
    const storageRef = ref(storage, `conversations/${chatId}/voice/${Date.now()}_${messageId}.webm`);
    const data = encryptedBuffer ? new Blob([encryptedBuffer]) : audioBlob;

    const uploadTask = uploadBytesResumable(storageRef, data);
    await new Promise<void>((resolve, reject) => {
      uploadTask.on('state_changed', null, reject, () => resolve());
    });

    const fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
    const voiceMeta: VoiceMessageMeta = {
      duration,
      mimeType: 'audio/webm',
    };

    return { fileUrl, voiceMeta };
  }

  static async attachVoiceToMessage(
    chatId: string,
    messageId: string,
    fileUrl: string,
    voiceMeta: VoiceMessageMeta,
    encryptionFields?: Record<string, unknown>
  ): Promise<void> {
    await updateDoc(doc(db, 'conversations', chatId, 'messages', messageId), {
      fileUrl,
      type: 'voice',
      voiceMessage: voiceMeta,
      status: 'sent',
      timestamp: serverTimestamp(),
      ...encryptionFields,
    });
  }
}
