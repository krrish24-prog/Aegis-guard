import { Timestamp } from 'firebase/firestore';
import { SecurityAnalysis } from '../services/securityService';

// ─── Device & Session ───────────────────────────────────────────────

export interface LinkedDevice {
  id: string;
  userId: string;
  name: string;
  platform: string;
  browser: string;
  fingerprint: string;
  publicKey: string;
  verified: boolean;
  verifiedAt?: Timestamp;
  lastActive: Timestamp;
  ip?: string;
  location?: string;
  isActive: boolean;
  createdAt: Timestamp;
}

export interface UserSession {
  id: string;
  userId: string;
  deviceId: string;
  token: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  lastActivity: Timestamp;
  isRevoked: boolean;
}

// ─── Security Audit ─────────────────────────────────────────────────

export type AuditEventType =
  | 'login'
  | 'logout'
  | 'key_generated'
  | 'key_rotated'
  | 'device_linked'
  | 'device_verified'
  | 'device_revoked'
  | 'session_created'
  | 'session_revoked'
  | 'message_sent'
  | 'message_threat_detected'
  | 'call_started'
  | 'call_ended'
  | 'admin_action'
  | 'security_scan';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface SecurityAuditLog {
  id: string;
  userId: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  description: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  deviceId?: string;
  timestamp: Timestamp;
}

// ─── Threat Intelligence ────────────────────────────────────────────

export type ThreatCategory =
  | 'phishing'
  | 'malicious_url'
  | 'malware'
  | 'steganography'
  | 'cryptography'
  | 'vishing'
  | 'social_engineering'
  | 'none';

export interface ThreatIndicator {
  type: ThreatCategory;
  confidence: number;
  description: string;
  source: 'static' | 'ai' | 'threat_intel';
}

export interface ThreatIntelligenceReport {
  id: string;
  messageId?: string;
  chatId?: string;
  userId: string;
  contentHash: string;
  isSafe: boolean;
  riskScore: number;
  threatCategory: ThreatCategory;
  indicators: ThreatIndicator[];
  urlScanResults?: UrlScanResult[];
  attachmentScan?: AttachmentScanResult;
  aiExplanation?: string;
  incidentReport?: string;
  timestamp: Timestamp;
}

export interface UrlScanResult {
  url: string;
  isSafe: boolean;
  threatType: string;
  domain: string;
  reputation?: string;
}

export interface AttachmentScanResult {
  fileName: string;
  mimeType: string;
  isSafe: boolean;
  malwareScore: number;
  findings: string[];
}

// ─── Message Enhancements ───────────────────────────────────────────

export interface MessageReaction {
  emoji: string;
  userIds: string[];
  count: number;
}

export interface ForwardedMessageMeta {
  originalMessageId: string;
  originalChatId: string;
  originalSenderId: string;
  forwardedAt: Timestamp;
  forwardedBy: string;
}

export interface VoiceMessageMeta {
  duration: number;
  waveform?: number[];
  mimeType: string;
}

export interface EnhancedMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  timestamp: Timestamp;
  reactions?: Record<string, MessageReaction>;
  pinnedAt?: Timestamp;
  pinnedBy?: string;
  forwardedFrom?: ForwardedMessageMeta;
  voiceMessage?: VoiceMessageMeta;
  securityStatus?: SecurityAnalysis;
  threatReport?: ThreatIntelligenceReport;
  [key: string]: unknown;
}

// ─── Meetings & Calls ───────────────────────────────────────────────

export type CallType = 'voice' | 'video' | 'screen_share' | 'meeting';

export interface MeetingRoom {
  id: string;
  chatId?: string;
  hostId: string;
  participants: string[];
  type: CallType;
  status: 'waiting' | 'active' | 'ended';
  signaling?: Record<string, unknown>;
  screenSharing?: boolean;
  createdAt: Timestamp;
  endedAt?: Timestamp;
}

export interface CallSession {
  id: string;
  roomId: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  status: 'ringing' | 'connected' | 'ended' | 'missed';
  startedAt: Timestamp;
  endedAt?: Timestamp;
  duration?: number;
  securityAnalysis?: SecurityAnalysis;
}

// ─── Admin ──────────────────────────────────────────────────────────

export interface AdminUserRecord {
  uid: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'banned';
  role: 'user' | 'moderator' | 'admin';
  createdAt: Timestamp;
  lastActive?: Timestamp;
  threatCount: number;
  messageCount: number;
}

export interface ModerationAction {
  id: string;
  moderatorId: string;
  targetUserId: string;
  action: 'warn' | 'suspend' | 'ban' | 'delete_message' | 'delete_chat';
  reason: string;
  metadata?: Record<string, unknown>;
  timestamp: Timestamp;
}

export interface PlatformAnalytics {
  totalUsers: number;
  activeUsers24h: number;
  totalMessages: number;
  threatsDetected: number;
  activeCalls: number;
  activeMeetings: number;
  timestamp: Timestamp;
}

// ─── Key Management ─────────────────────────────────────────────────

export interface KeyMetadata {
  userId: string;
  publicKey: string;
  keyVersion: number;
  algorithm: 'RSA-OAEP-2048';
  createdAt: Timestamp;
  rotatedAt?: Timestamp;
  fingerprint: string;
  verifiedDevices: string[];
}
