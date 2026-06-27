import { db } from '../firebase';
import {
  arrayUnion,
  collection, doc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, query, where
} from 'firebase/firestore';
import type { MeetingRoom, CallSession, CallType } from '../types';
import { AuditLogService } from './auditLogService';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface CallMediaSettings {
  mediaQuality?: 'auto' | 'best' | 'data-saver';
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private roomId: string | null = null;
  private userId: string | null = null;

  static getIceServers(): RTCIceServer[] {
    return ICE_SERVERS;
  }

  private buildVideoConstraints(settings: CallMediaSettings = {}): MediaTrackConstraints {
    const videoByQuality: Record<NonNullable<CallMediaSettings['mediaQuality']>, MediaTrackConstraints> = {
      auto: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
      best: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
      'data-saver': { width: { ideal: 640, max: 854 }, height: { ideal: 360, max: 480 }, frameRate: { ideal: 15, max: 20 } },
    };
    return videoByQuality[settings.mediaQuality || 'auto'];
  }

  async initialize(userId: string, roomId: string): Promise<void> {
    this.userId = userId;
    this.roomId = roomId;
    this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate && this.roomId && this.userId) {
        await updateDoc(doc(db, 'meeting_rooms', this.roomId), {
          [`signaling.${this.userId}.iceCandidate`]: event.candidate.toJSON(),
        }).catch(() => null);
      }
    };

    this.peerConnection.ontrack = (event) => {
      const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
      if (remoteVideo && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      }
    };
  }

  async publishLocalDescription(type: 'offer' | 'answer', description: RTCSessionDescriptionInit): Promise<void> {
    if (!this.roomId || !this.userId) return;
    await updateDoc(doc(db, 'meeting_rooms', this.roomId), {
      [`signaling.${this.userId}.${type}`]: description,
    });
  }

  async startLocalMedia(video: boolean, audio: boolean, settings: CallMediaSettings = {}): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      video: video ? this.buildVideoConstraints(settings) : false,
      audio: audio
        ? {
            echoCancellation: settings.echoCancellation ?? true,
            noiseSuppression: settings.noiseSuppression ?? true,
            autoGainControl: settings.autoGainControl ?? true,
          }
        : false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    const localVideo = document.getElementById('local-video') as HTMLVideoElement;
    if (localVideo) localVideo.srcObject = this.localStream;

    this.localStream.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });

    return this.localStream;
  }

  async setVideoEnabled(enabled: boolean, settings: CallMediaSettings = {}): Promise<MediaStream | null> {
    if (!this.localStream) return null;
    const existingTracks = this.localStream.getVideoTracks();

    if (!enabled) {
      for (const track of existingTracks) {
        const sender = this.peerConnection?.getSenders().find((s) => s.track === track);
        if (sender) await sender.replaceTrack(null);
        track.stop();
        this.localStream.removeTrack(track);
      }
      return this.localStream;
    }

    if (existingTracks.length > 0) {
      existingTracks.forEach((track) => { track.enabled = true; });
      return this.localStream;
    }

    const videoStream = await navigator.mediaDevices.getUserMedia({ video: this.buildVideoConstraints(settings), audio: false });
    const videoTrack = videoStream.getVideoTracks()[0];
    if (!videoTrack) return this.localStream;

    const sender = this.peerConnection?.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) {
      await sender.replaceTrack(videoTrack);
    } else {
      this.peerConnection?.addTrack(videoTrack, this.localStream);
    }
    this.localStream.addTrack(videoTrack);
    return this.localStream;
  }

  async startScreenShare(): Promise<MediaStream> {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const videoTrack = screenStream.getVideoTracks()[0];
    const sender = this.peerConnection?.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(videoTrack);

    if (this.roomId) {
      await updateDoc(doc(db, 'meeting_rooms', this.roomId), { screenSharing: true });
    }
    return screenStream;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);
    return offer;
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);
    return answer;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.peerConnection?.addIceCandidate(new RTCIceCandidate(candidate));
  }

  toggleAudio(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = enabled; });
  }

  toggleVideo(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => { t.enabled = enabled; });
  }

  async endCall(): Promise<void> {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.peerConnection?.close();
    this.peerConnection = null;
    this.localStream = null;

    if (this.roomId) {
      await updateDoc(doc(db, 'meeting_rooms', this.roomId), {
        status: 'ended',
        endedAt: serverTimestamp(),
      }).catch(() => null);
    }
  }

  static async createMeetingRoom(
    hostId: string,
    type: CallType,
    chatId?: string,
    invitedParticipantIds: string[] = []
  ): Promise<MeetingRoom> {
    const roomRef = doc(collection(db, 'meeting_rooms'));
    const participants = Array.from(new Set([hostId, ...invitedParticipantIds].filter(Boolean)));
    const room: MeetingRoom = {
      id: roomRef.id,
      chatId,
      hostId,
      participants,
      type,
      status: 'waiting',
      screenSharing: false,
      createdAt: serverTimestamp() as MeetingRoom['createdAt'],
    };
    await setDoc(roomRef, room);

    await AuditLogService.log(hostId, 'call_started', `Meeting room created: ${type}`, {
      metadata: { roomId: roomRef.id, chatId },
    });

    return room;
  }

  static async joinMeetingRoom(roomId: string, userId: string): Promise<void> {
    await updateDoc(doc(db, 'meeting_rooms', roomId), {
      participants: arrayUnion(userId),
      status: 'active',
    });
  }

  static async createCallSession(
    roomId: string,
    callerId: string,
    calleeId: string,
    type: CallType
  ): Promise<CallSession> {
    const callRef = doc(collection(db, 'call_sessions'));
    const session: CallSession = {
      id: callRef.id,
      roomId,
      callerId,
      calleeId,
      type,
      status: 'ringing',
      startedAt: serverTimestamp() as CallSession['startedAt'],
    };
    await setDoc(callRef, session);
    return session;
  }

  static subscribeToRoom(
    roomId: string,
    callback: (room: MeetingRoom) => void
  ): () => void {
    return onSnapshot(doc(db, 'meeting_rooms', roomId), (snap) => {
      if (snap.exists()) callback({ id: snap.id, ...snap.data() } as MeetingRoom);
    });
  }

  static subscribeToSignaling(
    roomId: string,
    callback: (signaling: Record<string, unknown>) => void
  ): () => void {
    return onSnapshot(doc(db, 'meeting_rooms', roomId), (snap) => {
      if (snap.exists()) callback(snap.data().signaling ?? {});
    });
  }
}
