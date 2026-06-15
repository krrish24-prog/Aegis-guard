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

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private roomId: string | null = null;
  private userId: string | null = null;

  static getIceServers(): RTCIceServer[] {
    return ICE_SERVERS;
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

  async startLocalMedia(video: boolean, audio: boolean): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
    const localVideo = document.getElementById('local-video') as HTMLVideoElement;
    if (localVideo) localVideo.srcObject = this.localStream;

    this.localStream.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });

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
    chatId?: string
  ): Promise<MeetingRoom> {
    const roomRef = doc(collection(db, 'meeting_rooms'));
    const room: MeetingRoom = {
      id: roomRef.id,
      chatId,
      hostId,
      participants: [hostId],
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
