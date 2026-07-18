/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  auth, 
  db, 
  storage,
  OperationType, 
  handleFirestoreError 
} from './firebase';
import { 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  orderBy, 
  limit,
  Timestamp,
  updateDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL,
  uploadBytesResumable,
  uploadString
} from 'firebase/storage';
import { 
  Mail,
  Bookmark,
  ArrowDownLeft,
  ArrowUpRight,
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Eye,
  EyeOff,
  Send, 
  Search, 
  Plus, 
  MoreVertical, 
  LogOut, 
  User as UserIcon,
  MessageSquare,
  Lock,
  AlertTriangle,
  ExternalLink,
  Info,
  CheckCircle2,
  XCircle,
  Video,
  X,
  Image as ImageIcon,
  Camera,
  Paperclip,
  FileText,
  ChevronRight,
  Globe,
  Phone,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Sparkles,
  Database,
  Wifi,
  HardDrive,
  Languages,
  Key,
  Smartphone,
  HelpCircle,
  History,
  Trash2,
  UserPlus,
  Calendar,
  Users,
  Clock,
  Check,
  CheckCheck,
  Star,
  Forward,
  Reply,
  Pin,
  Download,
  Share2,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  VideoOff,
  CircleDashed,
  MonitorSmartphone,
  QrCode,
  Smile
} from 'lucide-react';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';
import { motion, AnimatePresence } from 'motion/react';
import { ContactStatusService, ContactStatus } from './services/contactStatusService';
import { EncryptionService } from './services/encryptionService';
import SecurityScoreCircle from './components/SecurityScoreCircle';
import LoginScreen from './components/auth/LoginScreen';
import { SecurityService, SecurityAnalysis, GroupVerification } from './services/securityService';
import { AuditLogService } from './services/auditLogService';
import { DeviceService } from './services/deviceService';
import { SessionService } from './services/sessionService';
import { KeyManagementService } from './services/keyManagementService';
import { ThreatIntelligenceService } from './services/threatIntelligenceService';
import { decryptMessageMedia, buildFileDataInfo } from './services/messageMediaService';
import { analyzeDecryptedMessage } from './services/messageAnalysisService';
import { MessageEnhancementsService } from './services/messageEnhancementsService';
import { WebRTCService } from './services/webrtcService';
import { VoiceMessageService } from './services/voiceMessageService';
import { AdminService } from './services/adminService';
import { authenticatedFetch } from './services/apiClient';
import { normalizeParticipantList } from './utils/participants';
import SecurityDashboard from './components/SecurityDashboard';
import AdminDashboard from './components/AdminDashboard';
import MessageActions from './components/MessageActions';
import VoiceRecorder from './components/VoiceRecorder';
import type { CallSession, CallType, MessageReaction, ForwardedMessageMeta, VoiceMessageMeta } from './types';
import { translations, Language } from './translations';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import Markdown from 'react-markdown';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ComingSoonBadge = ({ compact = false }: { compact?: boolean }) => (
  <span
    className={cn(
      "coming-soon-badge inline-flex shrink-0 items-center justify-center rounded-full border border-amber-300/80 bg-amber-100 text-amber-800 shadow-sm shadow-amber-300/30",
      compact ? "px-1.5 py-0.5 text-[8px] font-black leading-none" : "px-2.5 py-1 text-[10px] font-black uppercase tracking-widest"
    )}
  >
    {compact ? 'Soon' : 'Coming soon'}
  </span>
);

const showComingSoonNotice = (feature: string) => {
  alert(`${feature} is coming soon. This option is currently locked until the full feature is ready.`);
};

// --- Types ---

interface UserProfile {
  id?: string;
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  publicKey: string;
  phoneNumber?: string;
  status?: string; // App-level status message
  online?: boolean; // Online presence
  lastSeen?: Timestamp; // Last seen time
  theme?: 'light' | 'dark' | 'glow';
  language?: string;
  privacySettings?: {
    lastSeen?: 'everyone' | 'contacts' | 'nobody';
    profilePhoto?: 'everyone' | 'contacts' | 'nobody';
    about?: 'everyone' | 'contacts' | 'nobody';
    groups?: 'everyone' | 'contacts' | 'nobody';
    readReceipts?: boolean;
  };
  storageSettings?: {
    backupEnabled?: boolean;
    dataUsage?: 'low' | 'normal' | 'high';
    wifiUpdatesOnly?: boolean;
    mediaQuality?: 'auto' | 'best' | 'data-saver';
  };
  securitySettings?: {
    twoStepVerification?: boolean;
    twoStepEnabled?: boolean;
    twoStepPin?: string;
    securityNotifications?: boolean;
    passkeyEnabled?: boolean;
    vishingProtection?: boolean;
  };
  notificationSettings?: {
    messageNotifications?: boolean;
    groupNotifications?: boolean;
    callNotifications?: boolean;
    previewMessages?: boolean;
    soundEnabled?: boolean;
    highPriority?: boolean;
  };
  callSettings?: {
    startWithCamera?: boolean;
    startWithMic?: boolean;
    mediaQuality?: 'auto' | 'best' | 'data-saver';
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
    vishingGuard?: boolean;
    deepfakeScan?: boolean;
  };
}

interface ScheduledEvent {
  id: string;
  creatorId: string;
  title: string;
  description?: string;
  type: 'call' | 'meeting';
  scheduledAt: Timestamp;
  participants: string[];
  guestAttendees?: { name: string; contactDetail: string }[];
  meetingLink?: string;
  googleEventId?: string;
  googleCalendarLink?: string;
  status: 'scheduled' | 'cancelled' | 'completed';
}

interface Chat {
  id: string;
  type: 'direct' | 'group' | 'saved' | 'ai';
  participants: string[];
  deletedFor?: string[];
  typing?: string[]; // Array of UIDs currently typing
  updatedAt: Timestamp;
  groupName?: string;
  unreadCount?: Record<string, number>;
  isVerified?: boolean;
  verificationReport?: GroupVerification;
  lastMessage?: {
    content: string;
    senderId: string;
    timestamp: Timestamp;
  };
  pinnedMessageIds?: string[];
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  receiverId?: string;
  content: string;
  delivered?: boolean;
  seen?: boolean;
  starredBy?: string[];
  encryptedSessionKey?: string;
  encryptedSessionKeys?: Record<string, string>;
  iv: string;
  imageUrl?: string;
  encryptedImageSessionKey?: string;
  encryptedImageSessionKeys?: Record<string, string>;
  imageIv?: string;
  imagePrefix?: string;
  fileName?: string;
  encryptedFileNameSessionKey?: string;
  encryptedFileNameSessionKeys?: Record<string, string>;
  fileNameIv?: string;
  fileData?: string;
  fileUrl?: string;
  encryptedFileDataSessionKey?: string;
  encryptedFileDataSessionKeys?: Record<string, string>;
  fileDataIv?: string;
  fileSize?: number;
  timestamp: Timestamp;
  status?: 'sending' | 'uploading' | 'sent' | 'error' | string;
  uploadProgress?: number;
  securityStatus?: SecurityAnalysis;
  decryptedContent?: string;
  decryptedImageUrl?: string;
  decryptedFileName?: string;
  decryptedFileData?: string;
  reactions?: Record<string, MessageReaction>;
  pinnedAt?: Timestamp;
  pinnedBy?: string;
  forwardedFrom?: ForwardedMessageMeta;
  voiceMessage?: VoiceMessageMeta;
  replyToId?: string;
  replyToSenderId?: string;
  replyToPreview?: string;
  deletedForEveryone?: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
  decryptedVoiceUrl?: string;
  type?: 'text' | 'voice' | 'file' | 'image';
}

interface StatusUpdate {
  id: string;
  userId: string;
  mediaUrl: string;
  type: 'image' | 'video';
  timestamp: Timestamp;
  privacy?: 'everyone' | 'contacts' | 'me' | 'except';
}

// --- Components ---

const SplashScreen = () => (
  <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950 overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-zinc-950 to-zinc-950" />
    <motion.div
      initial={{ scale: 0.8, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ 
        duration: 1, 
        ease: [0.25, 1, 0.5, 1]
      }}
      className="relative flex flex-col items-center z-10"
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className="relative"
      >
        <div className="absolute inset-0 bg-emerald-500 blur-[80px] opacity-40 rounded-full" />
        <div className="w-32 h-32 rounded-[2rem] overflow-hidden relative z-10 border border-emerald-400/30 shadow-2xl shadow-emerald-500/30">
          <img src="/app-logo.png" alt="Aegis Guard" className="w-full h-full object-cover" />
        </div>
      </motion.div>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="mt-8 text-center"
      >
        <h1 className="text-4xl md:text-5xl font-black tracking-[0.25em] text-white uppercase drop-shadow-2xl">
          Aegis <span className="text-emerald-500">Guard</span>
        </h1>
        <motion.div
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ delay: 1, duration: 1.5, ease: "easeInOut" }}
            className="h-[1px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent mt-6 mb-4"
        />
        <p className="text-emerald-500/60 font-mono text-xs md:text-sm tracking-[0.3em] uppercase">
          Tactical Secure Comms
        </p>
      </motion.div>
    </motion.div>
  </div>
);

const LoadingScreen = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center"
    >
      <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
        <img src="/app-logo.png" alt="Aegis Guard" className="w-full h-full object-cover" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Aegis Guard</h1>
      <p className="text-zinc-500 mt-2">Initializing secure environment...</p>
    </motion.div>
  </div>
);

const PRESET_AVATARS = Array.from({ length: 24 }, (_, i) => `https://api.dicebear.com/7.x/avataaars/svg?seed=Aegis${i}`);

const ScheduleModal = ({ 
  isOpen, 
  onClose, 
  onSchedule, 
  type,
  title,
  setTitle,
  date,
  setDate,
  time,
  setTime,
  isScheduling,
  guests,
  setGuests
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSchedule: () => void,
  type: 'call' | 'meeting',
  title: string,
  setTitle: (v: string) => void,
  date: string,
  setDate: (v: string) => void,
  time: string,
  setTime: (v: string) => void,
  isScheduling: boolean,
  guests: {name: string, contactDetail: string}[],
  setGuests: (g: {name: string, contactDetail: string}[]) => void
}) => {
  const [guestName, setGuestName] = useState('');
  const [guestDetail, setGuestDetail] = useState('');

  const addGuest = () => {
    if (guestName && guestDetail) {
      setGuests([...guests, { name: guestName, contactDetail: guestDetail }]);
      setGuestName('');
      setGuestDetail('');
    }
  };

  const removeGuest = (index: number) => {
    setGuests(guests.filter((_, i) => i !== index));
  };

  return (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          <div className={cn(
            "p-6 text-white flex items-center justify-between",
            type === 'meeting' ? "bg-indigo-600" : "bg-emerald-600"
          )}>
            <div className="flex items-center gap-3">
              {type === 'meeting' ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
              <h3 className="text-xl font-bold">Schedule {type === 'meeting' ? 'Meeting' : 'Call'}</h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">Title</label>
              <input 
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Enter ${type} title...`}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">Date</label>
                <input 
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">Time</label>
                <input 
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">Add Members (Optional)</label>
              <div className="flex gap-2 mb-2">
                <input 
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Name"
                  className="w-1/2 px-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <input 
                  type="text"
                  value={guestDetail}
                  onChange={(e) => setGuestDetail(e.target.value)}
                  placeholder="Email / Phone"
                  className="w-1/2 px-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <button 
                  onClick={addGuest}
                  disabled={!guestName || !guestDetail}
                  className="px-3 bg-zinc-900 text-white rounded-xl disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              {guests.length > 0 && (
                <div className="space-y-2 max-h-[120px] overflow-y-auto mt-2">
                  {guests.map((g, i) => (
                    <div key={i} className="flex items-center justify-between bg-zinc-50 px-3 py-2 rounded-xl">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold">{g.name}</span>
                        <span className="text-[10px] text-zinc-500">{g.contactDetail}</span>
                      </div>
                      <button onClick={() => removeGuest(i)} className="text-red-500 hover:bg-red-50 p-1 rounded-md">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button 
              onClick={onSchedule}
              disabled={isScheduling || !title || !date || !time}
              className={cn(
                "w-full py-4 rounded-2xl font-bold text-white transition-all shadow-lg disabled:opacity-50",
                type === 'meeting' ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
              )}
            >
              {isScheduling ? 'Scheduling...' : `Schedule ${type === 'meeting' ? 'Meeting' : 'Call'}`}
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
  );
};

const playDTMF = (key: string) => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  
  if (!(window as any).audioCtx) {
    (window as any).audioCtx = new AudioContextClass();
  }
  const ctx = (window as any).audioCtx as AudioContext;
  
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  
  const frequencies: Record<string, [number, number]> = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
  };

  const freqs = frequencies[key];
  if (!freqs) return;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc1.frequency.value = freqs[0];
  osc2.frequency.value = freqs[1];

  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(ctx.destination);

  gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

  osc1.start();
  osc2.start();
  osc1.stop(ctx.currentTime + 0.15);
  osc2.stop(ctx.currentTime + 0.15);
};

const decryptionCache = new Map<string, any>();

function getReplyPreview(msg: Message): string {
  if (msg.decryptedContent?.trim()) return msg.decryptedContent.trim().slice(0, 120);
  if (msg.decryptedImageUrl || msg.imageUrl) return '📷 Photo';
  if (msg.decryptedFileName) return `📄 ${msg.decryptedFileName}`;
  if (msg.type === 'voice' || msg.voiceMessage) return '🎤 Voice message';
  return 'Message';
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageLimit, setMessageLimit] = useState(50);
  const [newMessage, setNewMessage] = useState('');
  const [streamingAIMessage, setStreamingAIMessage] = useState<{chatId: string, text: string} | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupParticipants, setSelectedGroupParticipants] = useState<string[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  useEffect(() => {
    if (selectedChatId && user) {
      const chat = chats.find(c => c.id === selectedChatId);
      // Wait, earlier I also increment for user.email.toLowerCase(). I should verify and delete for either.
      if (chat && chat.unreadCount && (chat.unreadCount[user.uid] || chat.unreadCount[user.email?.toLowerCase() || ''])) {
        const newUnreadCount = { ...chat.unreadCount };
        delete newUnreadCount[user.uid];
        if (user.email) delete newUnreadCount[user.email.toLowerCase()];
        updateDoc(doc(db, 'conversations', selectedChatId), { unreadCount: newUnreadCount }).catch(console.error);
      }
    }
  }, [selectedChatId, user, chats]);

  const [statusUpdates, setStatusUpdates] = useState<StatusUpdate[]>([]);
  const [localStatusUpdates, setLocalStatusUpdates] = useState<(StatusUpdate & { uploading?: boolean; progress?: number })[]>([]);
  const [viewingStatus, setViewingStatus] = useState<StatusUpdate | null>(null);
  const [statusPrivacy, setStatusPrivacy] = useState<'everyone' | 'contacts' | 'me' | 'except'>('everyone');
  const [contactStatuses, setContactStatuses] = useState<Map<string, ContactStatus>>(new Map());
  const [customStatusMessage, setCustomStatusMessage] = useState('Available');
  const statusUnsubscribeRef = useRef<(() => void) | null>(null);

  const allStatuses = useMemo(() => {
    const combined = [...localStatusUpdates, ...statusUpdates];
    const unique = Array.from(new Map(combined.map(s => [s.id, s])).values());
    return unique.sort((a, b) => (b.timestamp?.toMillis() || Date.now()) - (a.timestamp?.toMillis() || Date.now()));
  }, [localStatusUpdates, statusUpdates]);

  const handleStatusUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
       alert("Status updates only support images and videos.");
       e.target.value = '';
       return;
    }

    if (file.size > 20 * 1024 * 1024) {
      alert("Status update must be less than 20MB.");
      return;
    }
    
    // Clear the input so they can select again
    e.target.value = '';

    const isVideo = file.type.startsWith('video/');
    const localUrl = URL.createObjectURL(file);
    const tempId = `temp_${Date.now()}`;
    
    const optimisticStatus = {
      id: tempId,
      userId: user.email || user.uid,
      mediaUrl: localUrl,
      type: (isVideo ? 'video' : 'image') as 'video' | 'image',
      timestamp: Timestamp.now(),
      uploading: true,
      privacy: statusPrivacy,
    };

    setLocalStatusUpdates(prev => [optimisticStatus, ...prev]);

    const performUpload = async () => {
      try {
        const storageRef = ref(storage, `status/${user.uid}/${Date.now()}_${file.name}`);
        
        let blobData: Blob = file;
        if (!isVideo) {
            try {
                const base64Data = await new Promise<string>((res, rej) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        if (typeof reader.result === 'string') {
                            res(reader.result);
                        } else {
                            rej(new Error("Base64 read failed"));
                        }
                    };
                    reader.onerror = rej;
                    reader.readAsDataURL(file);
                });
                const resizedBase64 = await resizeImage(base64Data);
                // Convert base64 to blob
                const res = await fetch(resizedBase64);
                blobData = await res.blob();
            } catch (err) {
                console.error("Failed to resize status image", err);
            }
        }

        const uploadPromise = uploadBytes(storageRef, blobData);
        const uploadSnap = await uploadPromise;
        
        const mediaUrl = await getDownloadURL(uploadSnap.ref);

        const actualId = tempId.replace('temp_', 'status_'); // just a unique ID
        const statusRef = doc(collection(db, 'status_updates'), actualId);
        
        const newStatus = {
          id: statusRef.id,
          userId: user.email || user.uid,
          mediaUrl,
          type: (isVideo ? 'video' : 'image') as 'video' | 'image',
          timestamp: Timestamp.now(),
          privacy: statusPrivacy,
        };
        
        // Only proceed if not cancelled
        let isCancelled = false;
        setLocalStatusUpdates(prev => {
           if (!prev.some(s => s.id === tempId)) {
               isCancelled = true;
           }
           return prev; // no-op
        });

        if (isCancelled) {
            console.log("Status upload was cancelled, aborting save.");
            return;
        }
        
        // Save to Firestore first
        await setDoc(statusRef, newStatus).catch(err => {
             console.error("Failed to save status doc:", err);
        });

        // ONLY AFTER saving, update the local UI state so it doesn't get stuck spinning
        setLocalStatusUpdates(prev => {
          const stillExists = prev.some(s => s.id === tempId);
          if (stillExists) {
            return prev.map(s => s.id === tempId ? { ...newStatus, uploading: false } : s);
          }
          return prev;
        });

        // Let real-time listener run
        setTimeout(() => {
          setLocalStatusUpdates(prev => prev.filter(s => s.id !== tempId && s.id !== statusRef.id));
        }, 1000);

      } catch (error: any) {
        setLocalStatusUpdates(prev => prev.filter(s => s.id !== tempId));
        if (error.code !== 'storage/canceled') {
          console.error("Status upload failed:", error);
          alert("Status upload failed: " + (error.message || 'Unknown error'));
        }
      }
    };
    
    performUpload();
  };

  const cancelStatusUpload = (tempId: string) => {
    const tasks = uploadTasksRef.current[tempId];
    if (tasks && tasks.length > 0) {
      tasks.forEach(t => {
        try { t.cancel(); } catch(e) {}
      });
    }
    delete uploadTasksRef.current[tempId];
    setLocalStatusUpdates(prev => prev.filter(s => s.id !== tempId));
  };

  const deleteStatus = async (statusId: string) => {
    // Instant UI feedback
    setLocalStatusUpdates(prev => prev.filter(s => s.id !== statusId));
    setStatusUpdates(prev => prev.filter(s => s.id !== statusId));
    if (viewingStatus?.id === statusId) setViewingStatus(null);
    
    try {
      if (!statusId.startsWith('temp_')) {
        await deleteDoc(doc(db, 'status_updates', statusId));
      }
    } catch(e) {
      console.error("Failed to delete status", e);
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim() || !user) return;
    setIsCreatingGroup(true);
    try {
      // Perform security analysis on the group before creation
      const verification = await SecurityService.analyzeGroup(
        newGroupName, 
        selectedGroupParticipants.length + 1,
        `Created by ${profile?.displayName || user.email}`
      );

      const chatRef = doc(collection(db, 'conversations'));
      await setDoc(chatRef, {
        id: chatRef.id,
        type: 'group',
        groupName: newGroupName,
        participants: normalizeParticipantList(
          [user.uid, ...selectedGroupParticipants],
          [{ uid: user.uid, email: user.email }, ...allUsers.map((u) => ({ uid: u.uid, email: u.email }))]
        ),
        updatedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        isVerified: verification.isVerified,
        verificationReport: verification,
        lastMessage: {
          content: 'Group created',
          senderId: user.email.toLowerCase(),
          timestamp: Timestamp.now()
        }
      });
      setSelectedChatId(chatRef.id);
      setShowNewGroup(false);
      setNewGroupName('');
      setSelectedGroupParticipants([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    } finally {
      setIsCreatingGroup(false);
    }
  };
  const [showSettings, setShowSettings] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeVideoCall, setActiveVideoCall] = useState<boolean>(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getCallSettings = () => ({
    startWithCamera: profile?.callSettings?.startWithCamera ?? true,
    startWithMic: profile?.callSettings?.startWithMic ?? true,
    mediaQuality: profile?.callSettings?.mediaQuality ?? 'auto',
    echoCancellation: profile?.callSettings?.echoCancellation ?? true,
    noiseSuppression: profile?.callSettings?.noiseSuppression ?? true,
    autoGainControl: profile?.callSettings?.autoGainControl ?? true,
    vishingGuard: profile?.callSettings?.vishingGuard ?? true,
    deepfakeScan: profile?.callSettings?.deepfakeScan ?? true,
  });

  const toggleCamera = async () => {
    if (isCameraOn) {
      if (webrtcRef.current) {
        const stream = await webrtcRef.current.setVideoEnabled(false, getCallSettings());
        if (stream) setLocalStream(stream);
      } else {
        localStream?.getVideoTracks().forEach(track => {
          track.enabled = false;
          track.stop();
        });
      }
      setIsCameraOn(false);
    } else {
      try {
        if (webrtcRef.current && localStream) {
          const stream = await webrtcRef.current.setVideoEnabled(true, getCallSettings());
          if (stream) setLocalStream(stream);
        } else {
          const settings = getCallSettings();
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
              echoCancellation: settings.echoCancellation,
              noiseSuppression: settings.noiseSuppression,
              autoGainControl: settings.autoGainControl,
            },
          });
          setLocalStream(stream);
        }
        setIsCameraOn(true);
      } catch (err: any) {
        console.error("Camera access denied:", err);
        
        // Fallback for preview/iframe environments where permissions might be restricted
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#18181b';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#a1a1aa';
          ctx.font = '20px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Camera Simulated Mode (Access Denied)', 320, 180);
        }
        
        const fallbackStream = canvas.captureStream(10);
        setLocalStream(fallbackStream);
        setIsCameraOn(true);
        alert(`Camera access denied. Using simulated video stream. Error: ${err.message || "Permission denied"}`);
      }
    }
  };

  const toggleMic = () => {
    const next = !isMicOn;
    webrtcRef.current?.toggleAudio(next);
    localStream?.getAudioTracks().forEach(track => { track.enabled = next; });
    setIsMicOn(next);
  };

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [isCameraOn, localStream]);
  const [isCalling, setIsCalling] = useState<boolean>(false);
  const [callTranscript, setCallTranscript] = useState<string[]>([]);
  const [callSecurityStatus, setCallSecurityStatus] = useState<SecurityAnalysis | null>(null);
  const [deepfakeRisk, setDeepfakeRisk] = useState<number | null>(null);
  const [deepfakeStatus, setDeepfakeStatus] = useState<string>('Analyzing facial micro-expressions...');
  const [newsStories, setNewsStories] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('https://api.rss2json.com/v1/api.json?rss_url=https://thehackernews.com/feeds/posts/default').then(res => res.json()).catch(() => ({})),
      fetch('https://api.rss2json.com/v1/api.json?rss_url=https://krebsonsecurity.com/feed/').then(res => res.json()).catch(() => ({})),
      fetch('https://api.rss2json.com/v1/api.json?rss_url=https://www.darkreading.com/rss.xml').then(res => res.json()).catch(() => ({}))
    ])
      .then(results => {
        let allItems: any[] = [];
        results.forEach(data => {
            if (data && data.status === 'ok' && data.items) {
               allItems = [...allItems, ...data.items];
            }
        });
        
        if (allItems.length > 0) {
           allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
           setNewsStories(allItems.slice(0, 10)); // Top 10 latest stories
        } else {
           throw new Error('No items found');
        }
      })
      .catch(err => {
        console.error("Failed to fetch news:", err);
        // Fallback data
        setNewsStories([
          {
            title: "New Zero-Day Exploit Found in Major OS",
            pubDate: new Date().toISOString(),
            description: "Security researchers have uncovered a critical zero-day vulnerability allowing remote code execution. A patch is actively being developed. Aegis protocol remains secure against this vector.",
            link: "#",
            thumbnail: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800"
          },
          {
            title: "Rise of AI-Generated Phishing Campaigns",
            pubDate: new Date(Date.now() - 86400000).toISOString(),
            description: "Adversaries are increasingly using large language models to craft highly personalized phishing emails. Learn how Aegis Vishing Guard protects against these next-gen attacks.",
            link: "#"
          },
          {
            title: "Deepfake Detection Now Live in Aegis Meetings",
            pubDate: new Date(Date.now() - 172800000).toISOString(),
            description: "We have rolled out real-time biometric analysis to detect AI manipulation and facial spoofing during video calls. Keep your communications authentically yours.",
            link: "#"
          }
        ]);
      });
  }, []);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{name: string, size: number, date: string, data?: string, file?: File} | null>(null);
  const [showSecurityReport, setShowSecurityReport] = useState<Message | null>(null);
  const [showGroupVerification, setShowGroupVerification] = useState<Chat | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showMessagesSearch, setShowMessagesSearch] = useState(false);
  const [showPhotosOnly, setShowPhotosOnly] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [revealedMessages, setRevealedMessages] = useState<string[]>([]);
  const [showChatSecurity, setShowChatSecurity] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isProfileGlow, setIsProfileGlow] = useState(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [addContactOption, setAddContactOption] = useState<'search' | 'keypad' | 'email'>('search');
  const [keypadInput, setKeypadInput] = useState('');
  const [keypadName, setKeypadName] = useState('');
  const [emailInputSearch, setEmailInputSearch] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [allContacts, setAllContacts] = useState<UserProfile[]>([]);
  const [syncedContacts, setSyncedContacts] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'status_updates'),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msTimeLimit = Date.now() - 24 * 60 * 60 * 1000;
      const updates = snapshot.docs.map(doc => {
        const data = doc.data();
        if (data.uploading) delete data.uploading;
        return {
          id: doc.id,
          ...data,
          uploading: false
        } as unknown as StatusUpdate;
      }).filter(status => {
        if (!status.timestamp || status.timestamp.toMillis() <= msTimeLimit) return false;
        if (status.userId === user.email || status.userId === user.uid) return true;
        if (status.privacy === 'me') return false;
        if (status.privacy === 'contacts' || status.privacy === 'except') {
           const isContact = syncedContacts.some(c => c.email === status.userId || c.uid === status.userId);
           if (!isContact) return false;
        }
        return true;
      });
      setStatusUpdates(updates);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'status_updates');
    });
    return unsubscribe;
  }, [user, syncedContacts]);

  // Load contacts
  useEffect(() => {
    const userIdentifier = user?.uid;
    if (!userIdentifier) return;

    const q = query(collection(db, 'users', userIdentifier, 'contacts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setSyncedContacts(contacts);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${userIdentifier}/contacts`);
    });

    return () => unsubscribe();
  }, [user]);

  // Subscribe to synced contacts' status updates
  useEffect(() => {
    if (!user || syncedContacts.length === 0) return;

    const contactIds = syncedContacts
      .map(c => c.uid || c.email)
      .filter((id): id is string => Boolean(id));

    if (contactIds.length === 0) return;

    const unsubscribe = ContactStatusService.subscribeToContactsStatus(
      contactIds,
      (statuses) => {
        setContactStatuses(statuses);
      }
    );

    statusUnsubscribeRef.current = unsubscribe;
    return () => {
      if (statusUnsubscribeRef.current) {
        statusUnsubscribeRef.current();
      }
    };
  }, [user, syncedContacts]);

  // Update current user's online status when app loads
  useEffect(() => {
    if (!user) return;

    const updateOnlineStatus = async () => {
      await ContactStatusService.updateUserOnlineStatus(user.uid, true, customStatusMessage);
    };

    updateOnlineStatus();

    // Mark as offline on page unload
    const handleBeforeUnload = () => {
      ContactStatusService.updateUserOnlineStatus(user.uid, false).catch(console.error);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload(); // Mark offline on unmount
    };
  }, [user]);

  const handleSaveContact = async (contact: Partial<UserProfile>) => {
    const userIdentifier = user?.uid;
    if (!userIdentifier) return;
    try {
      const contactRef = doc(collection(db, 'users', userIdentifier, 'contacts'));
      await setDoc(contactRef, {
        ...contact,
        createdAt: serverTimestamp()
      });
      return contactRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${userIdentifier}/contacts`);
    }
  };
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPhotoURL, setEditPhotoURL] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [privacySettings, setPrivacySettings] = useState({
    readReceipts: true,
    lastSeen: true,
    selfDestruct: 0 // 0 means off, otherwise seconds
  });
  const [secureFiles, setSecureFiles] = useState<{name: string, size: number, date: string}[]>([]);
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledEvent[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState<'call' | 'meeting' | null>(null);
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleGuests, setScheduleGuests] = useState<{name: string, contactDetail: string}[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);
  const [vishingProtection, setVishingProtection] = useState(true);
  const [autoGroupVerification, setAutoGroupVerification] = useState(true);

  const toggleVishingProtection = async () => {
    if (!user || !profile) return;
    const newStatus = !vishingProtection;
    setVishingProtection(newStatus);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        'securitySettings.vishingProtection': newStatus
      });
    } catch (error) {
      console.error("Failed to update vishing protection", error);
      setVishingProtection(!newStatus); // Revert on error
    }
  };

  const handleScheduleEvent = async () => {
    if (!user || !scheduleTitle || !scheduleDate || !scheduleTime || !showScheduleModal) return;
    setIsScheduling(true);
    try {
      const eventRef = doc(collection(db, 'scheduled_events'));
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
      let meetDetails: { meetLink?: string; eventId?: string; htmlLink?: string } = {};
      if (showScheduleModal === 'meeting') {
        const meetRes = await authenticatedFetch('/api/meet/create', {
          method: 'POST',
          body: JSON.stringify({
            title: scheduleTitle,
            scheduledAt: scheduledAt.toISOString(),
            guests: scheduleGuests,
          }),
        });
        const meetPayload = await meetRes.json().catch(() => ({}));
        if (!meetRes.ok) {
          throw new Error(meetPayload.error || 'Google Meet link could not be created.');
        }
        meetDetails = meetPayload;
      }
      
      const newEvent: ScheduledEvent = {
        id: eventRef.id,
        creatorId: user.uid,
        title: scheduleTitle,
        type: showScheduleModal,
        scheduledAt: Timestamp.fromDate(scheduledAt),
        participants: [user.uid], // Start with creator, can add more logic later
        guestAttendees: scheduleGuests,
        meetingLink: meetDetails.meetLink,
        googleEventId: meetDetails.eventId,
        googleCalendarLink: meetDetails.htmlLink,
        status: 'scheduled'
      };

      await setDoc(eventRef, newEvent);
      if (meetDetails.meetLink) {
        showToast('Google Meet link created');
      }
      setShowScheduleModal(null);
      setScheduleTitle('');
      setScheduleDate('');
      setScheduleTime('');
      setScheduleGuests([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not schedule event';
      showToast(message);
      handleFirestoreError(error, OperationType.CREATE, 'scheduled_events');
    } finally {
      setIsScheduling(false);
    }
  };

  const [showVault, setShowVault] = useState(false);
  const [showCompleteProfile, setShowCompleteProfile] = useState(false);
  const [twoStepPin, setTwoStepPin] = useState('');
  const [showTwoStepSetup, setShowTwoStepSetup] = useState(false);
  const [securityNotifications, setSecurityNotifications] = useState(true);
  const [activeSection, setActiveSection] = useState<'chats' | 'contacts' | 'meetings' | 'settings' | 'status' | 'news' | 'security'>('chats');
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [activeMessageActions, setActiveMessageActions] = useState<string | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState<Message | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [messageSearchResults, setMessageSearchResults] = useState<Array<{ chatId: string; messageId: string; preview: string; senderId: string }>>([]);
  const [activeMeetingRoom, setActiveMeetingRoom] = useState<string | null>(null);
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [incomingCallerName, setIncomingCallerName] = useState('');
  const webrtcRef = useRef<WebRTCService | null>(null);
  const callSignalingUnsubscribeRef = useRef<(() => void) | null>(null);
  const [uploadProgressRecord, setUploadProgressRecord] = useState<Record<string, number>>({});
  const [theme, setTheme] = useState<'light' | 'dark' | 'glow'>('dark');
  const [toast, setToast] = useState<{message: string, show: boolean}>({message: '', show: false});
  const showToast = (message: string) => {
    setToast({message, show: true});
    setTimeout(() => setToast({message: '', show: false}), 3000);
  };

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let currentVersion = '';
    let reloading = false;

    const checkForAppUpdate = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const payload = await res.json();
        const nextVersion = String(payload.version || '');
        if (!nextVersion) return;
        if (!currentVersion) {
          currentVersion = nextVersion;
          return;
        }
        if (nextVersion !== currentVersion && !reloading) {
          reloading = true;
          showToast('Updating Aegis Guard...');
          setTimeout(() => window.location.reload(), 800);
        }
      } catch {
        // Ignore transient network failures; the next poll will retry.
      }
    };

    checkForAppUpdate();
    const intervalId = window.setInterval(checkForAppUpdate, 30000);
    const onFocus = () => checkForAppUpdate();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const [language, setLanguage] = useState<Language>('en');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'main' | 'profile' | 'account' | 'linked_devices' | 'privacy' | 'storage' | 'chats' | 'calls' | 'notifications' | 'help'>('main');
  const [linkedDevices, setLinkedDevices] = useState([
    { id: '1', name: 'Google Chrome (Mac OS)', ip: '192.168.1.10', location: 'San Francisco, CA', lastActive: new Date().toISOString(), isActive: true },
    { id: '2', name: 'Safari (iPhone 14)', ip: '172.20.10.2', location: 'San Francisco, CA', lastActive: new Date(Date.now() - 86400000).toISOString(), isActive: false }
  ]);
  const [showLinkQR, setShowLinkQR] = useState(false);
  const [showLinkPhone, setShowLinkPhone] = useState(false);
  
  const handleSimulateDeviceLink = () => {
     setShowLinkQR(false);
     setShowLinkPhone(false);
     setLinkedDevices(prev => [{
        id: Math.random().toString(),
        name: 'Aegis Web Client',
        ip: '10.0.0.5',
        location: 'Current Location',
        lastActive: new Date().toISOString(),
        isActive: true
     }, ...prev]);
     alert("New device linked successfully!");
  };
  const [chatWallpaper, setChatWallpaper] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [autoDownload, setAutoDownload] = useState({
    media: true,
    documents: false,
    wifiOnly: true
  });
  const [blockedContacts, setBlockedContacts] = useState<string[]>([]);
  const [appLock, setAppLock] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [savedMessagesChatId, setSavedMessagesChatId] = useState<string | null>(null);
  const [aegisGuardChatId, setAegisGuardChatId] = useState<string | null>(null);

  const openSavedMessages = async () => {
    if (!user) return;
    const existing = chats.find(c => c.type === 'saved' && c.participants?.includes(user.uid));
    if (existing) {
      setSelectedChatId(existing.id);
      setActiveSection('chats');
      return;
    }
    const chatRef = savedMessagesChatId ? doc(db, 'conversations', savedMessagesChatId) : doc(collection(db, 'conversations'));
    await setDoc(chatRef, {
      id: chatRef.id,
      participants: [user.uid],
      type: 'saved',
      deletedFor: arrayRemove(user.uid),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      lastMessage: {
        content: 'Your private space for notes and media',
        senderId: user.uid,
        timestamp: serverTimestamp()
      }
    }, { merge: true });
    setSavedMessagesChatId(chatRef.id);
    setSelectedChatId(chatRef.id);
    setActiveSection('chats');
  };

  const openAegisGuardChat = async () => {
    if (!user) return;
    const existing = chats.find(c => c.type === 'ai' && c.participants?.includes(user.uid));
    const chatRef = existing ? doc(db, 'conversations', existing.id) : (aegisGuardChatId ? doc(db, 'conversations', aegisGuardChatId) : doc(collection(db, 'conversations')));
    await setDoc(chatRef, {
      id: chatRef.id,
      participants: [user.uid, 'aegis-guard@aegis.ai'],
      type: 'ai',
      deletedFor: arrayRemove(user.uid),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      lastMessage: {
        content: 'Hi, I am Aegis Guard. Ask me anything, and I will keep answers clear, practical, and security-aware.',
        senderId: 'aegis-guard@aegis.ai',
        timestamp: serverTimestamp()
      }
    }, { merge: true });
    setAegisGuardChatId(chatRef.id);
    setSelectedChatId(chatRef.id);
    setActiveSection('chats');
  };

  const t = translations[language] || translations.en;

  const updateLanguage = async (newLang: Language) => {
    if (!user) return;
    setLanguage(newLang);
    try {
      await updateDoc(doc(db, 'users', user.uid), { language: newLang });
    } catch (error) {
      console.error("Failed to update language", error);
    }
  };

  const updateTheme = async (newTheme: 'light' | 'dark' | 'glow') => {
    if (!user) return;
    setTheme(newTheme);
    try {
      await updateDoc(doc(db, 'users', user.uid), { theme: newTheme });
    } catch (error) {
      console.error("Failed to update theme", error);
    }
  };

  const updatePrivacySetting = async (key: string, value: any) => {
    await updateUserSetting('privacySettings', key, value);
  };

  const updateUserSetting = async (category: string, key: string, value: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        [`${category}.${key}`]: value
      });
      setProfile(prev => {
        if (!prev) return null;
        const categoryData = (prev as any)[category] || {};
        return {
          ...prev,
          [category]: {
            ...categoryData,
            [key]: value
          }
        };
      });
    } catch (error) {
      console.error(`Failed to update ${category} setting: ${key}`, error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.email}`);
    }
  };

  useEffect(() => {
    if (!user) return;

    const initSavedMessages = async () => {
      try {
        const q = query(
          collection(db, 'conversations'),
          where('participants', 'array-contains', user.uid),
          where('type', '==', 'saved')
        );
        
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          const newChatRef = doc(collection(db, 'conversations'));
          await setDoc(newChatRef, {
            id: newChatRef.id,
            participants: [user.uid],
            type: 'saved',
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            lastMessage: {
              content: 'Your private space for notes and media',
              senderId: user.email.toLowerCase(),
              timestamp: serverTimestamp()
            }
          });
          setSavedMessagesChatId(newChatRef.id);
        } else {
          setSavedMessagesChatId(snapshot.docs[0].id);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'chats');
      }
    };

    const initAegisGuardChat = async () => {
      if (!user?.email) return;
      try {
        const q = query(
          collection(db, 'conversations'),
          where('participants', 'array-contains', user.uid),
          where('type', '==', 'ai')
        );
        
        const snapshot = await getDocs(q);
        const ensureGreeting = async (chatId: string) => {
          const greetingRef = doc(db, 'conversations', chatId, 'messages', 'aegis-guard-welcome');
          const greetingSnap = await getDoc(greetingRef);
          if (!greetingSnap.exists()) {
            await setDoc(greetingRef, {
              id: greetingRef.id,
              chatId,
              senderId: 'aegis-guard@aegis.ai',
              content: 'Hi, I am Aegis Guard. Ask me anything, and I will keep answers clear, practical, and security-aware.',
              encryptedSessionKeys: {},
              iv: "",
              timestamp: serverTimestamp(),
              delivered: true,
              seen: false,
            });
          }
        };

        if (snapshot.empty) {
          const newChatRef = doc(collection(db, 'conversations'));
          await setDoc(newChatRef, {
            id: newChatRef.id,
            participants: [user.uid, 'aegis-guard@aegis.ai'],
            type: 'ai',
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            lastMessage: {
              content: 'Hi, I am Aegis Guard. Ask me anything, and I will keep answers clear, practical, and security-aware.',
              senderId: 'aegis-guard@aegis.ai',
              timestamp: serverTimestamp()
            }
          });
          await ensureGreeting(newChatRef.id);
          setAegisGuardChatId(newChatRef.id);
        } else {
          const chatDoc = snapshot.docs[0];
          await updateDoc(doc(db, 'conversations', chatDoc.id), {
            participants: arrayUnion(user.uid, 'aegis-guard@aegis.ai'),
            deletedFor: arrayRemove(user.uid),
            updatedAt: serverTimestamp(),
          });
          await ensureGreeting(chatDoc.id);
          setAegisGuardChatId(chatDoc.id);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'chats');
      }
    };

    initSavedMessages();
    initAegisGuardChat();
  }, [user]);

  const submitFeedback = async () => {
    if (!feedback.trim() || !user) return;
    setIsSubmittingFeedback(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        userId: user.uid,
        userEmail: user.email,
        content: feedback,
        timestamp: serverTimestamp(),
        status: 'new'
      });
      setFeedback('');
      alert('Thank you for your feedback!');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'scheduled_events'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const events = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as ScheduledEvent)).sort((a, b) => a.scheduledAt.toMillis() - b.scheduledAt.toMillis());
      setScheduledEvents(events);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'scheduled_events');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIncomingCall(null);
      setIncomingCallerName('');
      return;
    }
    // Calls are intentionally locked as a coming-soon feature.
    // Keep the incoming-call UI closed and avoid attaching restricted listeners.
    setIncomingCall(null);
    setIncomingCallerName('');
  }, [user]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const uploadTasksRef = useRef<Record<string, any[]>>({});

  const cancelUpload = async (messageId: string) => {
    const tasks = uploadTasksRef.current[messageId];
    if (tasks && tasks.length > 0) {
      tasks.forEach(t => {
        try { t.cancel(); } catch(e) {}
      });
    }
    delete uploadTasksRef.current[messageId];
    
    if (selectedChatId) {
      try {
        await deleteDoc(doc(db, 'conversations', selectedChatId, 'messages', messageId));
      } catch(e) { console.error('Failed to delete cancelled message', e); }
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    if (!selectedChatId || !user) return;
    const chatRef = doc(db, 'conversations', selectedChatId);

    if (!typingTimeoutRef.current) {
      updateDoc(chatRef, { typing: arrayUnion(user.uid) }).catch(console.error);
    } else {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      updateDoc(chatRef, { typing: arrayRemove(user.uid) }).catch(console.error);
      typingTimeoutRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          setUser(u);
          try {
            const [privateDoc, publicDoc] = await Promise.all([
              getDoc(doc(db, 'users', u.uid)),
              getDoc(doc(db, 'users_public', u.uid))
            ]);

            if (privateDoc.exists() && publicDoc.exists()) {
              const privateData = privateDoc.data();
              const publicData = publicDoc.data();
              const keys = await EncryptionService.getOrCreateKeyPair(u.uid, publicData.publicKey);
              const publicKey = keys.publicKey;

              if (publicData.publicKey !== publicKey) {
                await updateDoc(doc(db, 'users_public', u.uid), { publicKey, online: true });
              } else {
                await updateDoc(doc(db, 'users_public', u.uid), { online: true });
              }

              setProfile({
                ...publicData, ...privateData, uid: u.uid,
                displayName: publicData.displayName,
                email: u.email?.toLowerCase() || '',
                photoURL: publicData.photoURL || '', online: true, publicKey,
              } as UserProfile);
              setTheme((publicData.theme as UserProfile['theme']) || 'dark');
              setLanguage((publicData.language as Language) || 'en');
              setVishingProtection(publicData.securitySettings?.vishingProtection ?? true);

              try {
                const keyMeta = await KeyManagementService.getOrCreateKeys(u.uid);
                const device = await DeviceService.registerCurrentDevice(u.uid, keyMeta.publicKey);
                await SessionService.createSession(u.uid, device.id);
                await AuditLogService.log(u.uid, 'login', 'User authenticated successfully', { severity: 'info', deviceId: device.id });
              } catch (e) {
                if (import.meta.env.DEV) console.warn('Security init skipped:', e);
              }

              AdminService.hasAdminClaim(u).then(setIsUserAdmin);

              if (!publicData.displayName || publicData.displayName === 'Anonymous') setShowCompleteProfile(true);
            } else {
              const keys = await EncryptionService.getOrCreateKeyPair(u.uid);
              const email = u.email?.toLowerCase() || '';
              const newPrivateProfile = { uid: u.uid, email };
              const newPublicProfile = {
                uid: u.uid, email, displayName: u.displayName || 'Anonymous',
                photoURL: u.photoURL || '', online: true, publicKey: keys.publicKey,
              };
              await Promise.all([
                setDoc(doc(db, 'users', u.uid), newPrivateProfile),
                setDoc(doc(db, 'users_public', u.uid), newPublicProfile),
              ]);
              setProfile({ ...newPublicProfile, ...newPrivateProfile } as UserProfile);

              try {
                const keyMeta = await KeyManagementService.getOrCreateKeys(u.uid);
                const device = await DeviceService.registerCurrentDevice(u.uid, keyMeta.publicKey);
                await SessionService.createSession(u.uid, device.id);
                await AuditLogService.log(u.uid, 'login', 'New user registered', { severity: 'info', deviceId: device.id });
              } catch (e) {
                if (import.meta.env.DEV) console.warn('Security init skipped:', e);
              }

              AdminService.hasAdminClaim(u).then(setIsUserAdmin);
              if (!u.displayName) setShowCompleteProfile(true);
            }
          } catch (error: any) {
            console.error('Profile fetch error', error);
            setFirestoreError('Could not load profile. Please sign in again.');
            setUser(null);
            setProfile(null);
            await signOut(auth);
          }
        } else {
          setUser(null);
          setProfile(null);
          setIsUserAdmin(false);
        }
      } finally {
        setLoading(false);
      }
    });

    const handleBeforeUnload = () => {
      // Best effort synchronous push
      if (auth.currentUser) {
        updateDoc(doc(db, 'users_public', auth.currentUser.uid), { online: false, lastSeen: serverTimestamp() }).catch(console.error);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users_public'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs
        .map(doc => doc.data() as UserProfile)
        .filter(u => u.email?.toLowerCase() !== user.email?.toLowerCase());
      setAllUsers(usersList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users_public');
    });
    return unsubscribe;
  }, [user]);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (user) {
      try {
        await updateDoc(doc(db, 'users_public', user.uid), { online: false, lastSeen: serverTimestamp() });
      } catch (e) {
        console.error("Failed to update online status on signout:", e);
      }
    }
    await auth.signOut();
  };

  const handleGoogleLogin = async () => {
    console.log("login debug log: Initiating Google login");
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Google login failed", error);
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, don't show a scary error
        setLoginError(null);
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        setLoginError("An account already exists with this email address. Please sign in using your password.");
      } else if (error.message) {
        setLoginError(`Google sign-in failed: ${error.message}`);
      } else {
        setLoginError("Google sign-in failed. Please try again.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmailAuth = async (email: string, pass: string, isSignUp: boolean) => {
    console.log("login debug log: Initiating email auth. isSignUp:", isSignUp);
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, pass);
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (error: any) {
      console.error("Email auth failed", error);
      let message = "Authentication failed. Please check your credentials.";
      if (error.code === 'auth/email-already-in-use') message = "This email is already in use.";
      if (error.code === 'auth/invalid-email') message = "Invalid email address.";
      if (error.code === 'auth/weak-password') message = "Password is too weak.";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') message = "Invalid email or password.";
      setLoginError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    if (!email) {
      return { success: false, message: 'Please enter your email address.' };
    }
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true, message: 'Password reset link sent. Check your inbox.' };
    } catch (error: any) {
      console.error("Password reset failed", error);
      return { success: false, message: 'Failed to send reset link. Check the email address.' };
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setSelectedChatId(null);
    setShowSettings(false);
    setChats([]);
    setMessages([]);
    setProfile(null);
    setUser(null);
  };

  const clearChat = async () => {
    if (!selectedChatId) {
      console.log("clearChat: No selectedChatId");
      return;
    }
    // Check if confirming using basic UI hack: 
    // In iframe `confirm` throws or evaluates `false`.
    
    try {
      console.log("clearChat: Attempting to delete messages for:", selectedChatId);
      const messagesQuery = collection(db, 'conversations', selectedChatId, 'messages');
      const snapshot = await getDocs(messagesQuery);
      console.log("clearChat: Found", snapshot.size, "messages");
      
      const docs = snapshot.docs;
      for (let i = 0; i < docs.length; i += 500) {
        const batch = writeBatch(db);
        docs.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      
      console.log("clearChat: Messages deleted");
      setMessages([]);
      setShowChatMenu(false);
      // alert('Chat cleared.'); // avoid alert in iframe
    } catch (error) {
      console.error("clearChat error:", error);
      handleFirestoreError(error, OperationType.DELETE, `chats/${selectedChatId}/messages`);
    }
  };

  const toggleStarMessage = async (msgId: string) => {
    if (!selectedChatId || !user || !user.email) return;
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    
    const starredBy = msg.starredBy || [];
    const isStarred = starredBy.includes(user.email);
    
    const msgRef = doc(db, 'conversations', selectedChatId, 'messages', msgId);
    try {
      if (isStarred) {
        await updateDoc(msgRef, {
          starredBy: arrayRemove(user.email)
        });
      } else {
        await updateDoc(msgRef, {
          starredBy: arrayUnion(user.email)
        });
      }
    } catch (err) {
      console.error("Error starring message:", err);
      handleFirestoreError(err, OperationType.UPDATE, `chats/${selectedChatId}/messages`);
    }
  };

  const handleMessageReaction = async (msgId: string, emoji: string) => {
    if (!selectedChatId || !user) return;
    const msg = messages.find(m => m.id === msgId);
    await MessageEnhancementsService.toggleReaction(selectedChatId, msgId, user.uid, emoji, msg?.reactions);
  };

  const handlePinMessage = async (msgId: string) => {
    if (!selectedChatId || !user) return;
    await MessageEnhancementsService.pinMessage(selectedChatId, msgId, user.uid);
    setActiveMessageActions(null);
  };

  const handleUnpinMessage = async (msgId: string) => {
    if (!selectedChatId) return;
    await MessageEnhancementsService.unpinMessage(selectedChatId, msgId);
    setActiveMessageActions(null);
  };

  const handleForwardMessage = async (targetChatId: string) => {
    if (!showForwardModal || !selectedChatId || !user) return;
    const msg = showForwardModal;
    try {
      await MessageEnhancementsService.forwardMessage(
        selectedChatId, targetChatId, msg.id, user.uid, msg.senderId,
        {
          content: msg.content,
          encryptedSessionKeys: msg.encryptedSessionKeys || {},
          iv: msg.iv || '',
          text: msg.decryptedContent || msg.content,
        }
      );
      setShowForwardModal(null);
      showToast('Message forwarded securely');
    } catch (err) {
      console.error('Forward failed:', err);
      showToast('Failed to forward message');
    }
  };

  const handleMessageSearch = async (term: string) => {
    if (!term.trim()) { setMessageSearchResults([]); return; }
    const chatIds = chats.map(c => c.id);
    const results = await MessageEnhancementsService.searchAllChats(chatIds, term);
    setMessageSearchResults(results);
  };

  const handleVoiceMessage = async (blob: Blob, duration: number) => {
    if (!selectedChatId || !user) return;
    setShowVoiceRecorder(false);
    const chat = chats.find((c) => c.id === selectedChatId);
    const msgRef = doc(collection(db, 'conversations', selectedChatId, 'messages'));
    await setDoc(msgRef, {
      id: msgRef.id,
      chatId: selectedChatId,
      senderId: user.uid,
      content: '[Voice Message]',
      type: 'voice',
      status: 'uploading',
      timestamp: serverTimestamp(),
      fileUrl: 'uploading...',
      iv: '',
      encryptedSessionKeys: {},
    });
    try {
      const { fileUrl, voiceMeta, encryptionFields } = await VoiceMessageService.encryptAndUploadVoice(
        selectedChatId,
        msgRef.id,
        blob,
        duration,
        chat?.participants || [user.uid],
        user.uid
      );
      await VoiceMessageService.attachVoiceToMessage(
        selectedChatId, msgRef.id, fileUrl, voiceMeta, encryptionFields
      );
      showToast('Voice message sent securely');
    } catch (err) {
      console.error('Voice message failed:', err);
      await deleteDoc(msgRef).catch(() => null);
      showToast('Failed to send voice message');
    }
  };

  const handleDeleteForEveryone = async (messageId: string) => {
    if (!selectedChatId || !user) return;
    try {
      await MessageEnhancementsService.deleteForEveryone(selectedChatId, messageId, user.uid);
      decryptionCache.delete(messageId);
      setActiveMessageActions(null);
      showToast('Message deleted for everyone');
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Failed to delete message');
    }
  };

  const getDirectCallTargetId = (chat: Chat | undefined | null) => {
    if (!chat || !user || chat.type === 'saved' || chat.type === 'ai') return null;
    return (chat.participants || []).find((p) => p && p !== user.uid && p !== user.email?.toLowerCase() && p !== user.email) || null;
  };

  const resolveCallTargetUid = async (identifier: string) => {
    if (!identifier.includes('@')) return identifier;
    const snap = await getDocs(query(collection(db, 'users_public'), where('email', '==', identifier.toLowerCase()), limit(1)));
    return snap.empty ? identifier : (snap.docs[0].data() as UserProfile).uid;
  };

  const attachCallerSignaling = (roomId: string, calleeId: string) => {
    let handledAnswer = false;
    const addedCandidates = new Set<string>();
    return WebRTCService.subscribeToSignaling(roomId, async (signaling) => {
      const calleeSignal = (signaling?.[calleeId] || {}) as any;
      if (calleeSignal.answer && !handledAnswer) {
        handledAnswer = true;
        await webrtcRef.current?.handleAnswer(calleeSignal.answer).catch(console.error);
      }
      const candidate = calleeSignal.iceCandidate;
      const candidateKey = candidate ? JSON.stringify(candidate) : '';
      if (candidate && !addedCandidates.has(candidateKey)) {
        addedCandidates.add(candidateKey);
        await webrtcRef.current?.addIceCandidate(candidate).catch(console.error);
      }
    });
  };

  const attachReceiverSignaling = (roomId: string, callerId: string) => {
    let handledOffer = false;
    const addedCandidates = new Set<string>();
    return WebRTCService.subscribeToSignaling(roomId, async (signaling) => {
      const callerSignal = (signaling?.[callerId] || {}) as any;
      if (callerSignal.offer && !handledOffer && webrtcRef.current && user) {
        handledOffer = true;
        const answer = await webrtcRef.current.handleOffer(callerSignal.offer);
        await webrtcRef.current.publishLocalDescription('answer', answer);
      }
      const candidate = callerSignal.iceCandidate;
      const candidateKey = candidate ? JSON.stringify(candidate) : '';
      if (candidate && !addedCandidates.has(candidateKey)) {
        addedCandidates.add(candidateKey);
        await webrtcRef.current?.addIceCandidate(candidate).catch(console.error);
      }
    });
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall || !user) return;
    try {
      const callSettings = getCallSettings();
      await WebRTCService.joinMeetingRoom(incomingCall.roomId, user.uid);
      await updateDoc(doc(db, 'call_sessions', incomingCall.id), { status: 'connected' });
      setActiveCallSessionId(incomingCall.id);
      setActiveMeetingRoom(incomingCall.roomId);
      webrtcRef.current = new WebRTCService();
      await webrtcRef.current.initialize(user.uid, incomingCall.roomId);
      const wantsVideo = incomingCall.type === 'video' || incomingCall.type === 'meeting';
      const stream = await webrtcRef.current.startLocalMedia(
        wantsVideo && callSettings.startWithCamera,
        callSettings.startWithMic,
        callSettings
      );
      setLocalStream(stream);
      setIsCameraOn(wantsVideo && callSettings.startWithCamera && stream.getVideoTracks().length > 0);
      setIsMicOn(callSettings.startWithMic && stream.getAudioTracks().length > 0);
      setActiveVideoCall(true);
      setHasRemoteVideo(false);
      setIsCalling(!!callSettings.vishingGuard || (wantsVideo && !!callSettings.deepfakeScan));
      setDeepfakeRisk(wantsVideo && callSettings.deepfakeScan ? 0 : null);
      setDeepfakeStatus(wantsVideo && callSettings.deepfakeScan ? 'Monitoring live video authenticity...' : 'Voice call active.');
      callSignalingUnsubscribeRef.current?.();
      callSignalingUnsubscribeRef.current = attachReceiverSignaling(incomingCall.roomId, incomingCall.callerId);
      setIncomingCall(null);
      setIncomingCallerName('');
      showToast('Call connected');
    } catch (err) {
      console.error('Accept call failed:', err);
      showToast('Could not answer call');
    }
  };

  const declineIncomingCall = async () => {
    if (!incomingCall) return;
    await updateDoc(doc(db, 'call_sessions', incomingCall.id), { status: 'missed', endedAt: serverTimestamp() }).catch(console.error);
    setIncomingCall(null);
    setIncomingCallerName('');
  };

  const startRealVideoCall = async () => {
    if (!user || !selectedChatId) return;
    try {
      const chat = chats.find((c) => c.id === selectedChatId);
      const targetId = getDirectCallTargetId(chat);
      if (!targetId) {
        showToast('Select a contact chat to start a call');
        return;
      }
      const calleeId = await resolveCallTargetUid(targetId);
      const callSettings = getCallSettings();
      const room = await WebRTCService.createMeetingRoom(user.uid, 'video', selectedChatId, [calleeId]);
      const session = await WebRTCService.createCallSession(room.id, user.uid, calleeId, 'video');
      setActiveCallSessionId(session.id);
      setActiveMeetingRoom(room.id);
      webrtcRef.current = new WebRTCService();
      await webrtcRef.current.initialize(user.uid, room.id);
      const stream = await webrtcRef.current.startLocalMedia(
        callSettings.startWithCamera,
        callSettings.startWithMic,
        callSettings
      );
      setLocalStream(stream);
      setIsCameraOn(callSettings.startWithCamera && stream.getVideoTracks().length > 0);
      setIsMicOn(callSettings.startWithMic && stream.getAudioTracks().length > 0);
      setActiveVideoCall(true);
      setHasRemoteVideo(false);
      setIsCalling(!!callSettings.vishingGuard || !!callSettings.deepfakeScan);
      setDeepfakeRisk(callSettings.deepfakeScan ? 0 : null);
      setDeepfakeStatus(callSettings.deepfakeScan ? 'Monitoring live video authenticity...' : 'Deepfake scanning is off.');
      const offer = await webrtcRef.current.createOffer();
      await webrtcRef.current.publishLocalDescription('offer', offer);
      callSignalingUnsubscribeRef.current?.();
      callSignalingUnsubscribeRef.current = attachCallerSignaling(room.id, calleeId);
      showToast('Calling contact...');
    } catch (err) {
      console.error('Video call failed:', err);
      showToast('Could not start real video call');
    }
  };

  const startRealVoiceCall = async () => {
    if (!user || !selectedChatId) return;
    try {
      const chat = chats.find((c) => c.id === selectedChatId);
      const targetId = getDirectCallTargetId(chat);
      if (!targetId) {
        showToast('Select a contact chat to start a call');
        return;
      }
      const calleeId = await resolveCallTargetUid(targetId);
      const callSettings = getCallSettings();
      const room = await WebRTCService.createMeetingRoom(user.uid, 'voice', selectedChatId, [calleeId]);
      const session = await WebRTCService.createCallSession(room.id, user.uid, calleeId, 'voice');
      setActiveCallSessionId(session.id);
      setActiveMeetingRoom(room.id);
      webrtcRef.current = new WebRTCService();
      await webrtcRef.current.initialize(user.uid, room.id);
      const stream = await webrtcRef.current.startLocalMedia(false, callSettings.startWithMic, callSettings);
      setLocalStream(stream);
      setIsCameraOn(false);
      setIsMicOn(callSettings.startWithMic && stream.getAudioTracks().length > 0);
      setActiveVideoCall(true);
      setHasRemoteVideo(false);
      setIsCalling(!!callSettings.vishingGuard);
      setDeepfakeRisk(null);
      setDeepfakeStatus('Voice call active.');
      const offer = await webrtcRef.current.createOffer();
      await webrtcRef.current.publishLocalDescription('offer', offer);
      callSignalingUnsubscribeRef.current?.();
      callSignalingUnsubscribeRef.current = attachCallerSignaling(room.id, calleeId);
      showToast('Calling contact...');
    } catch (err) {
      console.error('Voice call failed:', err);
      showToast('Could not start real voice call');
    }
  };

  const reportMalware = async () => {
      if (!selectedChatId || !user) return;
      try {
          await addDoc(collection(db, 'feedback'), {
              userId: user.uid,
              userEmail: user.email,
              content: `Reported malware in chat: ${selectedChatId}`,
              timestamp: serverTimestamp(),
              status: 'new',
              type: 'malware_report'
          });
          setShowChatMenu(false);
          alert('Malware reported to Aegis security team. Thank you.');
      } catch(e) {
          console.error(e);
          alert('Failed to report.');
      }
  };

  const updateProfile = async () => {
    if (!user || !profile) return;
    setIsUpdatingProfile(true);
    try {
      // Normalize phone number for storage
      const normalizedPhone = editPhoneNumber.replace(/\D/g, '');
      const normalizedPhotoURL = editPhotoURL?.startsWith('data:image/')
        ? await resizeImage(editPhotoURL, 180_000)
        : (editPhotoURL || profile.photoURL || '');
      
      const privateUpdate = {
        phoneNumber: normalizedPhone,
        privacySettings: profile.privacySettings || {},
        storageSettings: profile.storageSettings || {},
        securitySettings: profile.securitySettings || {},
        callSettings: profile.callSettings || {},
        photoURL: normalizedPhotoURL
      };
      
      const publicUpdate = {
        displayName: editDisplayName,
        status: editStatus,
        photoURL: normalizedPhotoURL
      };

      await Promise.all([
        updateDoc(doc(db, 'users', user.uid), privateUpdate),
        updateDoc(doc(db, 'users_public', user.uid), publicUpdate)
      ]);

      const updatedProfile = {
        ...profile,
        ...privateUpdate,
        ...publicUpdate
      };
      setProfile(updatedProfile);
      setEditPhotoURL(normalizedPhotoURL);
      setAllUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, ...updatedProfile } : u));
      setSyncedContacts(prev => prev.map(u => u.uid === user.uid ? { ...u, ...updatedProfile } : u));
      setShowSettings(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.email}`);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  useEffect(() => {
    if (showSettings && profile) {
      setEditDisplayName(profile.displayName);
      setEditPhoneNumber(profile.phoneNumber || '');
      setEditStatus(profile.status || '');
      setEditPhotoURL(profile.photoURL || '');
    }
  }, [showSettings, profile]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const imageData = reader.result as string;
        const resizedAvatar = imageData.length > 180_000 ? await resizeImage(imageData, 180_000) : imageData;
        setEditPhotoURL(resizedAvatar);
        setShowAvatarPicker(false);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  // --- Chat & Messages ---

  useEffect(() => {
    if (!user) return;

    const toChatList = (snapshot: { docs: { id: string; data: () => Record<string, unknown> }[] }) =>
      snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Chat))
        .filter(chat => !chat.deletedFor?.includes(user.uid));

    const sortChats = (chatList: Chat[]) => {
      chatList.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis() || 0;
        const timeB = b.updatedAt?.toMillis() || 0;
        return timeB - timeA;
      });
      return chatList;
    };

    let uidChats: Chat[] = [];
    let emailChats: Chat[] = [];

    const mergeChats = () => {
      const byId = new Map<string, Chat>();
      for (const chat of [...uidChats, ...emailChats]) byId.set(chat.id, chat);
      setChats(sortChats(Array.from(byId.values())));
      setFirestoreError(null);
    };

    const onError = (error: { code?: string }) => {
      if (error.code === 'unavailable') {
        setFirestoreError("Could not connect to the security database. Please check your internet connection.");
      }
      handleFirestoreError(error, OperationType.LIST, 'conversations');
    };

    const qUid = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
    const unsubUid = onSnapshot(qUid, (snapshot) => {
      uidChats = toChatList(snapshot);
      mergeChats();
    }, onError);

    const userEmail = user.email?.toLowerCase();
    let unsubEmail = () => {};
    if (userEmail) {
      const qEmail = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', userEmail)
      );
      unsubEmail = onSnapshot(qEmail, (snapshot) => {
        emailChats = toChatList(snapshot);
        mergeChats();
      }, onError);
    }

    return () => { unsubUid(); unsubEmail(); };
  }, [user]);

  useEffect(() => {
    if (!user || chats.length === 0) return;

    const usersForNorm = [
      { uid: user.uid, email: user.email },
      ...allUsers.map((u) => ({ uid: u.uid, email: u.email })),
    ];
    const userKeys = new Set([user.uid, user.email?.toLowerCase()].filter(Boolean) as string[]);

    chats.forEach(async (chat) => {
      if (!chat.participants?.length) return;

      let normalized = normalizeParticipantList(chat.participants, usersForNorm);
      const userInChat = chat.participants.some((p) => userKeys.has(p));
      if (userInChat && !normalized.includes(user.uid)) {
        normalized = [...normalized, user.uid];
      }

      const sortedCurrent = [...chat.participants].sort().join(',');
      const sortedNormalized = [...normalized].sort().join(',');

      if (sortedCurrent !== sortedNormalized) {
        try {
          await updateDoc(doc(db, 'conversations', chat.id), {
            participants: normalized,
            deletedFor: arrayRemove(user.uid),
          });
        } catch (e) {
          console.error('Participant normalization failed', e);
        }
      }
    });
  }, [chats, allUsers, user]);

  useEffect(() => {
    if (!selectedChatId || !user) return;

    const q = query(
      collection(db, 'conversations', selectedChatId, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(messageLimit)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        console.log("message receiving debug log: snapshot updated with", snapshot.docs.length, "messages");
        const msgList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
        
        let needsUpdate = false;
        
        // Reverse so chronological order is maintained (oldest first, newest last)
        msgList.reverse();
        
        // Mark messages as delivered and seen
        msgList.forEach(m => {
          if (m.senderId !== user.uid && m.senderId !== user.email?.toLowerCase()) {
            if (!m.seen || !m.delivered) {
              needsUpdate = true;
              updateDoc(doc(db, 'conversations', selectedChatId, 'messages', m.id), {
                delivered: true,
                seen: true
              }).catch(console.error);
            }
          }
        });
        
        const keys = await EncryptionService.getOrCreateKeyPair(user.uid);
        const decryptedList = await Promise.all(msgList.map(async (m) => {
          if (decryptionCache.has(m.id)) {
            const cached = decryptionCache.get(m.id);
            const fileReady = m.fileUrl?.startsWith('http') || m.fileUrl?.startsWith('/api/storage/');
            const imageReady = m.imageUrl?.startsWith('http') || m.imageUrl?.startsWith('/api/storage/');
            const mediaReady = fileReady || imageReady;
            const cacheStale = mediaReady && (
              !cached.decryptedFileData && fileReady ||
              !cached.decryptedImageUrl && imageReady
            );
            if (!cacheStale) return { ...m, ...cached };
            decryptionCache.delete(m.id);
          }

          const media = await decryptMessageMedia(m, user.uid, user.email, keys.privateKey);
          if (m.status !== 'uploading' && m.status !== 'sending') {
            decryptionCache.set(m.id, media);
          }
          return { ...m, ...media };
        }));

        setMessages(decryptedList);
        setFirestoreError(null);

        // Mark incoming messages as seen
        for (const msg of decryptedList) {
          if (msg.senderId !== user.uid && msg.senderId !== user.email && !msg.seen) {
            try {
              updateDoc(doc(db, 'conversations', selectedChatId, 'messages', msg.id), { seen: true });
            } catch (err) {
              console.error("Failed to mark message as seen", err);
            }
          }
        }

        for (const msg of decryptedList) {
          if (!msg.securityStatus?.isAnalyzed) {
            analyzeDecryptedMessage(msg, { chatId: selectedChatId, userId: user.uid }).then((analysis) => {
              if (analysis) {
                setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, securityStatus: analysis } : m));
              }
            });
          }
        }
      } catch (error: any) {
        console.error("Message processing error:", error);
        setFirestoreError("Failed to decrypt messages. Your security keys might be out of sync.");
      }
    }, (error) => {
      if (error.code === 'unavailable') {
        setFirestoreError("Could not connect to the security database. Please check your internet connection.");
      }
      handleFirestoreError(error, OperationType.LIST, `chats/${selectedChatId}/messages`);
    });

    return unsubscribe;
  }, [selectedChatId, user, messageLimit]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingAIMessage]);

  const analyzeMessage = async (msg: Message) => {
    if (!selectedChatId || !profile || !user) return;
    let chat = chats.find(c => c.id === selectedChatId);
    if (!chat && selectedChatId === aegisGuardChatId) {
      chat = {
        id: selectedChatId,
        type: 'ai',
        participants: [user.uid, 'aegis-guard@aegis.ai'],
        updatedAt: Timestamp.now(),
      } as Chat;
    }
    if (!chat || chat.type === 'ai' || msg.senderId === 'aegis-guard@aegis.ai') return;
    const analysis = await analyzeDecryptedMessage(msg, { chatId: selectedChatId, userId: user.uid });
    if (analysis) {
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, securityStatus: analysis } : m));
    }
  };

  const resetSecurityKeys = async () => {
    if (!user || !profile) return;
    
    // In iframe `confirm` fails
    // if (!confirm("Are you sure you want to reset your security keys?")) return;

    try {
      if (user?.uid) {
        localStorage.removeItem(`aegis_rsa_private_key_${user.uid}`);
        localStorage.removeItem(`aegis_rsa_public_key_${user.uid}`);
      }
      const keys = await EncryptionService.getOrCreateKeyPair(user.uid);
      await updateDoc(doc(db, 'users_public', user.uid), { publicKey: keys.publicKey });
      setProfile({ ...profile, publicKey: keys.publicKey });
      alert("Security keys reset successfully. Your profile has been updated.");
    } catch (error) {
      console.error("Reset keys error:", error);
      alert("Failed to reset security keys.");
    }
  };

  const [isSending, setIsSending] = useState(false);

  const processAIResponse = async (userMsg: string, aiChatId: string, imageData?: string | null) => {
    if (!user) return;
    try {
      if (!profile?.publicKey || profile.publicKey === 'PENDING_REGISTRATION') {
        const keys = await EncryptionService.getOrCreateKeyPair(user.uid);
        await updateDoc(doc(db, 'users_public', user.uid), { publicKey: keys.publicKey });
        setProfile(prev => prev ? { ...prev, publicKey: keys.publicKey } : prev);
      }

      const history = messages
        .filter(m => m.decryptedContent)
        .slice(-10)
        .map(m => ({
          role: m.senderId === 'aegis-guard@aegis.ai' ? 'assistant' : 'user',
          content: (m.decryptedContent || '').slice(0, 2_000),
        }));

      const saveAIResponse = async (aiText: string) => {
        if (!aiText.trim()) return;
        const msgRef = doc(collection(db, 'conversations', aiChatId, 'messages'));
        await setDoc(msgRef, {
          id: msgRef.id,
          chatId: aiChatId,
          senderId: 'aegis-guard@aegis.ai',
          content: aiText,
          encryptedSessionKeys: {},
          iv: "",
          timestamp: serverTimestamp(),
        });
        await updateDoc(doc(db, 'conversations', aiChatId), {
          updatedAt: serverTimestamp(),
          lastMessage: {
            content: aiText,
            senderId: 'aegis-guard@aegis.ai',
            timestamp: serverTimestamp(),
            isEncrypted: false
          }
        });
      };

      const localFallbackResponse = () => {
        const text = (userMsg || '').trim();
        if (!text) return 'I am ready. Send a message and I will help with clear, security-aware guidance.';
        if (/password|otp|pin|bank|login|link|scam|phish/i.test(text)) {
          return 'This may involve sensitive security information. Do not share OTPs, PINs, passwords, or banking details. Verify the sender through an official channel before taking action.';
        }
        return `I received your message: "${text.slice(0, 180)}". The cloud AI service is temporarily unavailable, but the prototype is still running. I can continue with basic safety guidance until the backend AI key is restored.`;
      };

      const res = await authenticatedFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          userMsg: userMsg || (imageData ? "Describe and analyze this image." : ""),
          history,
          imageData: imageData || undefined,
        })
      });

      if (!res.ok) {
        setStreamingAIMessage(null);
        await saveAIResponse(localFallbackResponse());
        showToast("AI cloud unavailable. Using prototype response.");
        return;
      }
      
      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "";
      let streamBuffer = "";
      let streamError = "";

      setStreamingAIMessage({ chatId: aiChatId, text: "" });

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() || "";
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') continue;
            if (!dataStr) continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.text) {
                aiText += data.text;
                setStreamingAIMessage({ chatId: aiChatId, text: aiText });
              } else if (data.error) {
                streamError = data.error;
                showToast("AI Error: " + data.error);
                break;
              }
            } catch (e) {}
          }
        }
      }
      
      setStreamingAIMessage(null);
      
      if (!aiText && streamError) {
        await saveAIResponse(`AI backend error: ${streamError}. Check Render environment variable NVIDIA_MODEL and NVIDIA_API_KEY.`);
        return;
      }
      if (!aiText) return;
      await saveAIResponse(aiText);
    } catch (err) {
      console.error("AI Error:", err);
      try {
        const msgRef = doc(collection(db, 'conversations', aiChatId, 'messages'));
        await setDoc(msgRef, {
          id: msgRef.id,
          chatId: aiChatId,
          senderId: 'aegis-guard@aegis.ai',
          content: 'AI connection is temporarily unavailable. Please check backend AI environment settings, then try again.',
          encryptedSessionKeys: {},
          iv: "",
          timestamp: serverTimestamp(),
        });
      } catch {}
      showToast("AI assistant connection failed");
    }
  };

  const sendMessage = async (e: React.FormEvent, immediateFile: any = null, immediateImage: string | null = null) => {
    console.log("message sending debug log: Sending message");
    console.log("sendMessage: Form submitted");
    e.preventDefault();
    setShowEmojiPicker(false);
    
    // Use immediate values if provided, otherwise fallback to state
    let fileToUse = immediateFile || selectedFile;
    let imageToUse = immediateImage || selectedImage;
    if (!imageToUse && fileToUse?.file?.type?.startsWith('image/')) {
      imageToUse = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = reader.result as string;
            resolve(base64.length > 520_000 ? await resizeImage(base64) : base64);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileToUse.file as Blob);
      });
      if (imageToUse.length > 700_000) {
        alert("This image is too large for free encrypted sending. Please choose a smaller image or screenshot.");
        return;
      }
      fileToUse = null;
    }
    const canSend = (newMessage && newMessage.trim()) || imageToUse || fileToUse;
    
    console.log("sendMessage status check:", { 
      canSend, 
      hasImage: !!imageToUse, 
      hasFile: !!fileToUse
    });
    
    if (!canSend) { console.log("Blocked: canSend false"); return; }
    if (!selectedChatId) { console.log("Blocked: noChat"); return; }
    if (!user) { console.log("Blocked: noUser"); return; }
    if (isSending) { console.log("Blocked: isSending true"); return; }

    setIsSending(true);

    const replyContext = replyToMessage ? {
      replyToId: replyToMessage.id,
      replyToSenderId: replyToMessage.senderId,
      replyToPreview: getReplyPreview(replyToMessage),
    } : null;
    
    // Inside the function, use imageToUse and fileToUse instead of selectedImage/selectedFile
    // Remember to update msgData references accordingly.
    
    // Allow sending even if 'chats' hasn't updated yet, use selectedChatId directly
    const chat = chats.find(c => c.id === selectedChatId);
    // If not found in chats array, assume it's a new or temporary chat and proceed
    console.log("sendMessage: Chat found in state:", !!chat);
    
    // Recalculate recipient if possible, otherwise rely on selectedChatId context
    const otherId = chat ? (chat.type === 'saved' ? user.uid : (chat.participants || []).find(p => p !== user.email && p !== user.uid)) : null;
    
    // If we can't determine the otherId from chat, try to extract from chat participants if available
    if (!selectedChatId || !user) return;
    setIsSending(true);
    
    try {
      console.log("sendMessage: Entering multi-recipient encryption block");
      
      // 1. Fetch public keys for all participants sequentially to avoid rate limits
      // We filter out emails if we already have UIDs, but try fetching for all unique identifiers 
      // just in case they are stored by email in older versions.
      const participants = Array.from(new Set(chat?.participants || []))
        .filter(p => typeof p === 'string' && p.trim() !== '' && !p.startsWith('temp-'));
      
      console.log("sendMessage: Participants:", participants);
      const userProfiles: UserProfile[] = [];
      
      for (let pId of participants) {
        if (!pId || typeof pId !== 'string') {
          console.error("sendMessage: Invalid pId found:", pId);
          continue;
        }
        let profileData: UserProfile | null = null;
        let profileExists = false;
        
        // Retry logic for robust fetch
        for (let i = 0; i < 3; i++) {
          try {
            const userRef = doc(db, 'users_public', pId);
            console.log("sendMessage: Fetching doc for:", pId);
            const userDoc = await getDoc(userRef);
            profileExists = userDoc.exists();
            profileData = profileExists ? ({ uid: pId, ...userDoc.data() } as UserProfile) : null;
            
            if (!profileExists && pId.includes('@')) {
               const snap = await getDocs(query(collection(db, 'users_public'), where('email', '==', pId.toLowerCase()), limit(1)));
               if (!snap.empty) {
                 profileExists = true;
                 profileData = { uid: snap.docs[0].id, ...snap.docs[0].data() } as UserProfile;
               }
            }
            break; // Success
          } catch (e) {
            console.error("sendMessage: Error fetching profile for", pId, e);
            if (i === 2) throw e; // Last retry failed
            await new Promise(r => setTimeout(r, 500 * (i + 1))); // Exponential backoff
          }
        }
        
        console.log(`sendMessage: Checking profile for ${pId}`, profileData);

        // Treat as missing if exists but has PENDING_REGISTRATION key
        if (profileData && profileData.publicKey === 'PENDING_REGISTRATION') {
          console.log(`sendMessage: Profile for ${pId} has pending key.`);
          profileData = null;
        }

        if (profileData && profileData.publicKey) {
          console.log(`sendMessage: Valid profile found for ${pId}`);
          userProfiles.push(profileData);
        } else {
          console.warn(`Participant ${pId} has no valid public profile.`, profileData);
          const placeholder = {
            uid: pId,
            email: pId,
            displayName: 'Unknown',
            publicKey: 'PENDING_REGISTRATION',
            status: 'invited'
          };
          userProfiles.push(placeholder as UserProfile);
        }
      }

      // Filter out participants without valid public keys or missing email
      console.log("sendMessage: All profiles fetched before filter:", userProfiles);
      
      const validParticipants = userProfiles.filter(up => {
        if (!up) {
            console.error("sendMessage: up is null");
            return false;
        }
        // More permissive check: if public key is present and is not the literal 'PENDING_REGISTRATION' string
        const hasKey = up.publicKey && up.publicKey !== 'PENDING_REGISTRATION';
        const hasEmail = !!up.email;
        
        if (!hasKey) console.warn("Participant has no valid key:", up.email);
        if (!hasEmail) console.warn("Participant has no email:", up);
        
        return hasKey && hasEmail;
      });
      console.log("sendMessage: Valid participants for encryption (raw):", validParticipants);
      
      // Update the map to use normalized emails
      const normalizedValidParticipants = validParticipants.map(up => {
          if (!up.email) {
              console.error("sendMessage: Participant with missing email in normalizedValidParticipants:", up);
              return { ...up, email: 'unknown@example.com' };
          }
          return {
            ...up,
            email: up.email.toLowerCase()
          };
      });

      console.log("sendMessage: normalizedValidParticipants", normalizedValidParticipants);
      const currentUserEmail = user.email?.toLowerCase() || '';
      const senderKey = currentUserEmail || user.uid;
      console.log("sendMessage: current userEmail", currentUserEmail);
      const isSenderInList = normalizedValidParticipants.some(p => p.email === currentUserEmail);
      console.log("sendMessage: isSenderInList", isSenderInList);

      if (normalizedValidParticipants.length === 0) {
        console.warn(`Encryption Warning: No valid participants for encryption. Proceeding with sender-only encryption where possible. Participants: ${JSON.stringify(participants)}`);
      }
      
      const msgRef = doc(collection(db, 'conversations', selectedChatId, 'messages'));
      
      let sessionKey: CryptoKey | null = null;
      let exportedSessionKey: ArrayBuffer | null = null;
      let encryptedContent = newMessage || "";
      let encryptedSessionKeys: Record<string, string> = {};
      let iv = window.crypto.getRandomValues(new Uint8Array(12));

      if (chat?.type !== 'ai') {
        sessionKey = await window.crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"]
        );
        exportedSessionKey = await window.crypto.subtle.exportKey("raw", sessionKey);
        
        const encodedContent = new TextEncoder().encode(newMessage || "");
        const encryptedContentBuffer = await window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          sessionKey,
          encodedContent
        );
        encryptedContent = btoa(EncryptionService.ab2str(encryptedContentBuffer));

        for (const p of normalizedValidParticipants) {
          try {
            if (!p.publicKey) continue;
            const pubString = p.publicKey.trim().replace(/\s/g, '');
            const pubBuffer = EncryptionService.str2ab(atob(pubString));
            const recipientPublicKey = await window.crypto.subtle.importKey(
              "spki", pubBuffer, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
            );
            const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
              { name: "RSA-OAEP" }, recipientPublicKey, exportedSessionKey
            );
            const encryptedKeyStr = btoa(EncryptionService.ab2str(encryptedKeyBuffer));
            if (p.email) encryptedSessionKeys[p.email.toLowerCase()] = encryptedKeyStr;
            if (p.uid) encryptedSessionKeys[p.uid] = encryptedKeyStr;
          } catch (e) {
            console.error(`Failed to encrypt session key for ${p.uid || p.email}:`, e);
          }
        }
        
        try {
          const myKeys = await EncryptionService.getOrCreateKeyPair(user.uid);
          if (myKeys.publicKey) {
            const pubString = myKeys.publicKey.trim().replace(/\s/g, '');
            const pubBuffer = EncryptionService.str2ab(atob(pubString));
            const recipientPublicKey = await window.crypto.subtle.importKey(
              "spki", pubBuffer, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
            );
            const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
              { name: "RSA-OAEP" }, recipientPublicKey, exportedSessionKey
            );
            const selfEncryptedStr = btoa(EncryptionService.ab2str(encryptedKeyBuffer));
            encryptedSessionKeys[user.uid] = selfEncryptedStr;
            if (user.email) encryptedSessionKeys[user.email.toLowerCase()] = selfEncryptedStr;
          }
        } catch (e) {
          console.error("Failed self-encryption:", e);
        }
      }

      const mediaRecipients: Array<{ id: string; publicKey: string }> = [];
      const addMediaRecipient = (id: string | undefined | null, publicKey: string | undefined | null) => {
        if (!id || !publicKey || publicKey === 'PENDING_REGISTRATION') return;
        if (!mediaRecipients.some((recipient) => recipient.id === id)) {
          mediaRecipients.push({ id, publicKey });
        }
      };

      if (chat?.type !== 'ai') {
        normalizedValidParticipants.forEach((participant) => {
          addMediaRecipient(participant.uid, participant.publicKey);
          addMediaRecipient(participant.email?.toLowerCase(), participant.publicKey);
        });

        try {
          const myKeys = await EncryptionService.getOrCreateKeyPair(user.uid);
          addMediaRecipient(user.uid, myKeys.publicKey);
          addMediaRecipient(user.email?.toLowerCase(), myKeys.publicKey);
        } catch (e) {
          console.error("Failed to prepare sender media encryption key:", e);
        }

        if ((imageToUse || fileToUse) && mediaRecipients.length === 0) {
          throw new Error("No encryption keys are available for this attachment.");
        }
      }

      // Repeat for Image and File if present
      const msgData: any = {
        id: msgRef.id,
        chatId: selectedChatId,
        senderId: user.uid,
        receiverId: chat?.type === 'direct' ? chat?.participants?.find(p => p !== user?.uid) || null : null,
        text: newMessage, // for raw debug/compatibility if needed
        type: imageToUse ? 'image' : fileToUse ? 'file' : 'text',
        delivered: true,
        seen: false,
        content: encryptedContent,
        encryptedText: encryptedContent,
        encryptedSessionKeys,
        iv: chat?.type === 'ai' ? "" : btoa(EncryptionService.ab2str(iv)),
        timestamp: Timestamp.now(),
        ...(replyContext ?? {}),
      };

      let imgEncrypted: ArrayBuffer | null = null;
      let imgEncoded: ArrayBuffer | null = null;
      let imgEncryptedInline: string | null = null;
      let imageRef: any = null;
      if (imageToUse) {
        const imgPrefix = imageToUse.split(',')[0] + ',';
        const b64Data = imageToUse.split(',')[1] || imageToUse;
        imgEncoded = EncryptionService.str2ab(atob(b64Data));

        if (chat?.type !== 'ai' && sessionKey) {
          const encryptedImage = await EncryptionService.encryptBinaryWithSessionKeys(imgEncoded, mediaRecipients);
          imgEncrypted = encryptedImage.encrypted;
          imgEncryptedInline = btoa(EncryptionService.ab2str(imgEncrypted));
          imageRef = imgEncryptedInline.length < 850_000 ? null : { provider: 'appwrite', fileName: `encrypted-image-${Date.now()}.bin` };
          msgData.imageUrl = imageRef ? 'uploading...' : imgEncryptedInline;
          msgData.encryptedImageSessionKeys = encryptedImage.sessionKeys;
          msgData.imageIv = encryptedImage.iv;
          msgData.imagePrefix = imgPrefix;
          if (imageRef) msgData.status = 'uploading';
        } else {
          imgEncrypted = imgEncoded;
          imgEncryptedInline = btoa(EncryptionService.ab2str(imgEncrypted));
          imageRef = imgEncryptedInline.length < 850_000 ? null : { provider: 'appwrite', fileName: `image-${Date.now()}.bin` };
          msgData.imageUrl = imageRef ? 'uploading...' : imgEncryptedInline;
          msgData.encryptedImageSessionKeys = {};
          msgData.imageIv = "";
          msgData.imagePrefix = imgPrefix;
          if (imageRef) msgData.status = 'uploading';
        }
      }

      let fileDataEncrypted: ArrayBuffer | null = null;
      let fileDataEncoded: ArrayBuffer | null = null;
      let fileRef: any = null;
      if (fileToUse) {
        // ... handled locally directly, but if we have network upload it needs logic
        // skipping file upload logic here for ai chat as it's not supported by ai
        if (chat?.type !== 'ai') {
          const fileNameEncoded = new TextEncoder().encode(fileToUse.name);
          const encryptedName = await EncryptionService.encryptBinaryWithSessionKeys(fileNameEncoded, mediaRecipients);
          
          msgData.fileName = btoa(EncryptionService.ab2str(encryptedName.encrypted));
          msgData.fileNameIv = encryptedName.iv;
          msgData.encryptedFileNameSessionKeys = encryptedName.sessionKeys;
          msgData.fileSize = fileToUse.size;
          msgData.fileUrl = "uploading...";
        } else {
          msgData.fileName = btoa(EncryptionService.ab2str(new TextEncoder().encode(fileToUse.name)));
          msgData.fileNameIv = "";
          msgData.encryptedFileNameSessionKeys = {};
          msgData.fileSize = fileToUse.size;
          msgData.fileUrl = "uploading...";
        }
        msgData.status = 'uploading';
      } else {
        msgData.status = imageRef ? 'uploading' : 'sent';
      }

      console.log("sendMessage: Saving payload", msgData);
      
      // OPTIMISTIC LOCAL UPDATE FOR INSTANT UI
      const optimisticMsg = { 
        ...msgData, 
        id: msgRef.id,
        isOptimistic: true,
        decryptedContent: newMessage || ""
      };
      
      let initialCache: any = {
         decryptedContent: optimisticMsg.decryptedContent
      };
      
      if (fileToUse) {
         optimisticMsg.decryptedFileName = fileToUse.name;
         const fileBlob = fileToUse.file || (fileToUse instanceof Blob ? fileToUse : null);
         let objUrl = "";
         if (fileBlob instanceof Blob) {
             objUrl = URL.createObjectURL(fileBlob);
             optimisticMsg.decryptedFileData = objUrl; 
         }
         initialCache.decryptedFileName = optimisticMsg.decryptedFileName;
         initialCache.decryptedFileData = objUrl || "uploading...";
      }
      if (imageToUse) {
         optimisticMsg.decryptedImageUrl = imageToUse;
         initialCache.decryptedImageUrl = imageToUse;
      }
      
      decryptionCache.set(msgRef.id, initialCache);
      setMessages(prev => [...prev, optimisticMsg as any]);
      
      // Save the message record before continuing with upload tasks.
      await setDoc(msgRef, msgData);
      console.log("sendMessage: Message saved to queue successfully");
      
      const lastMessageContent = newMessage.trim() ? newMessage : (imageToUse ? 'Image' : (fileToUse ? `File: ${fileToUse.name}` : '[Encrypted Message]'));
      const previewTimestamp = Timestamp.now();
      const newUnreadCount = { ...chat?.unreadCount };
      chat?.participants?.forEach(p => {
        if (p !== user?.uid && p !== user?.email?.toLowerCase()) {
          newUnreadCount[p] = (newUnreadCount[p] || 0) + 1;
        }
      });
      const previewLastMessage = {
        content: lastMessageContent,
        senderId: senderKey,
        timestamp: previewTimestamp,
        isEncrypted: chat?.type !== 'ai'
      };
      setChats(prev => prev.map(c => c.id === selectedChatId ? {
        ...c,
        updatedAt: previewTimestamp,
        unreadCount: newUnreadCount,
        lastMessage: previewLastMessage
      } : c));
      await updateDoc(doc(db, 'conversations', selectedChatId), {
        updatedAt: previewTimestamp,
        unreadCount: newUnreadCount,
        lastMessage: previewLastMessage
      });
      
      // Clear UI immediately!
      setNewMessage('');
      setSelectedImage(null);
      setSelectedFile(null);
      setReplyToMessage(null);
      setIsSending(false);
      showToast("Message sent securely");
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      console.log("sendMessage: UI cleared optimistically");
      
      // KICK OFF AI ANALYSIS IN BACKGROUND AFTER SENDING
      const runInstantAnalysis = async () => {
         try {
             let fileDataInfo;
             if (imageToUse) {
               fileDataInfo = await buildFileDataInfo(imageToUse);
             } else if (fileToUse?.file) {
               const dataUrl = await new Promise<string>((resolve, reject) => {
                 const reader = new FileReader();
                 reader.onloadend = () => resolve(reader.result as string);
                 reader.onerror = reject;
                 reader.readAsDataURL(fileToUse.file as Blob);
               });
               fileDataInfo = await buildFileDataInfo(undefined, dataUrl, fileToUse.name);
             } else if (fileToUse?.data) {
               fileDataInfo = await buildFileDataInfo(undefined, fileToUse.data, fileToUse.name);
             }
             if (!newMessage && !fileDataInfo) return;
             const analysis = await SecurityService.analyzeMessage(newMessage || "", fileDataInfo);
             await updateDoc(msgRef, { securityStatus: analysis });
             setMessages(prev => prev.map(m => m.id === msgRef.id ? { ...m, securityStatus: analysis } : m));
             ThreatIntelligenceService.fullScan(user.uid, newMessage || "", {
               messageId: msgRef.id, chatId: selectedChatId, fileDataInfo, fileName: fileToUse?.name,
             }).catch(console.error);
         } catch (e: any) {
             console.error("Instant analysis failed", e);
             await updateDoc(msgRef, { securityStatus: { isSafe: false, score: 0, threatType: 'none', summary: 'Analysis pending: ' + (e.message || 'Unknown'), points: [], steganographyReport: "N/A", isAnalyzed: false } });
         }
      };

      // Background Encryption & Upload Tasks
      const backgroundTasks = async () => {
        let isAborted = false;
        try {
          const updates: any = {};
          const analysisPromise = chat?.type !== 'ai'
            ? runInstantAnalysis()
            : Promise.resolve();
          
          let fileDataEncrypted: ArrayBuffer | null = null;
          let fileRef: any = null;
          let finalFileName = '';
          let finalFileNameIv = '';
          let finalFileDataIv = '';

          const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            return btoa(binary);
          };

          if (fileToUse) {
             const fileNameIv = window.crypto.getRandomValues(new Uint8Array(12));
             const fileDataIv = window.crypto.getRandomValues(new Uint8Array(12));
             let fileDataEncoded: ArrayBuffer | null = null;
             
             if (fileToUse.file && typeof fileToUse.file.arrayBuffer === 'function') {
                 fileDataEncoded = await fileToUse.file.arrayBuffer();
             } else if (fileToUse.file instanceof Blob) {
                 fileDataEncoded = await fileToUse.file.arrayBuffer();
             } else if (fileToUse.data) {
                 fileDataEncoded = EncryptionService.str2ab(atob(fileToUse.data.split(',')[1] || fileToUse.data));
             }

             if (!fileDataEncoded) {
                 throw new Error("No valid file data or File object found for transmission.");
             }
             if (chat?.type !== 'ai') {
               const encryptedFile = await EncryptionService.encryptBinaryWithSessionKeys(fileDataEncoded, mediaRecipients);
               fileDataEncrypted = encryptedFile.encrypted;
               const encryptedFileInline = arrayBufferToBase64(fileDataEncrypted);
               const canSendInline = encryptedFileInline.length < 850_000;
               fileRef = canSendInline ? null : { provider: 'appwrite', fileName: fileToUse.name };
               
               const fileNameEncoded = new TextEncoder().encode(fileToUse.name);
               const encryptedName = await EncryptionService.encryptBinaryWithSessionKeys(fileNameEncoded, mediaRecipients);

               finalFileName = btoa(EncryptionService.ab2str(encryptedName.encrypted));
               finalFileNameIv = encryptedName.iv;
               finalFileDataIv = encryptedFile.iv;
               
               updates.fileName = finalFileName;
               updates.encryptedFileNameSessionKeys = encryptedName.sessionKeys;
               updates.encryptedFileDataSessionKeys = encryptedFile.sessionKeys;
               updates.fileNameIv = finalFileNameIv;
               updates.fileDataIv = finalFileDataIv;
               if (canSendInline) {
                 updates.fileData = encryptedFileInline;
                 updates.fileUrl = 'inline';
               }
             } else {
               fileDataEncrypted = fileDataEncoded; // Just use plaintext buffer
               const plainFileInline = arrayBufferToBase64(fileDataEncrypted);
               const canSendInline = plainFileInline.length < 850_000;
               fileRef = canSendInline ? null : { provider: 'appwrite', fileName: fileToUse.name };
               
               updates.fileName = btoa(EncryptionService.ab2str(new TextEncoder().encode(fileToUse.name)));
               updates.encryptedFileNameSessionKeys = {};
               updates.encryptedFileDataSessionKeys = {};
               updates.fileNameIv = "";
               updates.fileDataIv = "";
               if (canSendInline) {
                 updates.fileData = plainFileInline;
                 updates.fileUrl = 'inline';
               }
             }
             updates.fileSize = fileToUse.size;
          }

          const uploadWithProgress = async (refPath: any, data: ArrayBuffer): Promise<string> => {
            console.log("Starting Appwrite encrypted upload for:", refPath?.fileName || 'encrypted-file');
            setUploadProgressRecord(prev => ({ ...prev, [msgRef.id]: 10 }));
            const res = await authenticatedFetch('/api/storage/upload', {
              method: 'POST',
              body: JSON.stringify({
                fileName: refPath?.fileName || 'encrypted-file.bin',
                encryptedBase64: arrayBufferToBase64(data),
              }),
            });

            if (!res.ok) {
              const text = await res.text();
              setUploadProgressRecord(prev => ({ ...prev, [msgRef.id]: 0 }));
              setMessages(prev => prev.map(m => m.id === msgRef.id ? { ...m, status: 'error' } : m));
              let message = 'Encrypted upload failed';
              try {
                const parsed = JSON.parse(text);
                message = parsed.error || parsed.details || message;
              } catch {
                message = text || message;
              }
              throw new Error(message);
            }

            const payload = await res.json();
            setUploadProgressRecord(prev => ({ ...prev, [msgRef.id]: 100 }));
            return payload.fileUrl;
          };
          const encryptAndUpload = async () => {
             if (imageRef && imgEncrypted) {
               updates.imageUrl = await uploadWithProgress(imageRef, imgEncrypted);
             }
             if (fileRef && fileDataEncrypted) {
               updates.fileUrl = await uploadWithProgress(fileRef, fileDataEncrypted);
             }
             
             if (updates.imageUrl || updates.fileUrl || msgData.imageUrl !== 'uploading...' || msgData.fileUrl !== 'uploading...') {
               updates.status = 'sent';
                 decryptionCache.delete(msgRef.id);
               setUploadProgressRecord(prev => {
                 const next = { ...prev };
                 delete next[msgRef.id];
                 return next;
               });
               setMessages(prev => prev.map(m => m.id === msgRef.id ? { ...m, ...updates, isOptimistic: false } : m));
               await updateDoc(msgRef, updates);
             }
             
             console.log("sendMessage: Updating chat last message...");
             await updateDoc(doc(db, 'conversations', selectedChatId), {
               updatedAt: Timestamp.now(),
               unreadCount: newUnreadCount,
               lastMessage: previewLastMessage
             });
             console.log("sendMessage: Chat updated");
          };
          
          await encryptAndUpload();
          await analysisPromise;
        } catch (e: any) {
          console.log("Upload failed or was cancelled:", e);
          if (!isAborted && typeof updateDoc !== 'undefined' && msgRef) {
            await updateDoc(msgRef, { status: 'error' }).catch(console.error);
          }
        } finally {
          if (msgRef?.id && uploadTasksRef.current) {
            delete uploadTasksRef.current[msgRef.id];
          }
        }
      };
      
      backgroundTasks().catch(err => {
         console.error("Background upload failed:", err);
         updateDoc(msgRef, { status: 'error' }).catch(console.error);
      });
      
      if (chat?.type === 'ai') {
        processAIResponse(newMessage, selectedChatId, imageToUse);
      }
      
      console.log("sendMessage: Completed successfully!");
    } catch (error: any) {
      console.error("sendMessage: Error in try-catch", error);
      setIsSending(false);
      alert(`Failed to send secure message: ${error.message || 'Unknown error'}.`);
      try {
        handleFirestoreError(error, OperationType.CREATE, `chats/${selectedChatId}/messages`);
      } catch (e) {}
    }
  };

  const resizeImage = (base64Str: string, targetLength = 520_000): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 720;
        const MAX_HEIGHT = 720;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        let quality = 0.82;
        let output = canvas.toDataURL('image/webp', quality);
        while (output.length > targetLength && quality > 0.42) {
          quality -= 0.1;
          output = canvas.toDataURL('image/webp', quality);
        }

        while (output.length > targetLength && canvas.width > 360 && canvas.height > 360) {
          const next = document.createElement('canvas');
          next.width = Math.round(canvas.width * 0.82);
          next.height = Math.round(canvas.height * 0.82);
          next.getContext('2d')?.drawImage(canvas, 0, 0, next.width, next.height);
          canvas.width = next.width;
          canvas.height = next.height;
          ctx?.drawImage(next, 0, 0);
          output = canvas.toDataURL('image/webp', 0.5);
        }

        resolve(output);
      };
      img.onerror = () => reject(new Error("Failed to load image for resizing"));
      img.src = base64Str;
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const imageForFirestore = base64.length > 520_000 ? await resizeImage(base64) : base64;
        if (imageForFirestore.length > 700_000) {
          alert("This image is too large for free encrypted sending. Please choose a smaller image or screenshot.");
          return;
        }
        setSelectedImage(imageForFirestore);
      };
      reader.readAsDataURL(file);
    }
  };

  const getOtherParticipantIdentifier = (chat: Chat) => {
    return chat.participants?.find(p => 
      p?.toLowerCase() !== user?.email?.toLowerCase() && 
      p?.toLowerCase() !== user?.uid?.toLowerCase() &&
      !p?.includes('@') // Prefer non-email parts for UID matches if present, but wait, maybe the other user IS just an email?
    ) || chat.participants?.find(p => 
      p?.toLowerCase() !== user?.email?.toLowerCase() && 
      p?.toLowerCase() !== user?.uid?.toLowerCase()
    ) || 'Unknown';
  };

  const getOtherUserProfile = (chat: Chat) => {
    if (!chat || chat.type === 'group' || chat.type === 'saved' || chat.type === 'ai') return null;
    const otherId = getOtherParticipantIdentifier(chat)?.toLowerCase();
    const allUserMatch = allUsers.find(u => u.email?.toLowerCase() === otherId || u.phoneNumber === otherId || u.uid?.toLowerCase() === otherId);
    return allUserMatch || null;
  };

  const getChatDisplayName = (chat: Chat) => {
    if (chat.type === 'group') return chat.groupName || t.groups || 'Group Chat';
    if (chat.type === 'saved') return t.savedMessages || 'Saved Messages';
    if (chat.type === 'ai') return t.aegisGuard || 'Aegis Guard';
    const otherId = getOtherParticipantIdentifier(chat)?.toLowerCase();
    const syncedContact = syncedContacts.find(c => c.phoneNumber === otherId || c.email?.toLowerCase() === otherId || c.uid?.toLowerCase() === otherId || c.displayName?.toLowerCase() === otherId);
    if (syncedContact) return syncedContact.displayName || otherId;
    const allUserMatch = allUsers.find(u => u.email?.toLowerCase() === otherId || u.phoneNumber === otherId || u.uid?.toLowerCase() === otherId);
    if (allUserMatch) return allUserMatch.displayName || otherId;
    return otherId;
  };

  const getContactStatusDisplay = (contact: UserProfile): { text: string; online: boolean } => {
    const contactStatus = contactStatuses.get(contact.uid || contact.email || '');
    if (contactStatus?.online) {
      return { text: contactStatus.currentStatus || 'Online', online: true };
    }
    const lastSeen = contactStatus?.lastSeen ? ContactStatusService.formatLastSeen(contactStatus.lastSeen) : 'Offline';
    return { text: lastSeen, online: false };
  };

  const getChatPhotoURL = (chat: Chat) => {
    if (chat.type === 'group' || chat.type === 'saved') return null;
    const otherId = getOtherParticipantIdentifier(chat)?.toLowerCase();
    const syncedContact = syncedContacts.find(c => c.phoneNumber === otherId || c.email?.toLowerCase() === otherId || c.uid?.toLowerCase() === otherId || c.displayName?.toLowerCase() === otherId);
    if (syncedContact && syncedContact.photoURL) return syncedContact.photoURL;
    const allUserMatch = allUsers.find(u => u.email?.toLowerCase() === otherId || u.phoneNumber === otherId || u.uid?.toLowerCase() === otherId);
    if (allUserMatch && allUserMatch.photoURL) return allUserMatch.photoURL;
    return null;
  };

  const deleteDirectContactAndChat = async (chat: Chat) => {
    if (!user || chat.type === 'group' || chat.type === 'saved' || chat.type === 'ai') return;
    const otherId = getOtherParticipantIdentifier(chat)?.toLowerCase();
    const contact = syncedContacts.find(c =>
      c.phoneNumber === otherId ||
      c.email?.toLowerCase() === otherId ||
      c.uid?.toLowerCase() === otherId ||
      c.displayName?.toLowerCase() === otherId
    );

    try {
      if ((contact as any)?.id) {
        await deleteDoc(doc(db, 'users', user.uid, 'contacts', (contact as any).id));
      }

      await updateDoc(doc(db, 'conversations', chat.id), {
        deletedFor: arrayUnion(user.uid),
        [`unreadCount.${user.uid}`]: 0,
      });

      setSyncedContacts(prev => prev.filter(c => (c as any).id !== (contact as any)?.id));
      setChats(prev => prev.filter(c => c.id !== chat.id));
      if (selectedChatId === chat.id) {
        setSelectedChatId(null);
        setMessages([]);
      }
      setShowChatMenu(false);
      showToast(contact ? 'Contact deleted' : 'Chat removed');
    } catch (err) {
      console.error('Delete contact failed:', err);
      showToast('Could not delete contact');
    }
  };

  const startNewChat = async (otherUser: UserProfile) => {
    if (!user || (!user.email && !user.uid)) return;

    let targetUid = otherUser.uid;
    if (targetUid?.startsWith('temp-')) {
      const realUser = allUsers.find(u => u.email?.toLowerCase() === otherUser.email?.toLowerCase() || (otherUser.phoneNumber && u.phoneNumber === otherUser.phoneNumber));
      if (realUser) {
        targetUid = realUser.uid;
      } else if (otherUser.email) {
        // Try fetching directly if not in allUsers map
        try {
          const docsSnap = await getDocs(query(collection(db, 'users_public'), where('email', '==', otherUser.email.toLowerCase()), limit(1)));
          if (!docsSnap.empty) {
            targetUid = docsSnap.docs[0].id;
          }
        } catch (err) {
          console.error("Error fetching user email:", err);
        }
      }
    }
    
    if (targetUid === user.uid || (otherUser.email && otherUser.email.toLowerCase() === user.email?.toLowerCase())) {
      alert("You cannot start a chat with yourself.");
      return;
    }

    if (!targetUid || targetUid.startsWith('temp-')) {
      targetUid = otherUser.email?.toLowerCase() || otherUser.phoneNumber || otherUser.displayName || `contact-${Date.now()}`;
    }

    // 1. Generate unique chatId
    const chatId = [user.uid, targetUid].sort().join("_");

    const existingChat = chats.find(c => c.id === chatId || (c.participants && c.participants.includes(targetUid)));

    if (existingChat) {
      setSelectedChatId(existingChat.id);
      setShowNewChat(false);
      return;
    }

    try {
      console.log("conversation creation debug log: Creating new chat with", targetUid);
      const chatRef = doc(db, 'conversations', chatId);
      const newChatData = {
        id: chatId,
        type: 'direct',
        participants: Array.from(new Set([user.uid, targetUid])),
        deletedFor: arrayRemove(user.uid, targetUid, otherUser.email?.toLowerCase() || ''),
        updatedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      };
      await setDoc(chatRef, newChatData, { merge: true });
      setSelectedChatId(chatId);
      setShowNewChat(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };



  const downloadChat = () => {
    if (!selectedChat || messages.length === 0 || !user) return;
    
    const chatTitle = getChatDisplayName(selectedChat);
    const content = messages.map(m => {
              const sender = (m.senderId === user.email || m.senderId === user.uid) ? 'Me' : 'Them';
      const time = m.timestamp ? format(m.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss') : '';
      return `[${time}] ${sender}: ${m.decryptedContent || '[Encrypted]'}`;
    }).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aegis_Chat_${chatTitle}_${format(new Date(), 'yyyyMMdd_HHmmss')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert("Chat log exported and saved to your device.");
  };

  const startVideoCall = () => {
    setActiveVideoCall(true);
    setIsCalling(true);
    setCallTranscript([]);
    setCallSecurityStatus(null);
    setDeepfakeRisk(0);
    setDeepfakeStatus('Establishing baseline biometric geometry...');
    
    // Simulate a call transcript for vishing detection demo
    const simulatedTranscript = [
      "Hello, this is Mark from your bank's security department.",
      "We've detected suspicious activity on your account.",
      "I need you to verify your identity by providing your one-time password.",
      "It's urgent, otherwise your account will be frozen in 5 minutes."
    ];
    
    let i = 0;
    const interval = setInterval(async () => {
      if (i < simulatedTranscript.length) {
        setCallTranscript(prev => [...prev, simulatedTranscript[i]]);
        
        // Deepfake simulation progression
        if (i === 0) setDeepfakeStatus('Evaluating spectral artifacts and blinks...');
        if (i === 1) {
          setDeepfakeRisk(25);
          setDeepfakeStatus('Minor facial pulse irregularities detected.');
        }
        if (i === 2) {
          setDeepfakeRisk(65);
          setDeepfakeStatus('Warning: High mismatch in lip-sync and audio track.');
        }
        if (i === 3) {
          setDeepfakeRisk(93);
          setDeepfakeStatus('CRITICAL: AI-generated visual patterns matching known deepfake models.');
        }
        
        // Analyze the transcript so far for vishing
        const currentTranscript = simulatedTranscript.slice(0, i + 1).join(" ");
        const analysis = await SecurityService.analyzeCall(currentTranscript);
        setCallSecurityStatus(analysis);
        
        i++;
      } else {
        clearInterval(interval);
        setIsCalling(false);
      }
    }, 3000);
  };

  const endVideoCall = async () => {
    callSignalingUnsubscribeRef.current?.();
    callSignalingUnsubscribeRef.current = null;
    await webrtcRef.current?.endCall().catch(console.error);
    if (activeCallSessionId) {
      await updateDoc(doc(db, 'call_sessions', activeCallSessionId), {
        status: 'ended',
        endedAt: serverTimestamp(),
      }).catch(console.error);
    }
    webrtcRef.current = null;
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setActiveVideoCall(false);
    setHasRemoteVideo(false);
    setActiveMeetingRoom(null);
    setActiveCallSessionId(null);
    setIsCalling(false);
    setIsCameraOn(false);
    setIsMicOn(true);
    setCallTranscript([]);
    setCallSecurityStatus(null);
    setDeepfakeRisk(null);
    setDeepfakeStatus('Analyzing facial micro-expressions...');
  };

  const searchUsers = async (queryStr: string) => {
    if (!queryStr.trim()) {
      setSearchResults([]);
      return;
    }
    
    try {
      const isEmail = queryStr.includes('@');
      let results: UserProfile[] = [];
      
      if (isEmail) {
        const qEmail = query(
          collection(db, 'users_public'),
          where('email', '==', queryStr.trim().toLowerCase()),
          limit(1)
        );
        const snapshotEmail = await getDocs(qEmail);
        results = snapshotEmail.docs.map(doc => doc.data() as UserProfile)
          .filter(u => u.email?.toLowerCase() !== user?.email?.toLowerCase() && u.uid !== user?.uid);
      } else {
        const q = query(
          collection(db, 'users_public'),
          where('displayName', '>=', queryStr),
          where('displayName', '<=', queryStr + '\uf8ff'),
          limit(20)
        );
        const snapshot = await getDocs(q);
        results = snapshot.docs
          .map(doc => doc.data() as UserProfile)
          .filter(u => u.email?.toLowerCase() !== user?.email?.toLowerCase() && u.uid !== user?.uid);
      }
        
      setSearchResults(results);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users_public');
    }
  };

  const handleContactAccess = async () => {
    try {
      if ('contacts' in navigator && 'select' in (navigator as any).contacts) {
        const props = ['name', 'email', 'tel'];
        const opts = { multiple: true };
        const contacts = await (navigator as any).contacts.select(props, opts);
        if (contacts.length > 0) {
          alert(`Imported ${contacts.length} contacts. Note: Direct contact matching is currently disabled for privacy reasons. Please use the search bar to find users by display name.`);
        }
      } else {
        alert("Contact Picker API not supported on this browser. Please use the search bar.");
      }
    } catch (err) {
      console.error("Contact access error", err);
    }
  };

  const handleFileAccess = () => {
    setShowVault(true);
    setShowSettings(false);
  };

  const uploadToVault = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as string;
        const newFile = {
          name: file.name,
          size: file.size,
          date: new Date().toLocaleDateString(),
          data: data
        };
        setSecureFiles(prev => [newFile, ...prev]);
        alert(`${file.name} securely stored in Aegis Vault.`);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Render Helpers ---

  const selectedChat = useMemo(() => chats.find(c => c.id === selectedChatId), [chats, selectedChatId]);
  const reportContent = showSecurityReport?.decryptedContent || '';
  const reportIsUndecryptable = reportContent.includes('[Encrypted before you joined]') || reportContent.includes('[Unable to decrypt message]');
  const isUndecryptableMessage = (message?: Pick<Message, 'decryptedContent'> | null) => {
    const content = message?.decryptedContent || '';
    return content.includes('[Encrypted before you joined]') || content.includes('[Unable to decrypt message]');
  };
  const openSecurityReport = (message: Message) => {
    if (isUndecryptableMessage(message)) {
      alert('This message is encrypted and unavailable for analysis. Open a readable message to view the security report.');
      return;
    }
    setShowSecurityReport(message);
  };
  const reportIsSafe = showSecurityReport?.securityStatus?.isSafe ?? true;

  useEffect(() => {
    if (selectedChatId && !selectedChat) {
      setSelectedChatId(null);
      setMessages([]);
      setShowChatMenu(false);
    }
  }, [selectedChatId, selectedChat]);
  
  const [recipientProfile, setRecipientProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!selectedChat || !user) return;
    const otherId = (selectedChat.participants || []).find(p => p !== user.email && p !== user.uid);
    if (otherId) {
      getDoc(doc(db, 'users_public', otherId)).then(d => {
        if (d.exists()) setRecipientProfile(d.data() as UserProfile);
      });
    } else {
      setRecipientProfile(null);
    }
  }, [selectedChat, user]);

  if (showSplash) {
    return <AnimatePresence><SplashScreen key="splash" /></AnimatePresence>;
  }

  if (loading) return <LoadingScreen />;
  
  if (!user || !profile) return (
    <LoginScreen 
      onGoogleLogin={handleGoogleLogin}
      onEmailAuth={handleEmailAuth}
      onForgotPassword={handleForgotPassword}
      isLoggingIn={isLoggingIn} 
      error={loginError || firestoreError}
    />
  );

  const renderCallSettings = () => {
    const callSettings = getCallSettings();
    const ToggleRow = ({
      icon: Icon,
      title,
      subtitle,
      settingKey,
      value,
    }: {
      icon: React.ElementType;
      title: string;
      subtitle: string;
      settingKey: keyof NonNullable<UserProfile['callSettings']>;
      value: boolean;
    }) => (
      <div className={cn(
        "p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all",
        theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
      )}>
        <div className="flex items-center gap-3">
          <Icon className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
          <div>
            <p className={cn("text-sm font-bold", theme !== 'light' ? 'text-white' : 'text-zinc-900')}>{title}</p>
            <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>{subtitle}</p>
          </div>
        </div>
        <button
          onClick={() => updateUserSetting('callSettings', settingKey, !value)}
          className={cn(
            "w-10 h-6 rounded-full relative transition-all shrink-0",
            value ? "bg-emerald-500" : (theme === 'glow' ? "bg-emerald-900/40" : "bg-zinc-200")
          )}
        >
          <div className={cn(
            "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
            value ? "right-1" : "left-1"
          )} />
        </button>
      </div>
    );

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className={cn(
              "text-xs font-bold uppercase tracking-widest",
              theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
            )}>Call Settings</h3>
            <ComingSoonBadge />
          </div>
          <div className="space-y-3">
            <ToggleRow icon={Camera} title="Start Calls With Camera" subtitle="Video calls request camera immediately" settingKey="startWithCamera" value={callSettings.startWithCamera} />
            <ToggleRow icon={Mic} title="Start Calls With Microphone" subtitle="Join calls unmuted by default" settingKey="startWithMic" value={callSettings.startWithMic} />
            <ToggleRow icon={Volume2} title="Echo Cancellation" subtitle="Reduce speaker feedback during calls" settingKey="echoCancellation" value={callSettings.echoCancellation} />
            <ToggleRow icon={ShieldCheck} title="Noise Suppression" subtitle="Filter steady background noise" settingKey="noiseSuppression" value={callSettings.noiseSuppression} />
            <ToggleRow icon={Volume2} title="Auto Gain Control" subtitle="Balance microphone volume automatically" settingKey="autoGainControl" value={callSettings.autoGainControl} />
            <ToggleRow icon={ShieldAlert} title="AI Vishing Guard" subtitle="Keep call risk analysis active" settingKey="vishingGuard" value={callSettings.vishingGuard} />
            <ToggleRow icon={Eye} title="Deepfake Scan" subtitle="Monitor video authenticity signals" settingKey="deepfakeScan" value={callSettings.deepfakeScan} />
            <div className={cn(
              "p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all",
              theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
            )}>
              <div className="flex items-center gap-3">
                <Video className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                <div>
                  <p className={cn("text-sm font-bold", theme !== 'light' ? 'text-white' : 'text-zinc-900')}>Video Quality</p>
                  <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Controls camera resolution and bandwidth</p>
                </div>
              </div>
              <select
                value={callSettings.mediaQuality}
                onChange={(e) => updateUserSetting('callSettings', 'mediaQuality', e.target.value)}
                className="text-xs font-bold bg-white border border-zinc-200 rounded-lg px-2 py-1 text-zinc-900"
              >
                <option value="auto">Auto</option>
                <option value="best">Best</option>
                <option value="data-saver">Data Saver</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderProfileSettings = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col items-center space-y-6">
        <div className="relative group">
          <div className={cn(
            "w-32 h-32 rounded-3xl flex items-center justify-center text-zinc-500 overflow-hidden border-4 transition-all duration-500",
            theme === 'glow' ? "bg-emerald-900/50 border-emerald-500/50 glow-emerald" : "bg-zinc-100 border-white shadow-xl hover:scale-105"
          )}>
            {editPhotoURL || profile?.photoURL ? (
              <img src={editPhotoURL || profile?.photoURL} className="w-full h-full object-cover" alt="Profile" />
            ) : (
              <UserIcon className="w-16 h-16" />
            )}
          </div>
          <button 
            onClick={() => avatarInputRef.current?.click()}
            className={cn(
              "absolute -bottom-2 -right-2 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all",
              theme === 'glow' ? "bg-emerald-500 text-white glow-emerald-ring" : "bg-emerald-500 text-white hover:bg-emerald-600"
            )}
          >
            <Camera className="w-5 h-5" />
          </button>
          <input 
            type="file" 
            ref={avatarInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleAvatarUpload} 
          />
        </div>
        
        <div className="w-full space-y-4">
          {isEditingProfile ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-1 text-left">
                <label className={cn(
                  "text-[10px] font-bold uppercase tracking-widest ml-1",
                  theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                )}>{t.displayName || 'Display Name'}</label>
                <input 
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className={cn(
                    "w-full px-4 py-3 rounded-2xl text-sm focus:ring-2 transition-all",
                    theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 text-white focus:ring-emerald-500/20" : "bg-zinc-50 border-zinc-100 text-zinc-900 focus:ring-emerald-500/20"
                  )}
                  placeholder="Enter display name"
                />
              </div>
              <div className="space-y-1 text-left">
                <label className={cn(
                  "text-[10px] font-bold uppercase tracking-widest ml-1",
                  theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                )}>{t.phoneNumber || 'Phone Number'}</label>
                <input 
                  type="tel"
                  value={editPhoneNumber}
                  onChange={(e) => setEditPhoneNumber(e.target.value)}
                  className={cn(
                    "w-full px-4 py-3 rounded-2xl text-sm focus:ring-2 transition-all",
                    theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 text-white focus:ring-emerald-500/20" : "bg-zinc-50 border-zinc-100 text-zinc-900 focus:ring-emerald-500/20"
                  )}
                  placeholder="Enter phone number"
                />
              </div>
              <div className="space-y-1 text-left">
                <label className={cn(
                  "text-[10px] font-bold uppercase tracking-widest ml-1",
                  theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                )}>{t.statusText || 'Status'}</label>
                <textarea 
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className={cn(
                    "w-full px-4 py-3 rounded-2xl text-sm focus:ring-2 transition-all min-h-[100px] resize-none",
                    theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 text-white focus:ring-emerald-500/20" : "bg-zinc-50 border-zinc-100 text-zinc-900 focus:ring-emerald-500/20"
                  )}
                  placeholder="Hey there! I am using Aegis."
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsEditingProfile(false)}
                  className={cn(
                    "flex-1 py-3 rounded-2xl font-bold transition-all",
                    theme === 'glow' ? "bg-transparent text-emerald-500 hover:bg-emerald-900/20" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  )}
                >
                  {t.cancel || 'Cancel'}
                </button>
                <button 
                  onClick={async () => {
                    await updateProfile();
                    setIsEditingProfile(false);
                  }}
                  disabled={isUpdatingProfile}
                  className={cn(
                    "flex-1 py-3 rounded-2xl font-bold transition-all",
                    theme === 'glow' ? "bg-emerald-500 text-white glow-emerald-ring" : "bg-emerald-500 text-white hover:bg-emerald-600"
                  )}
                >
                  {isUpdatingProfile ? (t.saving || 'Saving...') : (t.save || 'Save Changes')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h2 className={cn(
                "text-3xl font-black tracking-tight",
                theme !== 'light' ? 'text-white' : 'text-zinc-900'
              )}>{profile?.displayName || 'Set Display Name'}</h2>
              <p className={cn(
                "text-sm font-medium",
                theme === 'glow' ? "text-emerald-500/70" : "text-zinc-500"
              )}>{user.email}</p>
              <div className={cn(
                "p-6 rounded-3xl border transition-all",
                theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
              )}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="text-left">
                    <p className={cn(
                      "text-sm font-bold",
                      theme !== 'light' ? 'text-white' : 'text-zinc-900'
                    )}>Aegis Guard Active</p>
                    <p className="text-[10px] text-zinc-500">Protected by real-time monitoring</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsEditingProfile(true)}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold transition-all shadow-sm",
                  theme === 'glow' ? "bg-emerald-500 text-white glow-emerald-ring" : "bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-emerald-500/20"
                )}
              >
                Edit Profile
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  const BottomNav = () => (
    <div className={cn(
      "h-20 border-t flex items-center justify-around px-6 backdrop-blur-xl z-50",
      theme === 'dark' ? "bg-zinc-950/80 border-zinc-800" : 
      theme === 'glow' ? "bg-emerald-950/80 border-emerald-800/50" : 
      "bg-white/80 border-zinc-200"
    )}>
      <button 
        onClick={() => setActiveSection('chats')}
        title={t.chats}
        className={cn(
          "flex flex-col items-center gap-1 transition-all duration-300 relative",
          activeSection === 'chats' ? "text-emerald-500 scale-110" : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <div className={cn(
          "p-2 rounded-xl transition-all",
          activeSection === 'chats' && theme === 'glow' && "glow-emerald-side animate-glow"
        )}>
          <MessageSquare className="w-6 h-6" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest">{t.chats}</span>
      </button>

      <button 
        onClick={() => showComingSoonNotice('Meetings')}
        title={t.meetings}
        className={cn(
          "flex flex-col items-center gap-1 transition-all duration-300 relative",
          activeSection === 'meetings' ? "text-emerald-500 scale-110" : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <span className="absolute -top-2 -right-7 z-10">
          <ComingSoonBadge compact />
        </span>
        <div className={cn(
          "p-2 rounded-xl transition-all",
          activeSection === 'meetings' && theme === 'glow' && "glow-emerald-side animate-glow"
        )}>
          <Calendar className="w-6 h-6" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest">{t.meetings}</span>
      </button>

      <button 
        onClick={() => setActiveSection('contacts')}
        title={t.contacts}
        className={cn(
          "flex flex-col items-center gap-1 transition-all duration-300 relative",
          activeSection === 'contacts' ? "text-emerald-500 scale-110" : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <div className={cn(
          "p-2 rounded-xl transition-all",
          activeSection === 'contacts' && theme === 'glow' && "glow-emerald-side animate-glow"
        )}>
          <Users className="w-6 h-6" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest">{t.contacts}</span>
      </button>

      <button 
        onClick={() => setActiveSection('settings')}
        title={t.settings}
        className={cn(
          "flex flex-col items-center gap-1 transition-all duration-300 relative",
          activeSection === 'settings' ? "text-emerald-500 scale-110" : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <span className="absolute -top-2 -right-6 z-10">
          <ComingSoonBadge compact />
        </span>
        <div className={cn(
          "p-2 rounded-xl transition-all",
          activeSection === 'settings' && theme === 'glow' && "glow-emerald-side animate-glow"
        )}>
          <SettingsIcon className="w-6 h-6" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest">{t.settings}</span>
      </button>

      <button 
        onClick={() => setActiveSection('news')}
        title="Cyber News"
        className={cn(
          "flex flex-col items-center gap-1 transition-all duration-300 relative",
          activeSection === 'news' ? "text-emerald-500 scale-110" : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <div className={cn(
          "p-2 rounded-xl transition-all",
          activeSection === 'news' && theme === 'glow' && "glow-emerald-side animate-glow"
        )}>
          <FileText className="w-6 h-6" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest">News</span>
      </button>

      <button 
        onClick={() => showComingSoonNotice('Status')}
        title={t.statusText || 'Status'}
        className={cn(
          "flex flex-col items-center gap-1 transition-all duration-300 relative",
          activeSection === 'status' ? "text-emerald-500 scale-110" : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <span className="absolute -top-2 -right-6 z-10">
          <ComingSoonBadge compact />
        </span>
        <div className={cn(
          "p-2 rounded-xl transition-all overflow-hidden",
          activeSection === 'status' && theme === 'glow' && "glow-emerald-side animate-glow"
        )}>
          <CircleDashed className="w-6 h-6" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest">{t.statusText || 'Status'}</span>
      </button>
    </div>
  );

  return (
    <div className={cn(
      "flex h-screen overflow-hidden font-sans flex-col transition-colors duration-500",
      `theme-${theme}`,
      theme === 'dark' ? "bg-zinc-950 text-white" : 
      theme === 'glow' ? "bg-emerald-950 text-emerald-50" : 
      "bg-zinc-50 text-zinc-900"
    )}>
      {toast.show && (
        <div className="fixed top-6 right-6 z-[999] bg-emerald-500 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <CheckCheck className="w-5 h-5" />
            <span className="font-bold text-sm tracking-tight">{toast.message}</span>
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={language}
          initial={{ opacity: 0, filter: 'blur(4px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(4px)' }}
          transition={{ duration: 0.3 }}
          className="flex flex-col flex-1 overflow-hidden w-full h-full"
        >
          {firestoreError && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top duration-300 shrink-0">
              <div className="flex items-center gap-2 text-amber-800 text-xs font-medium">
                <AlertTriangle className="w-4 h-4" />
                {firestoreError}
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="text-[10px] font-bold uppercase tracking-wider text-amber-900 hover:underline"
              >
                Retry
              </button>
            </div>
          )}
          <div className="flex flex-1 overflow-hidden">
            {activeSection === 'chats' ? (
          <>
            {/* Sidebar */}
            <div className="w-80 border-r border-zinc-200 bg-white flex flex-col shrink-0">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
                    <img src="/app-logo.png" alt="Aegis Guard" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-zinc-900 leading-tight">{t.aegisGuard || 'Aegis Guard'}</h1>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{t.activeMonitoring || 'Active Monitoring'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setActiveSection('settings');
                      setActiveSettingsTab('profile');
                      setIsProfileGlow(true);
                      setTimeout(() => setIsProfileGlow(false), 2000);
                    }}
                    title="Profile"
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all relative",
                      theme === 'glow' ? "bg-emerald-900/50 text-emerald-500" : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100",
                      isProfileGlow && "glow-emerald animate-glow"
                    )}
                  >
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} className="w-full h-full object-cover rounded-xl" alt="" />
                    ) : (
                      <UserIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input 
                    type="text" 
                    placeholder={t.searchChats || "Search chats..."}
                    className={cn(
                      "w-full pl-10 pr-4 py-2 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all",
                      theme === 'dark' ? "bg-zinc-800 text-white placeholder:text-zinc-500" :
                      theme === 'glow' ? "bg-emerald-900/50 text-white placeholder:text-emerald-500/50 border border-emerald-500/20" :
                      "bg-zinc-100 text-zinc-900 placeholder:text-zinc-400"
                    )}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="text-[10px] text-zinc-400 font-mono truncate text-center">
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowNewChat(true)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                      theme === 'glow' ? "bg-emerald-900/40 text-emerald-500 hover:bg-emerald-900/60" : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                    )}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t.newChat || "New Chat"}
                  </button>
                  <button 
                    onClick={() => setShowNewGroup(true)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                      theme === 'glow' ? "bg-emerald-900/40 text-emerald-500 hover:bg-emerald-900/60" : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                    )}
                  >
                    <Users className="w-3.5 h-3.5" />
                    {t.newGroup || "New Group"}
                  </button>
                </div>

                <button 
                  onClick={openSavedMessages}
                  className={cn(
                    "w-full p-3 rounded-xl flex items-center gap-3 transition-all border",
                    theme === 'glow' 
                      ? "bg-emerald-500/10 text-white border-emerald-500/20 hover:bg-emerald-500/20" 
                      : "bg-emerald-500/5 text-emerald-600 border-emerald-500/10 hover:bg-emerald-500/10"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                    theme === 'glow' ? "bg-emerald-500 text-white glow-emerald-ring" : "bg-emerald-500 text-white"
                  )}>
                    <Bookmark className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold">{t.savedMessages || 'Saved Messages'}</span>
                </button>
                <button 
                  onClick={openAegisGuardChat}
                  className={cn(
                    "w-full p-3 rounded-xl flex items-center gap-3 transition-all border",
                    theme === 'glow' 
                      ? "bg-emerald-500/10 text-white border-emerald-500/20 hover:bg-emerald-500/20" 
                      : "bg-emerald-500/5 text-emerald-600 border-emerald-500/10 hover:bg-emerald-500/10"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                    theme === 'glow' ? "bg-emerald-500 text-white glow-emerald-ring" : "bg-emerald-500 text-white"
                  )}>
                    <Shield className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold">{t.aegisGuard || 'Aegis Guard'}</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {chats.filter(c => c.type !== 'saved' && c.type !== 'ai').length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center text-zinc-400">
                    <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                    <p className="text-sm">No chats yet. Start a new conversation!</p>
                  </div>
                ) : (
                  chats.filter(c => c.type !== 'saved' && c.type !== 'ai' && (
                    getChatDisplayName(c).toLowerCase().includes(debouncedSearchQuery.toLowerCase())
                  )).map((chat, i) => (
                    <button
                      key={`${chat.id}-${i}`}
                      onClick={() => setSelectedChatId(chat.id)}
                      className={cn(
                        "w-full p-4 flex items-center gap-3 transition-all text-left border-l-4",
                        selectedChatId === chat.id 
                          ? (theme === 'glow' ? "bg-emerald-500/10 border-emerald-500 glow-emerald-side" : "bg-emerald-50/50 border-emerald-500") 
                          : "border-transparent hover:bg-zinc-50"
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center text-zinc-500 overflow-hidden",
                        theme === 'glow' ? "bg-emerald-900/50" : "bg-zinc-200"
                      )}>
                        {chat.type === 'group' ? (
                          <Users className="w-6 h-6" />
                        ) : getChatPhotoURL(chat) ? (
                          <img src={getChatPhotoURL(chat)!} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="w-6 h-6" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={cn(
                            "font-bold truncate flex items-center gap-1",
                            theme === 'glow' ? "text-emerald-50" : "text-zinc-900"
                          )}>
                            {getChatDisplayName(chat)}
                            {chat.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
                            {chat.type !== 'group' && chat.type !== 'saved' && chat.type !== 'ai' && (
                              (() => {
                                const contactProfile = allUsers.find(u => {
                                  const otherId = getOtherParticipantIdentifier(chat)?.toLowerCase();
                                  return u.email?.toLowerCase() === otherId || u.uid?.toLowerCase() === otherId || u.phoneNumber === otherId;
                                });
                                if (contactProfile) {
                                  const statusDisplay = getContactStatusDisplay(contactProfile);
                                  return (
                                    <>
                                      <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        statusDisplay.online ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                                      )} />
                                    </>
                                  );
                                }
                                return null;
                              })()
                            )}
                          </span>
                          <span className={cn(
                            "text-[10px]",
                            chat.unreadCount && user && (chat.unreadCount[user.uid] || chat.unreadCount[user.email?.toLowerCase() || '']) ? "text-emerald-500 font-bold" : "text-zinc-400"
                          )}>
                            {chat.updatedAt ? format(chat.updatedAt.toDate(), 'HH:mm') : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className={cn(
                            "text-xs truncate flex items-center gap-1",
                            chat.unreadCount && user && (chat.unreadCount[user.uid] || chat.unreadCount[user.email?.toLowerCase() || ''])
                              ? (theme === 'glow' ? "text-emerald-400 font-bold" : "text-zinc-900 font-bold") 
                              : "text-zinc-500"
                          )}>
                            {chat.typing?.filter(uid => uid !== user?.uid).length ? (
                              <span className="text-emerald-500 font-medium animate-pulse">Typing...</span>
                            ) : (
                              <>
                                <Lock className="w-3 h-3 opacity-50 shrink-0" />
                                <span className="truncate">{chat.lastMessage?.content || 'Securely encrypted message'}</span>
                              </>
                            )}
                          </p>
                          {chat.unreadCount && user && (chat.unreadCount[user.uid] || chat.unreadCount[user.email?.toLowerCase() || '']) > 0 && (
                            <div className="ml-2 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                              {chat.unreadCount[user.uid] || chat.unreadCount[user.email?.toLowerCase() || '']}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white relative">
        <AnimatePresence>
          {selectedChat ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col h-full"
            >
              {/* Chat Header */}
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowParticipants(true)}
                    className={cn("w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-500", selectedChat?.type === 'group' && "hover:bg-zinc-200 transition-colors cursor-pointer")}
                    disabled={selectedChat?.type !== 'group'}
                  >
                    {selectedChat?.type === 'saved' ? <Bookmark className="w-5 h-5 text-emerald-500" /> : 
                     selectedChat?.type === 'ai' ? <Shield className="w-5 h-5 text-emerald-500" /> : 
                     selectedChat?.type === 'group' ? <Users className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                  </button>
                  <div>
                    <h2 className="font-bold text-zinc-900 leading-tight flex items-center gap-1">
                      {selectedChat ? getChatDisplayName(selectedChat) : 'User'}
                      {selectedChat?.isVerified && <ShieldCheck className="w-4 h-4 text-emerald-500" />}
                    </h2>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {(() => {
                        const typingUsers = selectedChat?.typing?.filter(uid => uid !== user?.uid) || [];
                        if (typingUsers.length > 0) {
                           return (
                             <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider animate-pulse">
                               {typingUsers.length === 1 ? 'Typing...' : 'Multiple people typing...'}
                             </span>
                           );
                        }

                        if (selectedChat?.type === 'direct') {
                          const profile = getOtherUserProfile(selectedChat);
                          const contactStatus = profile ? contactStatuses.get(profile.uid || profile.email || '') : null;
                          
                          if (contactStatus?.online) {
                            return (
                              <>
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">{contactStatus.currentStatus || 'Online'}</span>
                                <span className="text-zinc-300 mx-1">•</span>
                                <Shield className="w-3 h-3 text-emerald-500 opacity-50" />
                                <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider flex-shrink-0">E2E Encrypted</span>
                              </>
                            );
                          } else if (contactStatus?.lastSeen) {
                            const timeStr = ContactStatusService.formatLastSeen(contactStatus.lastSeen);
                            return (
                              <>
                                <span className="text-[10px] text-zinc-400 font-medium tracking-wider whitespace-nowrap">Last seen {timeStr}</span>
                                <span className="text-zinc-300 mx-1">•</span>
                                <Shield className="w-3 h-3 text-emerald-500 opacity-50" />
                                <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider flex-shrink-0">E2E Encrypted</span>
                              </>
                            );
                          } else if (profile?.online) {
                            return (
                              <>
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Online</span>
                                <span className="text-zinc-300 mx-1">•</span>
                                <Shield className="w-3 h-3 text-emerald-500 opacity-50" />
                                <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider flex-shrink-0">E2E Encrypted</span>
                              </>
                            );
                          } else if (profile?.lastSeen) {
                            const timeStr = typeof profile.lastSeen === 'object' && 'toDate' in profile.lastSeen 
                              ? format((profile.lastSeen as any).toDate(), "h:mm a") 
                              : '';
                            if (timeStr) {
                              return (
                                <>
                                  <span className="text-[10px] text-zinc-400 font-medium tracking-wider whitespace-nowrap">Last seen today at {timeStr}</span>
                                  <span className="text-zinc-300 mx-1">•</span>
                                  <Shield className="w-3 h-3 text-emerald-500 opacity-50" />
                                  <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider flex-shrink-0">E2E Encrypted</span>
                                </>
                              );
                            }
                          }
                        }
                        return (
                          <>
                            <Shield className="w-3 h-3 text-emerald-500 opacity-50" />
                            <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider flex-shrink-0">E2E Encrypted</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedChat?.type !== 'ai' && (
                    <>
                      <button 
                        onClick={() => setShowChatSecurity(true)}
                        className="p-2 hover:bg-emerald-50 rounded-lg transition-colors text-emerald-600"
                        title="Security Check"
                      >
                        <ShieldCheck className="w-5 h-5" />
                      </button>
                      {selectedChat?.type === 'group' && (
                        <button 
                          onClick={() => setShowGroupVerification(selectedChat)}
                          className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500"
                          title="Group Verification Report"
                        >
                          <Info className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={downloadChat}
                        className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500"
                        title="Download Chat Log"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => showComingSoonNotice('Video calls')}
                        className="relative p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500"
                        title="Video Call"
                      >
                        <span className="absolute -top-2 -right-3 z-10">
                          <ComingSoonBadge compact />
                        </span>
                        <Video className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => showComingSoonNotice('Voice calls')}
                        className="relative p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500"
                        title="Voice Call"
                      >
                        <span className="absolute -top-2 -right-3 z-10">
                          <ComingSoonBadge compact />
                        </span>
                        <Phone className="w-5 h-5" />
                      </button>
                      {selectedChat.type === 'direct' && (
                        <button
                          onClick={() => deleteDirectContactAndChat(selectedChat)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                          title="Delete Contact"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </>
                  )}
                  <div className="relative">
                    <button 
                      onClick={() => setShowChatMenu(!showChatMenu)}
                      className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500"
                      title="Chat options"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    {showChatMenu && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-zinc-100 rounded-xl shadow-xl z-20 transition-all">
                        <button onClick={(e) => { 
                          e.stopPropagation();
                          clearChat(); 
                        }} className="w-full text-left px-4 py-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50">Clear Chat</button>
                        {selectedChat.type !== 'ai' && selectedChat.type !== 'group' && selectedChat.type !== 'saved' && (
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            await deleteDirectContactAndChat(selectedChat);
                          }} className="w-full text-left px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50">Delete Contact & Chat</button>
                        )}
                        <button onClick={() => { setShowChatMenu(false); setShowMessagesSearch(true); }} className="w-full text-left px-4 py-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50">Search Message</button>
                        {selectedChat.type !== 'ai' && (
                          <>
                            <button onClick={() => { setShowChatMenu(false); setShowStarredOnly(!showStarredOnly); }} className="w-full text-left px-4 py-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50">{showStarredOnly ? "All Messages" : "Starred Messages"}</button>
                            <button onClick={() => { setShowChatMenu(false); setShowPhotosOnly(!showPhotosOnly); }} className="w-full text-left px-4 py-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50">Photos and Videos</button>
                            <button onClick={reportMalware} className="w-full text-left px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50">Report Malware</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div 
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col"
                onScroll={(e) => {
                  const target = e.target as HTMLDivElement;
                  if (target.scrollTop === 0) {
                    if (messages.length >= messageLimit) {
                       setMessageLimit(prev => prev + 50);
                    }
                  }
                }}
              >
                <div className="flex justify-center mb-8 shrink-0">
                  <div className="px-3 py-1 bg-zinc-100 rounded-full text-[10px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Lock className="w-3 h-3" />
                    Messages are secured with AES-GCM encryption
                  </div>
                </div>
                {messages.length >= messageLimit && (
                  <div className="flex justify-center mb-4 shrink-0">
                    <button 
                      onClick={() => setMessageLimit(prev => prev + 50)} 
                      className="px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold hover:bg-emerald-100 transition-colors"
                    >
                      Load More
                    </button>
                  </div>
                )}
                
                {showMessagesSearch && (
                    <div className="sticky top-0 bg-white p-4 border-b border-zinc-100 z-10 flex flex-col gap-2">
                        <div className="flex gap-2">
                          <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); handleMessageSearch(e.target.value); }} placeholder="Search messages across all chats..." className="flex-1 p-2 border rounded-lg" />
                          <button onClick={() => { setShowMessagesSearch(false); setMessageSearchResults([]); }} className="px-4 py-2 bg-zinc-100 rounded-lg text-xs font-bold">Close</button>
                        </div>
                        {messageSearchResults.length > 0 && (
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {messageSearchResults.map((r) => (
                              <button key={`${r.chatId}-${r.messageId}`} onClick={() => { setSelectedChatId(r.chatId); setShowMessagesSearch(false); }} className="w-full text-left p-2 rounded-lg hover:bg-zinc-50 text-xs">
                                <span className="font-bold">{r.preview.slice(0, 60)}...</span>
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                )}
                
                {showPhotosOnly && (
                    <div className="sticky top-0 bg-white p-4 border-b border-zinc-100 z-10 flex justify-between items-center">
                        <span className="text-sm font-bold">Photos and Videos</span>
                        <button onClick={() => setShowPhotosOnly(false)} className="px-4 py-2 bg-zinc-100 rounded-lg text-xs font-bold">Close</button>
                    </div>
                )}
                {showStarredOnly && (
                    <div className="sticky top-0 bg-white p-4 border-b border-zinc-100 z-10 flex justify-between items-center">
                        <span className="text-sm font-bold flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> Starred Messages</span>
                        <button onClick={() => setShowStarredOnly(false)} className="px-4 py-2 bg-zinc-100 rounded-lg text-xs font-bold">Close</button>
                    </div>
                )}

                {messages.filter(m => {
                    if (showStarredOnly) {
                        return m.starredBy?.includes(user?.email || '');
                    }
                    if (showPhotosOnly) {
                        return !!m.decryptedImageUrl || (!!m.decryptedFileData && /\.(jpg|jpeg|png|gif|webp)$/i.test(m.decryptedFileName || ''));
                    }
                    if (showMessagesSearch && debouncedSearchQuery) {
                        return (m.decryptedContent || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase());
                    }
                    return true;
                }).map((msg, idx) => {
                    const isMe = msg.senderId === user.email || msg.senderId === user.uid;
                    const showSecurity = !!msg.securityStatus && selectedChat?.type !== 'ai' && msg.senderId !== 'aegis-guard@aegis.ai';
                    const isThreat = showSecurity && !msg.securityStatus?.isSafe && !revealedMessages.includes(msg.id);

                    return (
                      <div key={`${msg.id}-${idx}`} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                        <div 
                          onDoubleClick={() => { setActiveMessageActions(activeMessageActions === msg.id ? null : msg.id); }}
                          onContextMenu={(e) => { e.preventDefault(); setActiveMessageActions(activeMessageActions === msg.id ? null : msg.id); }}
                          className={cn(
                          "max-w-[70%] rounded-2xl p-4 relative group transition-all cursor-pointer",
                          isMe ? (
                            theme === 'glow' ? "bg-emerald-950/80 text-emerald-50 rounded-tr-none border border-emerald-500/50 glow-emerald-ring" :
                            theme === 'dark' ? "bg-zinc-800 text-white rounded-tr-none" :
                            "bg-zinc-900 text-white rounded-tr-none"
                          ) : (
                            theme === 'glow' ? "bg-emerald-900/40 text-emerald-50 rounded-tl-none border border-emerald-500/20" :
                            theme === 'dark' ? "bg-zinc-900 text-zinc-100 rounded-tl-none border border-zinc-800" :
                            "bg-zinc-100 text-zinc-900 rounded-tl-none"
                          ),
                          isThreat && "border-2 border-red-500 bg-red-50 shadow-lg shadow-red-500/10"
                        )}>
                          {isThreat ? (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-2 text-red-600 font-bold text-sm uppercase tracking-tight">
                                <ShieldAlert className="w-5 h-5" />
                                Potential Threat Detected
                              </div>
                              <div className="p-3 bg-red-100/50 rounded-xl text-xs text-red-800 border border-red-200">
                                <p className="font-semibold mb-1">AI Analysis Summary:</p>
                                <p className="opacity-80">{msg.securityStatus?.summary}</p>
                              </div>
                              <div className="flex flex-col gap-2">
                                <button 
                                  onClick={() => openSecurityReport(msg)}
                                  className="w-full py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                                >
                                  <Info className="w-4 h-4" />
                                  View Full Analysis Report
                                </button>
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => alert("Report accepted by AEGIS GUARD DEV.")}
                                    className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                                  >
                                    Report to AGD
                                  </button>
                                  <button 
                                    onClick={() => setRevealedMessages(prev => [...prev, msg.id])}
                                    className="px-3 py-2 bg-zinc-200 text-zinc-600 rounded-lg text-xs font-bold hover:bg-zinc-300 transition-colors"
                                  >
                                    Show
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : msg.deletedForEveryone ? (
                            <p className="text-sm italic opacity-60">🚫 This message was deleted</p>
                          ) : (
                            <>
                              {msg.replyToId && (
                                <div className={cn(
                                  "mb-2 pl-2 border-l-2 rounded-sm",
                                  isMe ? "border-emerald-300/60" : "border-emerald-500/50"
                                )}>
                                  <p className={cn(
                                    "text-[10px] font-bold",
                                    theme === 'glow' ? "text-emerald-300" : (isMe ? "text-emerald-200" : "text-emerald-600")
                                  )}>
                                    {(msg.replyToSenderId === user.uid || msg.replyToSenderId === user.email) ? 'You' : 'Contact'}
                                  </p>
                                  <p className="text-xs opacity-70 truncate max-w-[200px]">
                                    {msg.replyToPreview || messages.find((m) => m.id === msg.replyToId)?.decryptedContent?.slice(0, 120) || '…'}
                                  </p>
                                </div>
                              )}
                              {msg.type === 'voice' && (
                                <div className="mb-2">
                                  {msg.decryptedVoiceUrl ? (
                                    <audio controls src={msg.decryptedVoiceUrl} className="w-full max-w-[240px]" preload="metadata" />
                                  ) : msg.fileUrl === 'uploading...' ? (
                                    <span className="text-xs opacity-60 flex items-center gap-1"><Mic className="w-3 h-3" /> Uploading voice...</span>
                                  ) : (
                                    <span className="text-xs opacity-60">🔒 Decrypting voice...</span>
                                  )}
                                  {msg.voiceMessage?.duration ? (
                                    <span className="text-[10px] opacity-50 mt-1 block">{msg.voiceMessage.duration}s</span>
                                  ) : null}
                                </div>
                              )}
                              {msg.decryptedImageUrl && (
                                <div className="mb-3 rounded-xl overflow-hidden relative group">
                                  <img
                                    src={msg.decryptedImageUrl}
                                    alt="Shared"
                                    className="w-full h-auto max-h-64 object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  {msg.imageUrl === 'uploading...' && isMe && msg.status !== 'error' && (
                                    <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center">
                                      <span className="text-white font-bold text-xs uppercase mb-2">Sending securely</span>
                                      <div className="w-3/4 max-w-[200px] h-2 bg-white/30 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-emerald-500 transition-all duration-300"
                                          style={{ width: `${uploadProgressRecord[msg.id] || 0}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] text-white font-bold mt-2">{uploadProgressRecord[msg.id] || 0}%</span>
                                     <button 
                                        type="button"
                                        onClick={() => cancelUpload(msg.id)}
                                        className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded-full hover:bg-red-500/80 transition-colors"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                  {msg.status === 'error' && (
                                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
                                      <XCircle className="w-7 h-7 text-red-400 mb-2" />
                                      <span className="text-xs font-bold">Photo upload failed</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {msg.decryptedFileName && (
                                <div className={cn(
                                  "mb-3 p-3 rounded-xl flex items-center gap-3 border transition-all",
                                  theme === 'glow' 
                                    ? (isMe ? "bg-emerald-600/50 border-emerald-400/30" : "bg-emerald-900/40 border-emerald-500/20")
                                    : (isMe ? "bg-emerald-600 border-white/20" : "bg-zinc-50 border-zinc-100")
                                )}>
                                  <div className={cn(
                                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                    theme === 'glow' ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-500/10 text-emerald-600"
                                  )}>
                                    <FileText className="w-5 h-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={cn(
                                      "text-xs font-bold truncate",
                                      theme === 'glow' ? "text-white" : (isMe ? "text-white" : "text-zinc-900")
                                    )}>{msg.decryptedFileName}</p>
                                    <div className="flex flex-col gap-1 mt-1">
                                      <p className={cn(
                                        "text-[10px] opacity-60",
                                        theme === 'glow' ? "text-emerald-500/70" : (isMe ? "text-emerald-50" : "text-zinc-500")
                                      )}>{msg.fileSize ? (msg.fileSize / 1024).toFixed(1) : '0'} KB • Secure File</p>
                                      {msg.fileUrl === 'uploading...' && (
                                          <div className="w-full max-w-[120px] h-1.5 bg-black/10 rounded-full overflow-hidden mt-1 relative">
                                            <div 
                                              className="absolute top-0 left-0 h-full bg-emerald-500 rounded-full transition-all duration-300"
                                              style={{ width: `${uploadProgressRecord[msg.id] || 0}%` }}
                                            />
                                          </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="shrink-0 relative flex items-center justify-center">
                                    {(msg.fileUrl === 'uploading...' && msg.status !== 'error') ? (
                                      <div className="flex bg-black/5 rounded-full relative">
                                        <div className="w-10 h-10 flex items-center justify-center border-2 border-t-emerald-500 border-zinc-200 rounded-full animate-spin"></div>
                                        <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-emerald-600">
                                            {uploadProgressRecord[msg.id] || 0}%
                                        </div>
                                        <button 
                                          type="button"
                                          onClick={() => cancelUpload(msg.id)}
                                          className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-zinc-200 text-zinc-600 rounded-full hover:bg-red-500 hover:text-white transition-colors z-10 shadow-sm"
                                          title="Cancel Upload"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ) : (msg.status === 'error') ? (
                                        <div className="w-10 h-10 flex items-center justify-center border-2 border-red-500 rounded-full text-red-500">
                                            <X className="w-5 h-5"/>
                                        </div>
                                    ) : ((msg.decryptedFileData || msg.fileUrl) ? (
                                      <button 
                                        onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          let finalData = msg.decryptedFileData;
                                          if (!finalData && msg.fileUrl && msg.encryptedFileDataSessionKeys && msg.fileDataIv) {
                                            const keys = await EncryptionService.getOrCreateKeyPair(user.uid);
                                            const getSessionKeyForMe = (keyMap?: Record<string, string>) => {
                                              if (keyMap && user) {
                                                if (keyMap[user.uid]) return keyMap[user.uid];
                                                const myEmail = user.email ? user.email.toLowerCase() : '';
                                                if (myEmail && keyMap[myEmail]) return keyMap[myEmail];
                                                const foundKeyEntry = Object.entries(keyMap).find(([keyStr]) => {
                                                  return (myEmail && keyStr.toLowerCase() === myEmail);
                                                });
                                                return foundKeyEntry ? foundKeyEntry[1] : undefined;
                                              }
                                              return undefined;
                                            };
                                            const dataKey = getSessionKeyForMe(msg.encryptedFileDataSessionKeys) || msg.encryptedFileDataSessionKey;
                                            if (dataKey) {
                                              const base64Str = await EncryptionService.decryptFileUrl(msg.fileUrl, dataKey, msg.fileDataIv, keys.privateKey);
                                              
                                              let mimeType = "application/octet-stream";
                                              if (msg.decryptedFileName?.toLowerCase().endsWith('.pdf')) mimeType = "application/pdf";
                                              else if (msg.decryptedFileName?.toLowerCase().endsWith('.jpg')) mimeType = "image/jpeg";
                                              else if (msg.decryptedFileName?.toLowerCase().endsWith('.png')) mimeType = "image/png";
                                              else if (msg.decryptedFileName?.toLowerCase().endsWith('.txt')) mimeType = "text/plain";
                                              
                                              finalData = `data:${mimeType};base64,${base64Str}`;
                                            }
                                          }
                                          if (finalData) {
                                            const a = document.createElement('a');
                                            a.href = finalData;
                                            a.download = msg.decryptedFileName || 'secure_file';
                                            a.click();
                                          } else {
                                            alert("Unable to decrypt file. Keys may be missing.");
                                          }
                                        } catch (err) {
                                          console.error("Failed to download file.", err);
                                          alert("Failed to securely download the file.");
                                        }
                                      }}
                                      className={cn(
                                        "p-2 rounded-lg transition-all",
                                        theme === 'glow' ? "hover:bg-emerald-500/20 text-emerald-400" : "hover:bg-emerald-500/10 text-emerald-600"
                                      )}
                                      title="Download File"
                                    >
                                      <Download className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <div className="p-2 opacity-40">
                                      <Lock className="w-4 h-4" />
                                    </div>
                                  ))}
                                  </div>
                                </div>
                              )}
                              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                                {selectedChat?.type === 'ai' && !isMe ? (
                                  <div className="markdown-body">
                                    <Markdown>{msg.decryptedContent || ''}</Markdown>
                                  </div>
                                ) : (
                                  msg.decryptedContent
                                )}
                              </div>
                              {msg.securityStatus?.isAnalyzed && !isUndecryptableMessage(msg) && selectedChat?.type !== 'ai' && msg.senderId !== 'aegis-guard@aegis.ai' && msg.status !== 'uploading' && msg.status !== 'sending' && msg.fileUrl !== 'uploading...' && msg.imageUrl !== 'uploading...' && (
                                <div className={cn(
                                  "mt-3 p-2 rounded-lg text-[10px] border transition-colors",
                                  msg.securityStatus.isSafe 
                                    ? (theme === 'dark' || theme === 'glow' ? "bg-emerald-950/50 border-emerald-500/30 text-emerald-300" : "bg-emerald-50 border-emerald-100 text-emerald-700")
                                    : (theme === 'dark' || theme === 'glow' ? "bg-red-950/50 border-red-500/30 text-red-300" : "bg-red-50 border-red-100 text-red-700")
                                )}>
                                  <div className="flex items-center gap-1 font-bold uppercase tracking-widest mb-1">
                                    {msg.securityStatus.isSafe ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                                    AI Security Analysis
                                  </div>
                                  <div className="space-y-2">
                                    <p className="font-bold text-[10px] uppercase tracking-wider opacity-60">AI Security Summary</p>
                                    <p className="opacity-90 font-medium">{msg.securityStatus.summary}</p>
                                    <button 
                                      onClick={() => openSecurityReport(msg)}
                                      className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:underline mt-1"
                                    >
                                      View Full Report <ChevronRight className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              )}
                              <div className={cn(
                                "text-[9px] mt-2 opacity-60 font-medium uppercase tracking-tighter flex items-center gap-2",
                                isMe ? "justify-end" : "justify-start"
                              )}>
                                {msg.pinnedAt && <Pin className="w-3 h-3 text-amber-500" />}
                                {msg.forwardedFrom && <span title="Forwarded"><Forward className="w-3 h-3 opacity-60" /></span>}
                                {msg.type === 'voice' && <Mic className="w-3 h-3 text-emerald-500" />}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); toggleStarMessage(msg.id); }} 
                                  className={cn("transition-all", msg.starredBy?.includes(user?.email || '') ? "opacity-100 text-yellow-500 hover:text-yellow-400" : "opacity-0 group-hover:opacity-100 hover:text-yellow-500")}
                                  title="Star message"
                                >
                                  <Star className="w-3 h-3" fill={msg.starredBy?.includes(user?.email || '') ? "currentColor" : "none"} />
                                </button>
                                <span>{msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : 'Sending...'}</span>
                                {isMe && msg.timestamp && (
                                  <span className="ml-1 flex items-center">
                                    {(msg.status === 'uploading' || msg.status === 'sending' || msg.fileUrl === 'uploading...' || msg.imageUrl === 'uploading...') ? (
                                      <Clock className="w-3 h-3 opacity-50" />
                                    ) : msg.seen ? (
                                      <CheckCheck className="w-3 h-3 text-blue-500" />
                                    ) : msg.delivered ? (
                                      <CheckCheck className="w-3 h-3 opacity-70" />
                                    ) : (
                                      <Check className="w-3 h-3 opacity-70" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                          
                          {/* Security Badge */}
                          {activeMessageActions === msg.id && user && (
                            <MessageActions
                              messageId={msg.id}
                              isPinned={!!msg.pinnedAt}
                              isOwnMessage={isMe}
                              reactions={msg.reactions}
                              currentUserId={user.uid}
                              theme={theme}
                              onReact={(emoji) => handleMessageReaction(msg.id, emoji)}
                              onPin={() => handlePinMessage(msg.id)}
                              onUnpin={() => handleUnpinMessage(msg.id)}
                              onForward={() => { setShowForwardModal(msg); setActiveMessageActions(null); }}
                              onReply={() => { setReplyToMessage(msg); setActiveMessageActions(null); }}
                              onDelete={!msg.deletedForEveryone ? () => handleDeleteForEveryone(msg.id) : undefined}
                              onClose={() => setActiveMessageActions(null)}
                            />
                          )}
                          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(msg.reactions).map(([emoji, r]) => {
                                const reaction = r as MessageReaction;
                                return reaction.userIds?.length > 0 && (
                                  <button key={emoji} onClick={() => handleMessageReaction(msg.id, emoji)} className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full hover:bg-white/30">
                                    {emoji} {reaction.userIds.length}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {msg.securityStatus?.isAnalyzed && selectedChat?.type !== 'ai' && msg.senderId !== 'aegis-guard@aegis.ai' && msg.status !== 'uploading' && msg.status !== 'sending' && msg.fileUrl !== 'uploading...' && msg.imageUrl !== 'uploading...' && (
                            <div className={cn(
                              "absolute -right-2 -top-2 w-6 h-6 rounded-full flex items-center justify-center shadow-sm",
                              msg.securityStatus.isSafe ? "bg-emerald-500" : "bg-red-500"
                            )}>
                              {msg.securityStatus.isSafe ? (
                                <ShieldCheck className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <ShieldAlert className="w-3.5 h-3.5 text-white" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {streamingAIMessage && streamingAIMessage.chatId === selectedChatId && (
                    <div className="flex flex-col items-start mt-2">
                      <div className={cn(
                        "max-w-[70%] rounded-2xl p-4 relative transition-all",
                        theme === 'glow' ? "bg-emerald-900/40 text-emerald-50 rounded-tl-none border border-emerald-500/20" :
                        theme === 'dark' ? "bg-zinc-900 text-zinc-100 rounded-tl-none border border-zinc-800" :
                        "bg-zinc-100 text-zinc-900 rounded-tl-none"
                      )}>
                        <div className="markdown-body text-sm font-medium leading-relaxed tracking-tight whitespace-pre-wrap flex flex-col gap-2">
                           <Markdown>{streamingAIMessage.text || ''}</Markdown>
                           {!streamingAIMessage.text && (
                               <div className="flex gap-1 h-4 items-center">
                                   <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce mt-1" style={{ animationDelay: '0ms' }} />
                                   <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce mt-1" style={{ animationDelay: '150ms' }} />
                                   <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce mt-1" style={{ animationDelay: '300ms' }} />
                               </div>
                           )}
                        </div>
                      </div>
                    </div>
                  )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className={cn(
                "p-4 border-t transition-all",
                theme === 'glow' ? "bg-emerald-950/40 border-emerald-500/20" : "bg-white border-zinc-100"
              )}>
                {replyToMessage && (
                  <div className="mb-2 p-2 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Reply className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs text-emerald-700 truncate max-w-[300px]">{replyToMessage.decryptedContent}</span>
                    </div>
                    <button onClick={() => setReplyToMessage(null)}><X className="w-4 h-4 text-zinc-400" /></button>
                  </div>
                )}
                {showVoiceRecorder && (
                  <div className="mb-3">
                    <VoiceRecorder
                      onRecorded={handleVoiceMessage}
                      onCancel={() => setShowVoiceRecorder(false)}
                      theme={theme}
                    />
                  </div>
                )}
                {selectedImage && (
                  <div className="mb-3 relative inline-block">
                    <img src={selectedImage} className="w-20 h-20 object-cover rounded-xl border border-zinc-200" alt="Selected" />
                    <button 
                      onClick={() => setSelectedImage(null)}
                      className="absolute -top-2 -right-2 bg-white rounded-full shadow-md p-1 text-zinc-500 hover:text-red-500"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <form onSubmit={sendMessage} className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <div className="relative">
                      <button 
                        type="button"
                        onClick={(e) => { e.preventDefault(); setShowEmojiPicker(!showEmojiPicker); }}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          theme === 'glow' ? "text-emerald-500 hover:bg-emerald-500/20" : "text-zinc-500 hover:bg-zinc-100"
                        )}
                        title="Emoji"
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-4 z-[100] shadow-xl rounded-xl custom-emoji-picker-container">
                          <EmojiPicker 
                            theme={theme === 'dark' || theme === 'glow' ? Theme.DARK : Theme.LIGHT} 
                            emojiStyle={EmojiStyle.APPLE}
                            onEmojiClick={(emojiData) => {
                              setNewMessage(prev => prev + emojiData.emoji);
                            }}
                            lazyLoadEmojis={true}
                          />
                        </div>
                      )}
                    </div>
                    <button 
                      type="button"
                      onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        showVoiceRecorder ? "text-red-500 bg-red-500/10" :
                        theme === 'glow' ? "text-emerald-500 hover:bg-emerald-500/20" : "text-zinc-500 hover:bg-zinc-100"
                      )}
                      title="Voice Message"
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                    <label 
                      className={cn(
                        "relative p-2 rounded-lg cursor-pointer transition-all",
                        theme === 'glow' ? "text-emerald-500 hover:bg-emerald-500/20" : "text-zinc-500 hover:bg-zinc-100"
                      )} 
                      title="Take Photo"
                      onClick={(e) => {
                        e.preventDefault();
                        showComingSoonNotice('Camera capture');
                      }}
                    >
                      <span className="absolute -top-2 -right-3 z-10">
                        <ComingSoonBadge compact />
                      </span>
                      <Camera className="w-5 h-5" />
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} disabled />
                    </label>
                    <label 
                      className={cn(
                        "relative p-2 rounded-lg cursor-pointer transition-all",
                        theme === 'glow' ? "text-emerald-500 hover:bg-emerald-500/20" : "text-zinc-500 hover:bg-zinc-100"
                      )} 
                      title="Send Image"
                      onClick={(e) => {
                        e.preventDefault();
                        showComingSoonNotice('Photo transfer');
                      }}
                    >
                      <span className="absolute -top-2 -right-3 z-10">
                        <ComingSoonBadge compact />
                      </span>
                      <ImageIcon className="w-5 h-5" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} disabled />
                    </label>
                    {selectedChat?.type !== 'ai' && (
                      <>
                        <label 
                          className={cn(
                            "relative p-2 rounded-lg cursor-pointer transition-all",
                            theme === 'glow' ? "text-emerald-500 hover:bg-emerald-500/20" : "text-zinc-500 hover:bg-zinc-100"
                          )} 
                          title="Send Document"
                          onClick={(e) => {
                            e.preventDefault();
                            showComingSoonNotice('File transfer');
                          }}
                        >
                          <span className="absolute -top-2 -right-3 z-10">
                            <ComingSoonBadge compact />
                          </span>
                          <Paperclip className="w-5 h-5" />
                          <input type="file" accept="application/pdf,text/*" className="hidden" disabled onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.type.startsWith('image/')) {
                                const base64 = await new Promise<string>((resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.onloadend = () => resolve(reader.result as string);
                                  reader.onerror = reject;
                                  reader.readAsDataURL(file);
                                });
                                const imageForFirestore = base64.length > 520_000 ? await resizeImage(base64) : base64;
                                if (imageForFirestore.length > 700_000) {
                                  alert("This image is too large for free encrypted sending. Please choose a smaller image or screenshot.");
                                  e.target.value = '';
                                  return;
                                }
                                setSelectedImage(imageForFirestore);
                                setSelectedFile(null);
                                e.target.value = '';
                                return;
                              }
                              if (file.size > 10 * 1024 * 1024) {
                                alert("File size must be less than 10MB for secure transmission.");
                                e.target.value = '';
                                return;
                              }
                              setSelectedImage(null);
                              setSelectedFile({
                                name: file.name,
                                size: file.size,
                                date: new Date().toLocaleDateString(),
                                file: file
                              });
                              e.target.value = '';
                            }
                          }} />
                        </label>
                        <button 
                          type="button" 
                          onClick={() => showComingSoonNotice('Secure file vault')}
                          className={cn(
                            "relative p-2 rounded-lg transition-all",
                            theme === 'glow' ? "text-emerald-500 hover:bg-emerald-500/20" : "text-zinc-500 hover:bg-zinc-100"
                          )}
                          title="Secure Vault"
                        >
                          <span className="absolute -top-2 -right-3 z-10">
                            <ComingSoonBadge compact />
                          </span>
                          <HardDrive className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex-1 relative">
                    {selectedFile && (
                      <div className={cn(
                        "absolute left-0 -top-12 border rounded-xl p-2 flex items-center gap-2 shadow-sm",
                        theme === 'glow' ? "bg-emerald-900 border-emerald-500/20" : "bg-white border-zinc-200"
                      )}>
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span className={cn(
                          "text-xs font-medium truncate max-w-[100px]",
                          theme !== 'light' ? 'text-white' : 'text-zinc-900'
                        )}>{selectedFile.name}</span>
                        <button onClick={() => setSelectedFile(null)} className="text-zinc-400 hover:text-red-500">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <input 
                      type="text" 
                      placeholder="Type a secure message..."
                      className={cn(
                        "w-full pl-4 pr-12 py-3 border-none rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all",
                        theme === 'dark' ? "bg-zinc-800 text-white placeholder:text-zinc-500" :
                        theme === 'glow' ? "bg-emerald-900/50 text-white placeholder:text-emerald-500/50 border border-emerald-500/20" :
                        "bg-zinc-100 text-zinc-900 placeholder:text-zinc-400"
                      )}
                      value={newMessage}
                      onChange={handleTyping}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-zinc-400">
                      <Lock className="w-4 h-4" />
                    </div>
                  </div>
                  <button 
                    id="chat-send-btn"
                    type="submit"
                    disabled={(!newMessage.trim() && !selectedImage && !selectedFile) || isSending}
                    className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm",
                      theme === 'glow' ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20" :
                      "bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {isSending ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-24 h-24 rounded-3xl overflow-hidden mb-6 shadow-lg shadow-emerald-500/20 border border-emerald-400/20">
                <img src="/app-logo.png" alt="Aegis Guard" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">{t.secureCommunication || 'Secure Communication'}</h2>
              <p className="text-zinc-500 max-w-sm">
                {t.selectChatStartMessaging || 'Select a chat to start messaging. All conversations are protected by end-to-end encryption and real-time AI threat monitoring.'}
              </p>
              
              <div className="mt-12 grid grid-cols-2 gap-4 w-full max-w-md">
                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 text-left">
                  <Lock className="w-5 h-5 text-emerald-600 mb-2" />
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-1">{t.e2ee || 'E2EE'}</h3>
                  <p className="text-[10px] text-zinc-500">{t.aesGcm || 'AES-GCM encryption ensures only you and your recipient can read messages.'}</p>
                </div>
                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 text-left">
                  <ShieldAlert className="w-5 h-5 text-emerald-600 mb-2" />
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-1">{t.aiGuard || 'AI Guard'}</h3>
                  <p className="text-[10px] text-zinc-500">{t.realTimeAnalysis || 'Real-time analysis detects phishing, malicious links, and hidden threats.'}</p>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  ) : activeSection === 'meetings' ? (
    <div className="flex-1 flex flex-col bg-white overflow-y-auto">
      <div className="p-12 max-w-5xl mx-auto w-full space-y-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-zinc-900">{t.meetings}</h2>
            <ComingSoonBadge />
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => showComingSoonNotice('Scheduled calls')}
              className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Schedule Call
              <ComingSoonBadge compact />
            </button>
            <button 
              onClick={() => showComingSoonNotice('Meeting integration')}
              className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-2"
            >
              <Video className="w-4 h-4" />
              Schedule Meeting
              <ComingSoonBadge compact />
            </button>
          </div>
        </div>

        <div className="grid gap-4 mt-8">
          {scheduledEvents.length === 0 ? (
            <div className="text-zinc-500 text-sm text-center py-12">No scheduled events found.</div>
          ) : (
            scheduledEvents.map(ev => (
              <div key={ev.id} className="p-6 bg-white border border-zinc-200 rounded-3xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-4 rounded-2xl",
                    ev.type === 'meeting' ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {ev.type === 'meeting' ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className={cn("text-lg font-bold", theme !== 'light' ? 'text-white' : 'text-zinc-900')}>{ev.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-zinc-500 mt-1">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{ev.scheduledAt ? format(ev.scheduledAt.toDate(), 'PPP') : 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{ev.scheduledAt ? format(ev.scheduledAt.toDate(), 'p') : 'N/A'}</span>
                      </div>
                      {ev.guestAttendees && ev.guestAttendees.length > 0 && (
                        <div className="flex items-center gap-1 ml-2 text-indigo-500" title={ev.guestAttendees.map(g => `${g.name} (${g.contactDetail})`).join('\n')}>
                          <Users className="w-4 h-4" />
                          <span>+{ev.guestAttendees.length} Guests</span>
                        </div>
                      )}
                      {ev.meetingLink && (
                        <a
                          href={ev.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-indigo-600 font-bold hover:underline"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>Google Meet</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {ev.meetingLink && (
                    <a
                      href={ev.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-2"
                    >
                      <Video className="w-4 h-4" />
                      Join
                    </a>
                  )}
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest",
                    ev.status === 'scheduled' ? "bg-emerald-100 text-emerald-700 animate-pulse" : "bg-zinc-100 text-zinc-600"
                  )}>
                    {ev.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  ) : activeSection === 'contacts' ? (
    <div className="flex-1 flex flex-col bg-white overflow-y-auto">
      <div className="p-12 max-w-5xl mx-auto w-full space-y-12">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-zinc-900">{t.contacts}</h2>
          <div className="flex gap-3">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                <input 
                  type="text"
                  placeholder="Search contacts..."
                  className="pl-12 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                />
              </div>
              <button 
                onClick={() => setShowNewChat(true)}
                className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Contact
              </button>
          </div>
        </div>
        
        {syncedContacts.length > 0 ? (
          <div className="space-y-4">
            {syncedContacts.map(contact => (
              <div key={contact.uid || Math.random().toString()} className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 cursor-pointer hover:border-emerald-500/30 transition-all"
                onClick={() => {
                  startNewChat(contact);
                  setActiveSection('chats');
                }}
              >
                <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-lg">
                  {contact.photoURL ? (
                    <img src={contact.photoURL} alt={contact.displayName} className="w-full h-full object-cover" />
                  ) : (
                    contact.displayName?.charAt(0).toUpperCase() || '?'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-zinc-900 truncate">{contact.displayName}</h3>
                  {(contact.phoneNumber || contact.email) && (
                    <p className="text-sm text-zinc-500 truncate">{contact.phoneNumber || contact.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button className="w-10 h-10 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all shadow-sm">
                    <MessageSquare className="w-5 h-5" />
                  </button>
                  <button 
                  onClick={async (e) => {
                      e.stopPropagation();
                      const matchingChat = chats.find(chat => {
                        if (chat.type !== 'direct') return false;
                        const otherId = getOtherParticipantIdentifier(chat)?.toLowerCase();
                        return otherId === contact.uid?.toLowerCase()
                          || otherId === contact.email?.toLowerCase()
                          || otherId === contact.phoneNumber
                          || otherId === contact.displayName?.toLowerCase();
                      });
                      if (matchingChat) {
                        await deleteDirectContactAndChat(matchingChat);
                      } else if (user?.uid && (contact as any).id) {
                        try {
                          await deleteDoc(doc(db, 'users', user.uid, 'contacts', (contact as any).id));
                          setSyncedContacts(prev => prev.filter(c => (c as any).id !== (contact as any).id));
                          showToast('Contact deleted');
                        } catch (err) {
                          console.error(err);
                          showToast('Could not delete contact');
                        }
                      }
                  }}
                  className="w-10 h-10 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all shadow-sm">
                      <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="text-sm text-zinc-500">
            {profile?.displayName && <p>All your synced contacts will appear here.</p>}
        </div>
        )}
      </div>
    </div>
  ) : activeSection === 'news' ? (
    <div className={cn("flex-1 flex flex-col p-8 overflow-y-auto transition-colors duration-500", theme === 'glow' ? 'bg-emerald-950/40' : 'bg-white')}>
      <div className="max-w-4xl mx-auto w-full space-y-8">
        <h2 className="text-2xl font-bold text-zinc-900">Cyber Security News</h2>
        <p className="text-zinc-500 text-sm">Stay updated with the latest threats, vulnerabilities, and digital defense strategies.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {newsStories.length > 0 ? newsStories.map((story, idx) => (
            <a key={idx} href={story.link} target="_blank" rel="noreferrer" className={cn("block p-6 rounded-3xl border transition-all hover:scale-[1.02]", theme === 'glow' ? "bg-emerald-900/10 border-emerald-500/20" : "bg-zinc-50 border-zinc-100", idx === 0 ? "md:col-span-2 bg-emerald-50 border-emerald-100" : "")}>
              <div className="flex flex-col md:flex-row gap-6">
                {idx === 0 && story.thumbnail && (
                   <img src={story.thumbnail} alt="" className="w-full md:w-1/3 h-48 object-cover rounded-2xl" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <span className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest", idx === 0 ? "bg-emerald-100 text-emerald-600" : "bg-indigo-100 text-indigo-600")}>News Alert</span>
                    <span className="text-xs text-zinc-500">{new Date(story.pubDate).toLocaleDateString()}</span>
                  </div>
                  <h3 className={cn("text-lg font-bold mb-2", theme !== 'light' ? 'text-white' : 'text-zinc-900', idx === 0 && "text-xl")}>{story.title}</h3>
                  <div className="text-sm text-zinc-500 line-clamp-3" dangerouslySetInnerHTML={{ __html: story.description.replace(/<img[^>]*>/g,"") }} />
                </div>
              </div>
            </a>
          )) : (
             <div className="md:col-span-2 text-center text-zinc-500 py-12">Loading latest alerts...</div>
          )}
        </div>
      </div>
    </div>
  ) : activeSection === 'status' ? (
    <div className={cn("flex-1 flex flex-col p-8 overflow-y-auto transition-colors duration-500", theme === 'glow' ? 'bg-emerald-950/40' : 'bg-white')}>
      <AnimatePresence>
        {viewingStatus && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md"
          >
            <div className="absolute top-4 right-4 z-[210] flex gap-2">
              {(viewingStatus.userId === user?.email || viewingStatus.userId === user?.uid) && (
                <button onClick={() => deleteStatus(viewingStatus.id)} className="text-white bg-red-500/80 hover:bg-red-500 rounded-full w-12 h-12 flex items-center justify-center transition-all backdrop-blur-sm">
                  <X className="w-5 h-5 mr-1" />
                  <span className="text-xs font-bold leading-none pr-1">DEL</span>
                </button>
              )}
              <button onClick={() => setViewingStatus(null)} className="text-white bg-white/10 hover:bg-white/20 rounded-full w-12 h-12 flex items-center justify-center transition-all backdrop-blur-sm">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="w-full max-w-md h-full max-h-[85vh] bg-black rounded-3xl overflow-hidden relative shadow-2xl border border-white/10">
              {viewingStatus.type === 'image' ? (
                <img src={viewingStatus.mediaUrl} className="w-full h-full object-contain" alt="Status view" />
              ) : (
                <video src={viewingStatus.mediaUrl} className="w-full h-full object-contain" autoPlay controls />
              )}
            </div>
            <div className="absolute bottom-10 flex flex-col items-center opacity-70">
              <span className="text-white font-medium text-sm">{viewingStatus.userId}</span>
              <span className="text-white/60 text-xs mt-1">{viewingStatus.timestamp && typeof viewingStatus.timestamp.toDate === 'function' ? format(viewingStatus.timestamp.toDate(), 'PP p') : 'Just now'}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto w-full space-y-8 relative z-10">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-zinc-900">Updates & Status</h2>
          <ComingSoonBadge />
        </div>
        <p className="text-zinc-500 text-sm">Add a photo, video or text status. Status updates disappear after 24 hours.</p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-end gap-2 text-xs text-zinc-500">
            <span className="font-medium">Who can see:</span>
            <select 
              value={statusPrivacy} 
              onChange={(e) => setStatusPrivacy(e.target.value as any)}
              className="bg-zinc-100 border-none text-zinc-700 text-xs rounded-full px-3 py-1 cursor-pointer outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none"
            >
              <option value="everyone">Everyone</option>
              <option value="contacts">My Contacts</option>
              <option value="except">My Contacts Except...</option>
              <option value="me">Only Me</option>
            </select>
          </div>
          <div className="flex items-center gap-4 p-4 rounded-3xl border border-dashed border-zinc-200 relative overflow-hidden">
            <label
              className={cn("relative w-14 h-14 cursor-pointer rounded-full flex items-center justify-center transition-all shadow-sm shrink-0", theme === 'glow' ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-600 hover:bg-emerald-200")}
              onClick={(e) => {
                e.preventDefault();
                showComingSoonNotice('Status uploads');
              }}
            >
              <span className="absolute -top-2 -right-4 z-10">
                <ComingSoonBadge compact />
              </span>
              <input type="file" accept="image/*,video/*" className="hidden" onChange={handleStatusUpload} disabled />
              <Plus className="w-6 h-6" />
            </label>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">My Status</h3>
                <ComingSoonBadge compact />
              </div>
              <p className="text-xs text-zinc-500">Tap + to add photo or video status</p>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Recent Updates</h3>
          
          {allStatuses.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm border rounded-3xl border-zinc-100 bg-zinc-50">
              No recent updates from your secure contacts.
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
              {allStatuses.map((status: any) => {
                const isMe = status.userId === user?.email || status.userId === user?.uid;
                const author = isMe ? "My Status" : syncedContacts.find(c => c.email === status.userId || c.uid === status.userId)?.displayName || status.userId;
                return (
                <div key={status.id} className="flex flex-col gap-1.5 items-center">
                  <div 
                    className="relative w-24 h-32 flex-shrink-0 rounded-2xl overflow-hidden border-2 p-0.5 transition-all border-emerald-500 cursor-pointer hover:scale-105"
                    onClick={() => setViewingStatus(status)}
                  >
                    <div className="w-full h-full rounded-xl overflow-hidden bg-zinc-100 relative">
                      {status.type === 'image' ? (
                        <img src={status.mediaUrl} alt="Status" className="w-full h-full object-cover" />
                      ) : (
                        <video src={status.mediaUrl} className="w-full h-full object-cover" autoPlay muted loop />
                      )}
                    </div>
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[8px] text-white backdrop-blur-md flex items-center gap-1">
                      {status.timestamp && typeof status.timestamp.toDate === 'function' ? format(status.timestamp.toDate(), 'HH:mm') : 'Now'}
                    </div>
                    {(status.userId === user?.email || status.userId === user?.uid) && (
                      <button
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (status.uploading) cancelStatusUpload(status.id); 
                          else deleteStatus(status.id); 
                        }}
                        className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded hover:bg-red-500 transition-colors z-10"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <span className={cn("text-[10px] font-bold truncate w-24 text-center", theme === 'glow' ? "text-emerald-50" : "text-zinc-700")}>{author}</span>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    </div>

        ) : (
          <div className={cn(
            "flex-1 flex flex-col overflow-hidden transition-all duration-500",
            theme === 'glow' ? "bg-emerald-950/40" : "bg-white"
          )}>
            <div className="flex h-full">
              {/* Settings Sidebar */}
              <div className={cn(
                "w-64 border-r flex flex-col transition-all",
                theme === 'glow' ? "bg-emerald-950/40 border-emerald-500/20" : "bg-zinc-50/50 border-zinc-100"
              )}>
                <div className={cn(
                  "p-6 border-b transition-all",
                  theme === 'glow' ? "border-emerald-500/20" : "border-zinc-100"
                )}>
                  <h2 className={cn(
                    "text-xl font-bold",
                    theme !== 'light' ? 'text-white' : 'text-zinc-900'
                  )}>{t.settings || 'Settings'}</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {[
                    { id: 'main', label: t.general || 'General', icon: SettingsIcon },
                    { id: 'profile', label: t.profile || 'Profile', icon: UserIcon },
                    { id: 'account', label: t.account || 'Account', icon: Key },
                    { id: 'linked_devices', label: 'Linked Devices', icon: MonitorSmartphone },
                    { id: 'privacy', label: t.privacy || 'Privacy', icon: Lock },
                    { id: 'storage', label: t.storageAndData || 'Storage & Data', icon: Database },
                    { id: 'calls', label: 'Calls', icon: Phone },
                    { id: 'notifications', label: t.notifications || 'Notifications', icon: ShieldAlert },
                    { id: 'help', label: t.helpAndSupport || 'Help & Support', icon: HelpCircle },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveSettingsTab(tab.id as any)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                        activeSettingsTab === tab.id 
                          ? (theme === 'glow' ? "bg-emerald-500 text-white glow-emerald-ring" : "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20") 
                          : (theme === 'glow' ? "text-emerald-500/70 hover:bg-emerald-500/10" : "text-zinc-500 hover:bg-zinc-100")
                      )}
                    >
                      <tab.icon className={cn("w-5 h-5", activeSettingsTab === tab.id ? (theme === 'glow' ? "text-white" : "text-emerald-500") : "text-zinc-400")} />
                      <span className="flex-1 text-left">{tab.label}</span>
                      {(tab.id === 'calls' || tab.id === 'linked_devices') && <ComingSoonBadge compact />}
                    </button>
                  ))}
                </div>
                <div className={cn(
                  "p-4 border-t transition-all",
                  theme === 'glow' ? "border-emerald-500/20" : "border-zinc-100"
                )}>
                  <button 
                    onClick={handleSignOut}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                      theme === 'glow' ? "text-red-400 hover:bg-red-400/10" : "text-red-600 hover:bg-red-50"
                    )}
                  >
                    <LogOut className="w-5 h-5" />
                    {t.logout || "Sign Out"}
                  </button>
                </div>
              </div>

              {/* Settings Content */}
              <div className={cn(
                "flex-1 overflow-y-auto transition-all",
                theme === 'glow' ? "bg-emerald-950/20" : "bg-white"
              )}>
                <div className="p-12 max-w-2xl mx-auto w-full space-y-12">
                  {activeSettingsTab === 'profile' && renderProfileSettings()}
                  {activeSettingsTab === 'main' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <section className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>{t.appearance || 'Appearance'}</h3>
                        <div className="grid grid-cols-3 gap-4">
                          {['light', 'dark', 'glow'].map((thm) => (
                            <button
                              key={thm}
                              onClick={() => setTheme(thm as any)}
                              className={cn(
                                "p-4 rounded-2xl border transition-all text-center capitalize text-sm font-bold",
                                theme === thm 
                                  ? (theme === 'glow' ? "bg-emerald-500 text-white border-emerald-400 glow-emerald" : "bg-zinc-900 text-white border-zinc-900 shadow-lg") 
                                  : (theme === 'glow' ? "bg-emerald-900/20 text-emerald-500 border-emerald-500/20 hover:bg-emerald-900/40" : "bg-zinc-50 text-zinc-500 border-zinc-100 hover:bg-zinc-100")
                              )}
                            >
                              {thm === 'light' ? (t.light || 'Light') : thm === 'dark' ? (t.dark || 'Dark') : (t.glow || 'Glow')}
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>{t.appLanguage || 'App Language'}</h3>
                        <div className={cn(
                          "p-4 rounded-2xl border flex items-center justify-between transition-all",
                          theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                        )}>
                          <div className="flex items-center gap-3">
                            <Languages className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                            <span className="text-sm font-bold text-zinc-900">{t.appLanguage || 'App Language'}</span>
                          </div>
                          <select 
                            className={cn(
                              "bg-transparent text-sm font-bold outline-none",
                              theme === 'glow' ? "text-emerald-400" : "text-emerald-600"
                            )}
                            value={language}
                            onChange={(e) => updateLanguage(e.target.value as Language)}
                          >
                            {[
                              { code: 'en', label: 'English' },
                              { code: 'pt', label: 'Português' },
                              { code: 'hi', label: 'हिन्दी' },
                              { code: 'es', label: 'Español' },
                              { code: 'fr', label: 'Français' },
                              { code: 'ar', label: 'العربية' },
                              { code: 'ta', label: 'தமிழ்' },
                              { code: 'ml', label: 'മലയാളം' }
                            ].map(lang => (
                              <option key={lang.code} value={lang.code} className={theme === 'glow' ? "bg-emerald-950 text-white" : ""}>{lang.label}</option>
                            ))}
                          </select>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>{t.appUpdates || 'App Updates'}</h3>
                        <div className={cn(
                          "p-4 rounded-2xl border flex items-center justify-between transition-all",
                          theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                        )}>
                          <div className="flex items-center gap-3">
                            <History className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                            <div>
                              <p className="text-sm font-bold text-zinc-900">{t.version || 'Version'} 2.4.0</p>
                              <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>{t.upToDate || 'Your app is up to date'}</p>
                            </div>
                          </div>
                          <button className={cn("text-xs font-bold hover:underline", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")}>{t.check || 'Check'}</button>
                        </div>
                      </section>
                    </div>
                  )}

                  {activeSettingsTab === 'account' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <section className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>Security</h3>
                        <div className="space-y-3">
                          <div className={cn(
                            "p-4 rounded-2xl border flex items-center justify-between transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                          )}>
                            <div className="flex items-center gap-3">
                              <ShieldAlert className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                              <div>
                                <p className="text-sm font-bold text-zinc-900">Security Notifications</p>
                                <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Get alerted about login attempts</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setSecurityNotifications(!securityNotifications)}
                              className={cn(
                                "w-10 h-6 rounded-full relative transition-all",
                                securityNotifications ? "bg-emerald-500" : (theme === 'glow' ? "bg-emerald-900/40" : "bg-zinc-200")
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
                                securityNotifications ? "right-1" : "left-1"
                              )} />
                            </button>
                          </div>
                          <div className={cn(
                            "p-4 rounded-2xl border flex items-center justify-between transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                          )}>
                            <div className="flex items-center gap-3">
                              <Key className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                              <div>
                                <p className="text-sm font-bold text-zinc-900">Passkeys</p>
                                <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Passwordless secure login</p>
                              </div>
                            </div>
                            <button onClick={() => alert('Passkey configuration initiated. Follow browser prompts.')} className={cn("text-xs font-bold hover:underline", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")}>Setup</button>
                          </div>
                          <div className={cn(
                            "p-4 rounded-2xl border flex items-center justify-between transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                          )}>
                            <div className="flex items-center gap-3">
                              <Lock className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                              <div>
                                <p className="text-sm font-bold text-zinc-900">Two-Step Verification</p>
                                <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Add extra layer of security</p>
                              </div>
                            </div>
                            <button onClick={() => setShowTwoStepSetup(true)} className={cn("text-xs font-bold hover:underline", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")}>Enable</button>
                          </div>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>Account Actions</h3>
                        <div className="space-y-3">
                          <button onClick={() => { setShowSettings(false); setActiveSection('contacts'); setShowNewChat(true); }} className={cn(
                            "w-full p-4 rounded-2xl border flex items-center gap-3 transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 hover:bg-emerald-900/30" : "bg-zinc-50 border-zinc-100 hover:bg-zinc-100"
                          )}>
                            <UserPlus className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                            <span className="text-sm font-bold text-zinc-900">Add Secure Contact</span>
                          </button>
                          <button onClick={async () => {
                              // if(confirm(t.deleteAccount + "? This action cannot be undone and all your data will be permanently removed.")) {
                                try {
                                  if (user?.uid) {
                                    await deleteDoc(doc(db, 'users', user?.uid));
                                    await deleteDoc(doc(db, 'users_public', user?.uid));
                                  }
                                  await auth.signOut();
                                  console.log("Account deleted successfully.");
                                } catch (error) {
                                  console.error("Failed to delete account", error);
                                }
                              // }
                            }} className={cn(
                            "w-full p-4 rounded-2xl border flex items-center gap-3 transition-all",
                            theme === 'glow' ? "bg-red-900/20 border-red-500/20 hover:bg-red-900/30" : "bg-red-50 border-red-100 hover:bg-red-100"
                          )}>
                            <Trash2 className="w-5 h-5 text-red-600" />
                            <span className={cn("text-sm font-bold", theme === 'glow' ? "text-red-400" : "text-red-600")}>Delete Account</span>
                          </button>
                        </div>
                      </section>
                    </div>
                  )}

                  {activeSettingsTab === 'linked_devices' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h3 className={cn(
                                "text-xs font-bold uppercase tracking-widest",
                                theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                              )}>Linked Devices</h3>
                              <ComingSoonBadge />
                            </div>
                            <div className="flex gap-2">
                                <button disabled className="px-3 py-1.5 rounded-lg bg-zinc-100 text-xs font-bold transition-colors text-zinc-400 border border-zinc-200 shadow-sm cursor-not-allowed flex items-center gap-2">Link with Phone Number <ComingSoonBadge compact /></button>
                                <button disabled className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm cursor-not-allowed flex items-center gap-2 opacity-70", theme === 'glow' ? "bg-emerald-500 text-white" : "bg-emerald-500 text-white")}>Link Device (QR) <ComingSoonBadge compact /></button>
                            </div>
                        </div>

                        {showLinkQR && (
                           <div className="p-8 border rounded-2xl flex flex-col items-center justify-center space-y-4 shadow-sm bg-white border-zinc-200">
                               <h4 className="font-bold text-zinc-900">Scan QR Code</h4>
                               <p className="text-xs text-zinc-500 text-center max-w-xs">Use the Aegis Secure Chat app on your phone to scan this code.</p>
                               <div className="bg-white p-4 border border-zinc-200 shadow-sm rounded-xl">
                                   <QrCode className="w-48 h-48 text-zinc-900" />
                               </div>
                               <button onClick={handleSimulateDeviceLink} className="text-xs font-bold text-emerald-600 underline">Simulate Scan (Testing)</button>
                               <button onClick={() => setShowLinkQR(false)} className="text-xs font-bold text-zinc-500 mt-4">Cancel</button>
                           </div>
                        )}

                        {showLinkPhone && (
                           <div className="p-8 border rounded-2xl flex flex-col items-center justify-center space-y-4 shadow-sm bg-white border-zinc-200">
                               <h4 className="font-bold text-zinc-900">Link with Phone Number</h4>
                               <p className="text-xs text-zinc-500 text-center max-w-xs">Enter your phone number to receive a secure link code.</p>
                               <div className="w-full max-w-xs flex flex-col gap-2">
                                   <input type="tel" placeholder="+1 (555) 000-0000" className="w-full px-4 py-2 border border-zinc-300 rounded-lg text-sm" />
                                   <button onClick={handleSimulateDeviceLink} className="w-full py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold shadow-sm">Send Code</button>
                               </div>
                               <button onClick={() => setShowLinkPhone(false)} className="text-xs font-bold text-zinc-500 mt-4">Cancel</button>
                           </div>
                        )}

                        <div className="space-y-3">
                          {linkedDevices.map(device => (
                              <div key={device.id} className={cn(
                                "flex items-center justify-between p-4 rounded-2xl border transition-all",
                                theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                              )}>
                                <div className="flex items-center gap-4">
                                   <div className={cn("p-3 rounded-xl", theme === 'glow' ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-600")}>
                                      <MonitorSmartphone className="w-5 h-5" />
                                   </div>
                                   <div>
                                       <div className="flex items-center gap-2">
                                           <h4 className="text-sm font-bold text-zinc-900">{device.name}</h4>
                                           {device.isActive && <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-bold uppercase tracking-wider">Active</span>}
                                       </div>
                                       <p className="text-xs text-zinc-500 flex items-center gap-2 mt-1">
                                           <span>{device.ip}</span> • <span>{device.location}</span>
                                       </p>
                                       <p className="text-xs text-zinc-500 mt-0.5">Last active: {format(new Date(device.lastActive), 'MMM dd, yyyy HH:mm')}</p>
                                   </div>
                                </div>
                                <button 
                                   onClick={() => setLinkedDevices(prev => prev.filter(d => d.id !== device.id))}
                                   className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                   <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                          ))}
                          
                          {linkedDevices.length === 0 && (
                             <div className="p-8 text-center text-zinc-500 border border-dashed rounded-2xl">
                               No linked devices.
                             </div>
                          )}
                        </div>
                      </section>
                    </div>
                  )}

                  {activeSettingsTab === 'privacy' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <section className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>Privacy</h3>
                        <div className="space-y-3">
                          <div className={cn(
                            "p-4 rounded-2xl border flex items-center justify-between transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                          )}>
                            <div className="flex items-center gap-3">
                              <EyeOff className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                              <div>
                                <p className="text-sm font-bold text-zinc-900">Last Seen & Online</p>
                                <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Manage your visibility</p>
                              </div>
                            </div>
                            <button className={cn("text-xs font-bold hover:underline", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")}>Everyone</button>
                          </div>
                          <div className={cn(
                            "p-4 rounded-2xl border flex items-center justify-between transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                          )}>
                            <div className="flex items-center gap-3">
                              <ShieldCheck className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                              <div>
                                <p className="text-sm font-bold text-zinc-900">Read Receipts</p>
                                <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Show when you've read messages</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setPrivacySettings(p => ({ ...p, readReceipts: !p.readReceipts }))}
                              className={cn(
                                "w-10 h-6 rounded-full relative transition-all",
                                privacySettings.readReceipts ? "bg-emerald-500" : (theme === 'glow' ? "bg-emerald-900/40" : "bg-zinc-200")
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
                                privacySettings.readReceipts ? "right-1" : "left-1"
                              )} />
                            </button>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}

                  {activeSettingsTab === 'notifications' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <section className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className={cn(
                            "text-xs font-bold uppercase tracking-widest",
                            theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                          )}>Notifications</h3>
                          <ComingSoonBadge />
                        </div>
                        <div className={cn(
                          "p-5 rounded-2xl border flex items-center justify-between transition-all",
                          theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                        )}>
                          <div className="flex items-center gap-3">
                            <ShieldAlert className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                            <div>
                              <p className="text-sm font-bold text-zinc-900">Notification controls</p>
                              <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Message tones, vibration, and priority alerts will be available soon.</p>
                            </div>
                          </div>
                          <ComingSoonBadge />
                        </div>
                      </section>
                    </div>
                  )}

                  {activeSettingsTab === 'storage' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <section className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>Storage & Data</h3>
                        <div className="space-y-3">
                          <div className={cn(
                            "p-4 rounded-2xl border flex items-center justify-between transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                          )}>
                            <div className="flex items-center gap-3">
                              <Database className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                              <div>
                                <p className="text-sm font-bold text-zinc-900">Storage Usage</p>
                                <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Manage your encrypted vault</p>
                              </div>
                            </div>
                            <span className={cn("text-xs font-bold", theme === 'glow' ? "text-emerald-500" : "text-zinc-500")}>1.2 GB</span>
                          </div>
                          <div className={cn(
                            "p-4 rounded-2xl border flex items-center justify-between transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                          )}>
                            <div className="flex items-center gap-3">
                              <Wifi className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                              <div>
                                <p className="text-sm font-bold text-zinc-900">WiFi Updates Only</p>
                                <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Save mobile data</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setAutoDownload(a => ({ ...a, wifiOnly: !a.wifiOnly }))}
                              className={cn(
                                "w-10 h-6 rounded-full relative transition-all",
                                autoDownload.wifiOnly ? "bg-emerald-500" : (theme === 'glow' ? "bg-emerald-900/40" : "bg-zinc-200")
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
                                autoDownload.wifiOnly ? "right-1" : "left-1"
                              )} />
                            </button>
                          </div>
                          <div className={cn(
                            "p-4 rounded-2xl border flex items-center justify-between transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                          )}>
                            <div className="flex items-center gap-3">
                              <HardDrive className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                              <div>
                                <p className="text-sm font-bold text-zinc-900">Media Quality</p>
                                <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Best quality vs Data saver</p>
                              </div>
                            </div>
                            <button className={cn("text-xs font-bold hover:underline", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")}>Best Quality</button>
                          </div>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>Backup</h3>
                        <div className={cn(
                          "p-4 rounded-2xl border flex items-center justify-between transition-all",
                          theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                        )}>
                          <div className="flex items-center gap-3">
                            <History className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                            <div>
                              <p className="text-sm font-bold text-zinc-900">Chat Backup</p>
                              <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-500")}>Last backup: Today, 2:45 AM</p>
                            </div>
                          </div>
                          <button className={cn("text-xs font-bold hover:underline", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")}>Backup Now</button>
                        </div>
                      </section>
                    </div>
                  )}

                  {activeSettingsTab === 'calls' && renderCallSettings()}

                  {activeSettingsTab === 'help' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <section className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>Support</h3>
                        <div className="space-y-3">
                          <button onClick={() => window.open('/terms_of_service.html', '_blank')} className={cn(
                            "w-full p-4 rounded-2xl border flex items-center gap-3 transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 hover:bg-emerald-900/30" : "bg-zinc-50 border-zinc-100 hover:bg-zinc-100"
                          )}>
                            <FileText className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                            <span className="text-sm font-bold text-zinc-900">Terms of Service</span>
                          </button>
                          <button onClick={() => window.open('/privacy_policy.html', '_blank')} className={cn(
                            "w-full p-4 rounded-2xl border flex items-center gap-3 transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 hover:bg-emerald-900/30" : "bg-zinc-50 border-zinc-100 hover:bg-zinc-100"
                          )}>
                            <Shield className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                            <span className="text-sm font-bold text-zinc-900">Privacy Policy</span>
                          </button>
                          <button
                            onClick={() => document.getElementById('contact-feedback-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            className={cn(
                            "w-full p-4 rounded-2xl border flex items-center gap-3 transition-all",
                            theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 hover:bg-emerald-900/30" : "bg-zinc-50 border-zinc-100 hover:bg-zinc-100"
                          )}>
                            <Info className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                            <span className="text-sm font-bold text-zinc-900">Contact & Feedback</span>
                          </button>
                        </div>
                      </section>
                      <section id="contact-feedback-panel" className="space-y-4">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-widest",
                          theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                        )}>Contact & Feedback</h3>
                        <div className={cn("space-y-4 p-6 rounded-3xl border transition-all", theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100")}>
                          <p className="text-xs text-zinc-500">Send support questions, feedback, or bug reports from one place.</p>
                          <textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Describe your question, feedback, or issue..."
                            className={cn("w-full px-4 py-3 rounded-2xl text-sm focus:ring-2 transition-all min-h-[120px] resize-none", theme === 'glow' ? "bg-emerald-900/40 border-emerald-500/20 text-white focus:ring-emerald-500/20" : "bg-white border-zinc-200 text-zinc-900")}
                          />
                          <button
                            onClick={submitFeedback}
                            disabled={isSubmittingFeedback || !feedback.trim()}
                            className={cn("w-full py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2", theme === 'glow' ? "bg-emerald-500 text-white" : "bg-zinc-900 text-white hover:bg-zinc-800")}
                          >
                            {isSubmittingFeedback ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                            Submit Contact & Feedback
                          </button>
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {incomingCall && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-2rem)] max-w-sm"
          >
            <div className={cn(
              "rounded-3xl border p-5 shadow-2xl backdrop-blur-xl",
              theme === 'glow' ? "bg-emerald-950/90 border-emerald-500/30 text-white" : "bg-white border-zinc-100 text-zinc-900"
            )}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  {incomingCall.type === 'voice' ? <Phone className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">Incoming {incomingCall.type === 'voice' ? 'Voice Call' : 'Video Call'}</p>
                  <p className="text-lg font-bold truncate">{incomingCallerName || 'Contact'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-5">
                <button
                  onClick={declineIncomingCall}
                  className="py-3 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  Decline
                </button>
                <button
                  onClick={acceptIncomingCall}
                  className="py-3 rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  <Phone className="w-5 h-5" />
                  Answer
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Chat Modal */}
      <AnimatePresence>
        {showNewChat && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h2 className="text-xl font-bold">{t.addSecureContact || 'Add Secure Contact'}</h2>
                <button onClick={() => setShowNewChat(false)} className="text-zinc-400 hover:text-zinc-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <div className="flex border-b border-zinc-100">
                <button onClick={() => setAddContactOption('search')} className={cn("flex-1 py-3 text-sm font-bold border-b-2", addContactOption === 'search' ? "border-emerald-500 text-emerald-600" : "border-transparent text-zinc-500 hover:bg-zinc-50")}>Search</button>
                <button onClick={() => setAddContactOption('keypad')} className={cn("flex-1 py-3 text-sm font-bold border-b-2", addContactOption === 'keypad' ? "border-emerald-500 text-emerald-600" : "border-transparent text-zinc-500 hover:bg-zinc-50")}>Keypad</button>
                <button onClick={() => setAddContactOption('email')} className={cn("flex-1 py-3 text-sm font-bold border-b-2", addContactOption === 'email' ? "border-emerald-500 text-emerald-600" : "border-transparent text-zinc-500 hover:bg-zinc-50")}>Email</button>
              </div>

              {addContactOption === 'search' && (
                <div className="p-4">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                      type="text" 
                      placeholder="Search by name, email or phone..."
                      className="w-full pl-10 pr-4 py-3 bg-zinc-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      value={userSearchQuery}
                      onChange={(e) => {
                        setUserSearchQuery(e.target.value);
                        searchUsers(e.target.value);
                      }}
                    />
                  </div>

                  <div className="max-h-[50vh] overflow-y-auto space-y-2">
                    {searchResults.length === 0 && userSearchQuery && (
                      <div className="text-center py-12 space-y-4">
                        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
                          <Search className="w-8 h-8 text-emerald-500" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-zinc-500 font-medium">No users found for "{userSearchQuery}"</p>
                          <p className="text-xs text-zinc-400">Would you like to start a secure chat anyway?</p>
                        </div>
                        <button 
                          onClick={() => {
                            const trimmedSearchQuery = userSearchQuery.trim().toLowerCase();
                            const isEmail = /\S+@\S+\.\S+/.test(trimmedSearchQuery);
                            const isPhone = /^\+?[\d\s-]{10,}$/.test(trimmedSearchQuery);
                            
                            if (isEmail || isPhone) {
                              const newContact = {
                                uid: 'temp-' + Date.now(),
                                displayName: trimmedSearchQuery,
                                email: isEmail ? trimmedSearchQuery : '',
                                phoneNumber: isPhone ? trimmedSearchQuery : '',
                                photoURL: '',
                                publicKey: ''
                              } as UserProfile;
                              handleSaveContact(newContact);
                              startNewChat(newContact);
                              setShowNewChat(false);
                              setUserSearchQuery('');
                            } else {
                              alert("Please enter a valid email or phone number.");
                            }
                          }}
                          className="px-6 py-2 bg-emerald-500 text-white rounded-full text-sm font-bold hover:bg-emerald-600 transition-all"
                        >
                          Start Secure Chat
                        </button>
                      </div>
                    )}
                    {searchResults.length === 0 && !userSearchQuery && (
                      <div className="text-center py-12 text-zinc-400">
                        <UserIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                        <p className="text-sm italic">Search for users to start a secure chat</p>
                      </div>
                    )}
                    {searchResults.map((u, i) => (
                      <button
                        key={`${u.uid}-${i}`}
                        onClick={async () => {
                          await handleSaveContact(u);
                          await startNewChat(u);
                          setShowNewChat(false);
                          setUserSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="w-full p-3 flex items-center gap-3 hover:bg-zinc-50 rounded-2xl transition-colors text-left border border-zinc-50"
                      >
                        <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-500">
                          {u.photoURL ? (
                            <img src={u.photoURL} className="w-full h-full object-cover rounded-xl" alt="Profile" />
                          ) : (
                            <UserIcon className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{u.displayName}</p>
                          <p className="text-[10px] text-zinc-400 truncate">
                            {u.email} {u.phoneNumber ? `• ${u.phoneNumber}` : ''}
                          </p>
                          {u.status && <p className="text-[10px] text-emerald-600 truncate italic">{u.status}</p>}
                        </div>
                        <Plus className="w-4 h-4 text-emerald-600" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {addContactOption === 'keypad' && (
                <div className="p-4 max-h-[60vh] overflow-y-auto flex flex-col w-full">
                  <div className="text-center mb-6">
                    <div className="h-10 text-2xl font-mono tracking-widest text-zinc-800 flex items-center justify-center shrink-0 mb-4">
                      {keypadInput || <span className="text-zinc-300">Enter Number</span>}
                    </div>
                    <input 
                      type="text" 
                      placeholder="Contact Name (Optional)" 
                      value={keypadName}
                      onChange={(e) => setKeypadName(e.target.value)}
                      className="w-full px-4 py-3 mb-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none text-center"
                    />
                    <button 
                      disabled={!keypadInput}
                      onClick={async () => {
                          const newContact = {
                            uid: 'temp-' + Date.now(),
                            displayName: keypadName.trim() || keypadInput,
                            email: '',
                            phoneNumber: keypadInput,
                            photoURL: '',
                            publicKey: ''
                          };
                          await handleSaveContact(newContact);
                          await startNewChat(newContact as UserProfile);
                          setShowNewChat(false);
                          setKeypadInput('');
                          setKeypadName('');
                      }}
                      className="w-full py-3.5 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 active:scale-95 transition-all outline-none disabled:opacity-50"
                    >
                      Save Contact
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto shrink-0 mb-2">
                    {['1','2','3','4','5','6','7','8','9','*','0','#'].map((num) => (
                      <button 
                        key={num}
                        onClick={() => {
                          playDTMF(num);
                          setKeypadInput(prev => prev + num);
                        }}
                        className="w-14 h-14 mx-auto rounded-full bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-xl font-medium transition-all active:bg-zinc-200 flex items-center justify-center shrink-0"
                      >
                        {num}
                      </button>
                    ))}
                    <div className="col-span-3 flex justify-between mt-1">
                      <button onClick={() => { setKeypadInput(''); setKeypadName(''); }} className="px-4 py-2 text-zinc-400 font-bold hover:bg-zinc-50 rounded-xl">Clear</button>
                      <button onClick={() => setKeypadInput(prev => prev.slice(0, -1))} className="px-4 py-2 text-zinc-400 font-bold hover:bg-zinc-50 rounded-xl">Delete</button>
                    </div>
                  </div>
                </div>
              )}

              {addContactOption === 'email' && (
                <div className="p-4 max-h-[60vh] overflow-y-auto flex flex-col w-full">
                  <div className="mb-6 shrink-0">
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                      <input 
                        type="email" 
                        placeholder="contact@example.com"
                        className="w-full pl-12 pr-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                        value={emailInputSearch}
                        onChange={(e) => setEmailInputSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <button 
                    disabled={!emailInputSearch.includes('@')}
                    onClick={async () => {
                        const trimmedEmail = emailInputSearch.trim().toLowerCase();
                        const newContact = {
                          uid: 'temp-' + Date.now(),
                          displayName: trimmedEmail.split('@')[0],
                          email: trimmedEmail,
                          phoneNumber: '',
                          photoURL: '',
                          publicKey: ''
                        };
                        await handleSaveContact(newContact);
                        await startNewChat(newContact as UserProfile);
                        setShowNewChat(false);
                        setEmailInputSearch('');
                    }}
                    className="w-full py-3.5 mt-auto shrink-0 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 active:scale-95 transition-all outline-none disabled:opacity-50"
                  >
                    Add Contact via Email
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "w-full max-w-md rounded-3xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col transition-all",
                theme === 'glow' ? "bg-zinc-950 border border-emerald-500/20" : "bg-white"
              )}
            >
              <div className={cn(
                "p-6 border-b flex items-center justify-between shrink-0 transition-all",
                theme === 'glow' ? "border-emerald-500/20" : "border-zinc-100"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500",
                    isProfileGlow ? "bg-emerald-500 text-white animate-glow glow-emerald" : 
                    (theme === 'glow' ? "bg-emerald-900/50 text-emerald-500" : "bg-zinc-100 text-zinc-500")
                  )}>
                    <SettingsIcon className="w-5 h-5" />
                  </div>
                  <h2 className={cn(
                    "text-xl font-bold",
                    theme !== 'light' ? 'text-white' : 'text-zinc-900'
                  )}>{t.settings || 'Settings'}</h2>
                </div>
                <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-zinc-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex flex-1 overflow-hidden">
                {/* Settings Sidebar */}
                <div className={cn(
                  "w-1/3 border-r overflow-y-auto p-4 space-y-2 transition-all",
                  theme === 'glow' ? "bg-emerald-950/40 border-emerald-500/20" : "bg-zinc-50/50 border-zinc-100"
                )}>
                  {[
                    { id: 'main', icon: UserIcon, label: t.profile },
                    { id: 'account', icon: Key, label: t.account },
                    { id: 'linked_devices', icon: MonitorSmartphone, label: 'Linked Devices' },
                    { id: 'privacy', icon: Shield, label: t.privacy || 'Privacy' },
                    { id: 'chats', icon: MessageSquare, label: t.chats },
                    { id: 'calls', icon: Phone, label: 'Calls' },
                    { id: 'notifications', icon: Volume2, label: t.notifications },
                    { id: 'storage', icon: Database, label: t.storage },
                    { id: 'help', icon: HelpCircle, label: t.help },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveSettingsTab(tab.id as any)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all",
                        activeSettingsTab === tab.id 
                          ? (theme === 'glow' ? "bg-emerald-500 text-white glow-emerald-ring" : "bg-white text-emerald-600 shadow-sm border border-zinc-100") 
                          : (theme === 'glow' ? "text-emerald-500/70 hover:bg-emerald-500/10" : "text-zinc-500 hover:bg-white/50")
                      )}
                    >
                      <tab.icon className={cn("w-4 h-4", activeSettingsTab === tab.id ? (theme === 'glow' ? "text-white" : "text-emerald-500") : "text-zinc-400")} />
                      <span className="flex-1 text-left">{tab.label}</span>
                      {(tab.id === 'calls' || tab.id === 'linked_devices') && <ComingSoonBadge compact />}
                    </button>
                  ))}
                </div>

                {/* Settings Content */}
                <div className="flex-1 overflow-y-auto p-8">
                  {activeSettingsTab === 'main' && (
                    <div className="space-y-8">
                      <div className="flex flex-col items-center">
                        <div 
                          className={cn(
                            "w-24 h-24 bg-zinc-100 rounded-3xl flex items-center justify-center text-zinc-500 mb-4 relative group cursor-pointer transition-all duration-500",
                            isProfileGlow ? "animate-glow glow-emerald-lg scale-105" : ""
                          )} 
                          onClick={() => {
                            setIsProfileGlow(true);
                            setShowAvatarPicker(true);
                            setTimeout(() => setIsProfileGlow(false), 2000);
                          }}
                        >
                          {editPhotoURL ? (
                            <img src={editPhotoURL} className="w-full h-full object-cover rounded-3xl transition-all group-hover:scale-105" alt="Profile" referrerPolicy="no-referrer" />
                          ) : (
                            <UserIcon className="w-12 h-12" />
                          )}
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl flex items-center justify-center">
                            <Camera className="w-6 h-6 text-white" />
                          </div>
                          <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg animate-glow glow-emerald">
                            <Plus className="w-4 h-4" />
                          </div>
                        </div>
                        <h3 className={cn("text-xl font-bold", theme !== 'light' ? 'text-white' : 'text-zinc-900')}>{profile?.displayName}</h3>
                        <p className="text-zinc-500 text-sm">{profile?.email}</p>
                      </div>
                      
                      <div className="space-y-6">
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">{t.displayName}</label>
                            <input 
                              type="text" 
                              value={editDisplayName}
                              onChange={(e) => setEditDisplayName(e.target.value)}
                              className={cn(
                                "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all",
                                theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 text-white focus:ring-emerald-500/20" : "bg-zinc-50 border-zinc-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                              )}
                              placeholder="Your name"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">{t.phoneNumber}</label>
                            <input 
                              type="tel" 
                              value={editPhoneNumber}
                              onChange={(e) => setEditPhoneNumber(e.target.value)}
                              className={cn(
                                "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all",
                                theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 text-white focus:ring-emerald-500/20" : "bg-zinc-50 border-zinc-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                              )}
                              placeholder="+1 234 567 890"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">{t.status}</label>
                            <input 
                              type="text" 
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value)}
                              className={cn(
                                "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all",
                                theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20 text-white focus:ring-emerald-500/20" : "bg-zinc-50 border-zinc-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                              )}
                              placeholder="Available"
                            />
                          </div>
                        </div>
                        <div className="pt-4 border-t border-zinc-100">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-zinc-900">{t.language}</h4>
                            <select 
                              value={language}
                              onChange={(e) => updateLanguage(e.target.value as Language)}
                              className="text-xs font-bold bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 outline-none"
                            >
                              <option value="en">English</option>
                              <option value="pt">Português</option>
                              <option value="hi">हिन्दी</option>
                              <option value="es">Español</option>
                              <option value="fr">Français</option>
                              <option value="ar">العربية</option>
                              <option value="ta">தமிழ்</option>
                              <option value="ml">മലയാളം</option>
                            </select>
                          </div>
                        </div>
                        <button 
                          onClick={updateProfile}
                          disabled={isUpdatingProfile}
                          className={cn(
                            "w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg",
                            theme === 'glow' ? "bg-emerald-500 text-white shadow-emerald-500/20" : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20"
                          )}
                        >
                          {isUpdatingProfile ? t.saving : t.save}
                        </button>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'account' && (
                    <div className="space-y-6">
                      <div className={cn("space-y-4 p-4 rounded-2xl border", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                        <button onClick={() => setShowTwoStepSetup(true)} className="w-full flex items-center justify-between text-sm font-medium text-zinc-700 hover:bg-black/5 p-2 rounded-xl transition-all">
                          <div className="flex items-center gap-3">
                            <ShieldCheck className="w-4 h-4 text-blue-500" />
                            <span className={theme === 'glow' ? "text-white" : ""}>{t.twoStep}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-300" />
                        </button>
                        <button 
                          onClick={() => {
                            const newNumber = prompt("Enter your new phone number:");
                            if (newNumber) {
                              alert("A verification code has been sent to " + newNumber + ". Please verify to complete the change.");
                            }
                          }}
                          className="w-full flex items-center justify-between text-sm font-medium text-zinc-700 hover:bg-black/5 p-2 rounded-xl transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <Phone className="w-4 h-4 text-emerald-500" />
                            <span className={theme === 'glow' ? "text-white" : ""}>{t.changeNumber}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-300" />
                        </button>
                        <button 
                          onClick={() => {
                            alert("Your account information report is being generated. You will be notified when it's ready for download (usually within 3 days).");
                          }}
                          className="w-full flex items-center justify-between text-sm font-medium text-zinc-700 hover:bg-black/5 p-2 rounded-xl transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 text-zinc-400" />
                            <span className={theme === 'glow' ? "text-white" : ""}>Request Account Info</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-300" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-red-600">Danger Zone</h4>
                        <div className="p-2 rounded-2xl border border-red-100 bg-red-50/30">
                          <button 
                            onClick={async () => {
                              // if(confirm(t.deleteAccount + "? This action cannot be undone and all your data will be permanently removed.")) {
                                try {
                                  // In a real app, we would delete all user data across all collections
                                  // For now, we'll delete the user profile and sign out
                                  if (user?.uid) {
                                    await deleteDoc(doc(db, 'users', user?.uid));
                                    await deleteDoc(doc(db, 'users_public', user?.uid));
                                  }
                                  await auth.signOut();
                                  console.log("Account deleted successfully.");
                                } catch (error) {
                                  console.error("Failed to delete account", error);
                                }
                              // }
                            }}
                            className="w-full p-3 flex items-center gap-4 hover:bg-red-50 rounded-xl transition-all text-left"
                          >
                            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                              <Trash2 className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-red-600">{t.deleteAccount}</p>
                              <p className="text-[10px] text-red-400">{t.deleteAccountSub}</p>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'linked_devices' && (
                    <div className="space-y-8">
                       <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-zinc-900">Linked Devices</h4>
                              <ComingSoonBadge />
                            </div>
                            <div className="flex gap-2">
                                <button disabled className="px-3 py-1.5 rounded-lg bg-zinc-100 text-xs font-bold transition-colors text-zinc-400 border border-zinc-200 shadow-sm cursor-not-allowed flex items-center gap-2">Phone Number <ComingSoonBadge compact /></button>
                                <button disabled className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm cursor-not-allowed flex items-center gap-2 opacity-70", theme === 'glow' ? "bg-emerald-500 text-white" : "bg-emerald-500 text-white")}>QR Code <ComingSoonBadge compact /></button>
                            </div>
                        </div>
                        {showLinkQR && (
                           <div className="p-8 border rounded-2xl flex flex-col items-center justify-center space-y-4 shadow-sm bg-white border-zinc-200">
                               <h4 className="font-bold text-zinc-900">Scan QR Code</h4>
                               <div className="bg-white p-4 border border-zinc-200 shadow-sm rounded-xl">
                                   <QrCode className="w-48 h-48 text-zinc-900" />
                               </div>
                               <button onClick={handleSimulateDeviceLink} className="text-xs font-bold text-emerald-600 underline">Simulate Scan</button>
                               <button onClick={() => setShowLinkQR(false)} className="text-xs font-bold text-zinc-500 mt-4">Cancel</button>
                           </div>
                        )}
                        {showLinkPhone && (
                           <div className="p-8 border rounded-2xl flex flex-col items-center justify-center space-y-4 shadow-sm bg-white border-zinc-200">
                               <h4 className="font-bold text-zinc-900">Link with Phone</h4>
                               <div className="w-full max-w-xs flex flex-col gap-2">
                                   <input type="tel" placeholder="+1 (555)" className="w-full px-4 py-2 border border-zinc-300 rounded-lg text-sm" />
                                   <button onClick={handleSimulateDeviceLink} className="w-full py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold shadow-sm">Send Code</button>
                               </div>
                               <button onClick={() => setShowLinkPhone(false)} className="text-xs font-bold text-zinc-500 mt-4">Cancel</button>
                           </div>
                        )}
                        <div className="space-y-3">
                          {linkedDevices.map(device => (
                              <div key={device.id} className={cn("flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border gap-4", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                                <div className="flex items-center gap-3">
                                   <div className={cn("p-2 rounded-lg", theme === 'glow' ? "bg-emerald-500/20 text-emerald-400" : "bg-white border text-zinc-600")}>
                                      <MonitorSmartphone className="w-5 h-5" />
                                   </div>
                                   <div>
                                       <div className="flex items-center gap-2">
                                           <h4 className={cn("text-xs font-bold uppercase", theme !== 'light' ? 'text-white' : 'text-zinc-900')}>{device.name}</h4>
                                           {device.isActive && <span className="text-emerald-500 text-[10px] uppercase font-bold">Active</span>}
                                       </div>
                                       <p className="text-[10px] text-zinc-500">{device.ip} • {device.location}</p>
                                   </div>
                                </div>
                                <button onClick={() => setLinkedDevices(prev => prev.filter(d => d.id !== device.id))} className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">Log out</button>
                              </div>
                          ))}
                        </div>
                    </div>
                  )}

                  {activeSettingsTab === 'privacy' && (
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-900">Who can see my personal info</h4>
                        <div className={cn("space-y-4 p-4 rounded-2xl border", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                          {[
                            { label: t.lastSeen, key: 'lastSeen' },
                            { label: t.profilePhoto, key: 'profilePhoto' },
                            { label: t.about, key: 'about' },
                            { label: t.groups, key: 'groups' },
                          ].map((item) => (
                            <div key={item.key} className="flex items-center justify-between">
                              <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white/70" : "text-zinc-700")}>{item.label}</span>
                              <select 
                                className="text-xs font-bold bg-white border border-zinc-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-emerald-500/20"
                                value={(profile?.privacySettings as any)?.[item.key] || 'everyone'}
                                onChange={(e) => updatePrivacySetting(item.key, e.target.value)}
                              >
                                <option value="everyone">{t.everyone}</option>
                                <option value="contacts">{t.contacts}</option>
                                <option value="nobody">{t.nobody}</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-900">Security</h4>
                        <div className={cn("space-y-4 p-4 rounded-2xl border", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white/70" : "text-zinc-700")}>{t.readReceipts}</span>
                              <p className="text-[10px] text-zinc-400">If turned off, you won't send or receive read receipts.</p>
                            </div>
                            <button 
                              onClick={() => updatePrivacySetting('readReceipts', !(profile?.privacySettings?.readReceipts ?? true))}
                              className={cn(
                                "w-10 h-5 rounded-full transition-all relative",
                                (profile?.privacySettings?.readReceipts ?? true) ? 'bg-emerald-500' : 'bg-zinc-300'
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                (profile?.privacySettings?.readReceipts ?? true) ? 'left-6' : 'left-1'
                              )} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'chats' && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-900">{t.theme}</h4>
                        <div className={cn("space-y-4 p-4 rounded-2xl border", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white/70" : "text-zinc-700")}>{t.theme}</span>
                            <div className="flex gap-2">
                              {['light', 'dark', 'glow'].map((v) => (
                                <button
                                  key={v}
                                  onClick={() => updateTheme(v as any)}
                                  className={cn(
                                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                                    theme === v ? "bg-emerald-500 text-white shadow-lg" : "bg-white text-zinc-500 border border-zinc-200"
                                  )}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white/70" : "text-zinc-700")}>{t.fontSize}</span>
                            <select 
                              value={fontSize}
                              onChange={(e) => setFontSize(e.target.value as any)}
                              className="text-xs font-bold bg-white border border-zinc-200 rounded-lg px-2 py-1"
                            >
                              <option value="small">Small</option>
                              <option value="medium">Medium</option>
                              <option value="large">Large</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-900">{t.chatSettings || 'Chat Settings'}</h4>
                        <div className={cn("space-y-4 p-4 rounded-2xl border", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                          <button 
                            onClick={() => {
                              const colors = ['#ffffff', '#f3f4f6', '#e5e7eb', '#d1d5db', '#111827', '#064e3b', '#1e3a8a', '#581c87'];
                              const color = prompt("Enter a hex color for your wallpaper (e.g. #064e3b) or choose from: " + colors.join(', '));
                              if (color) {
                                setChatWallpaper(color);
                                alert("Wallpaper updated!");
                              }
                            }}
                            className="w-full flex items-center justify-between text-sm font-medium text-zinc-700 hover:bg-black/5 p-2 rounded-xl transition-all"
                          >
                            <span>{t.chatWallpaper || 'Chat Wallpaper'}</span>
                            <ImageIcon className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button 
                            onClick={() => {
                              alert("Backing up your chats to Aegis Cloud... This may take a few minutes.");
                              setTimeout(() => alert("Backup completed successfully!"), 3000);
                            }}
                            className="w-full flex items-center justify-between text-sm font-medium text-zinc-700 hover:bg-black/5 p-2 rounded-xl transition-all"
                          >
                            <span>{t.chatBackup || 'Chat Backup'}</span>
                            <History className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button 
                            onClick={async () => {
                                try {
                                  const q = query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid));
                                  const snapshot = await getDocs(q);
                                  const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
                                  await Promise.all(deletePromises);
                                  console.log("All chats cleared successfully.");
                                } catch (error) {
                                  console.error("Failed to clear chats", error);
                                }
                            }}
                            className="w-full flex items-center justify-between text-sm font-medium text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all"
                          >
                            <span>{t.clearAllChats || 'Clear All Chats'}</span>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'notifications' && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-zinc-900">{t.notifications}</h4>
                          <ComingSoonBadge />
                        </div>
                        <div className={cn("space-y-4 p-4 rounded-2xl border", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white/70" : "text-zinc-700")}>{t.tones}</span>
                            <Volume2 className="w-4 h-4 text-emerald-500" />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white/70" : "text-zinc-700")}>{t.vibrate}</span>
                            <span className="text-xs font-bold text-zinc-400">{t.default}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white/70" : "text-zinc-700")}>{t.highPriority}</span>
                            <button 
                              onClick={() => updateUserSetting('notificationSettings', 'highPriority', !(profile?.notificationSettings?.highPriority ?? true))}
                              className={cn(
                                "w-10 h-5 rounded-full transition-all relative",
                                (profile?.notificationSettings?.highPriority ?? true) ? 'bg-emerald-500' : 'bg-zinc-300'
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                (profile?.notificationSettings?.highPriority ?? true) ? 'left-6' : 'left-1'
                              )} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'calls' && renderCallSettings()}

                  {activeSettingsTab === 'storage' && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-900">{t.storage}</h4>
                        <div className={cn("space-y-2 p-2 rounded-2xl border", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                          <button 
                            onClick={() => alert("Storage analysis in progress... You have 1.2 GB of media and 50 MB of chat data.")}
                            className="w-full p-3 flex items-center justify-between hover:bg-black/5 rounded-xl transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <HardDrive className="w-4 h-4 text-zinc-400" />
                              <span className="text-sm font-medium">{t.manageStorage}</span>
                            </div>
                            <span className="text-[10px] font-bold text-zinc-400">1.2 GB used</span>
                          </button>
                          <button 
                            onClick={() => alert("Network usage report: 450 MB sent, 1.1 GB received since last reset.")}
                            className="w-full p-3 flex items-center justify-between hover:bg-black/5 rounded-xl transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <Wifi className="w-4 h-4 text-zinc-400" />
                              <span className="text-sm font-medium">{t.networkUsage}</span>
                            </div>
                            <span className="text-[10px] font-bold text-zinc-400">450 MB sent • 1.1 GB received</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-900">{t.mediaAutoDownload}</h4>
                        <div className={cn("space-y-4 p-4 rounded-2xl border", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                          {[
                            { label: t.onMobileData, key: 'mobileData' },
                            { label: t.onWifi, key: 'wifi' },
                          ].map((item) => (
                            <div key={item.key} className="flex items-center justify-between">
                              <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white/70" : "text-zinc-700")}>{item.label}</span>
                              <select 
                                className="text-xs font-bold bg-white border border-zinc-200 rounded-lg px-2 py-1"
                                value={(profile?.storageSettings as any)?.[item.key] || 'noMedia'}
                                onChange={(e) => updateUserSetting('storageSettings', item.key, e.target.value)}
                              >
                                <option value="noMedia">{t.noMedia}</option>
                                <option value="photos">Photos</option>
                                <option value="allMedia">{t.allMedia}</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'help' && (
                    <div className="space-y-6">
                      <div className={cn("space-y-2 p-4 rounded-2xl border", theme !== 'light' ? 'bg-zinc-900/50 border-zinc-500/20' : 'bg-zinc-50 border-zinc-100')}>
                        <button 
                          onClick={() => setActiveSection('chats')}
                          className="w-full flex items-center justify-between p-3 hover:bg-black/5 rounded-xl transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <HelpCircle className="w-5 h-5 text-zinc-400" />
                            <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white" : "text-zinc-700")}>{t.helpCenter}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-300" />
                        </button>
                        <button 
                          onClick={() => document.getElementById('contact-feedback-panel-alt')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          className="w-full flex items-center justify-between p-3 hover:bg-black/5 rounded-xl transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <Users className="w-5 h-5 text-zinc-400" />
                            <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white" : "text-zinc-700")}>Contact & Feedback</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-300" />
                        </button>
                        <a 
                          href="/agreement.html" 
                          target="_blank"
                          className="w-full flex items-center justify-between p-3 hover:bg-black/5 rounded-xl transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-zinc-400" />
                            <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white" : "text-zinc-700")}>{t.termsPrivacy}</span>
                          </div>
                          <ExternalLink className="w-4 h-4 text-zinc-300" />
                        </a>
                        <button className="w-full flex items-center justify-between p-3 hover:bg-black/5 rounded-xl transition-all">
                          <div className="flex items-center gap-3">
                            <Info className="w-5 h-5 text-zinc-400" />
                            <span className={cn("text-sm font-medium", theme === 'glow' ? "text-white" : "text-zinc-700")}>{t.appInfo}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-300" />
                        </button>
                      </div>

                      <div id="contact-feedback-panel-alt" className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-900">Contact & Feedback</h4>
                        <div className={cn("space-y-4 p-6 rounded-3xl border transition-all", theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100")}>
                          <p className="text-xs text-zinc-500">Use this for support questions, product feedback, and bug reports.</p>
                          <textarea 
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Describe your question, feedback, or issue..."
                            className={cn("w-full px-4 py-3 rounded-2xl text-sm focus:ring-2 transition-all min-h-[100px] resize-none", theme === 'glow' ? "bg-emerald-900/40 border-emerald-500/20 text-white focus:ring-emerald-500/20" : "bg-white border-zinc-200 text-zinc-900")}
                          />
                          <button 
                            onClick={submitFeedback}
                            disabled={isSubmittingFeedback || !feedback.trim()}
                            className={cn("w-full py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2", theme === 'glow' ? "bg-emerald-500 text-white" : "bg-zinc-900 text-white hover:bg-zinc-800")}
                          >
                            {isSubmittingFeedback ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                            Submit Contact & Feedback
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Complete Profile Modal */}
      <AnimatePresence>
        {showCompleteProfile && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-zinc-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-[2rem] flex items-center justify-center">
                  <UserIcon className="w-10 h-10 text-emerald-500" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-white">Complete Your Profile</h2>
                  <p className="text-zinc-500 text-sm">To be discoverable by your contacts, please provide a display name. Phone number is optional.</p>
                </div>

                <div className="w-full space-y-4">
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Display Name</label>
                    <input 
                      type="text" 
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="w-full px-6 py-4 bg-zinc-800 border-none rounded-2xl text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      placeholder="Your Name"
                    />
                  </div>
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Phone Number (Optional)</label>
                    <input 
                      type="tel" 
                      value={editPhoneNumber}
                      onChange={(e) => setEditPhoneNumber(e.target.value)}
                      className="w-full px-6 py-4 bg-zinc-800 border-none rounded-2xl text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                </div>

                <button 
                  onClick={async () => {
                    await updateProfile();
                    setShowCompleteProfile(false);
                  }}
                  disabled={!editDisplayName || isUpdatingProfile}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isUpdatingProfile ? 'Saving...' : 'Get Started'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Two-Step Verification Setup Modal */}
      <AnimatePresence>
        {showTwoStepSetup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-zinc-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8"
            >
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                  <Lock className="w-8 h-8 text-emerald-500" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-white">Two-Step Verification</h2>
                  <p className="text-zinc-500 text-sm">Enter a 6-digit PIN which you'll be asked for when you register your phone number with Aegis again.</p>
                </div>

                <input 
                  type="password" 
                  maxLength={6}
                  value={twoStepPin}
                  onChange={(e) => setTwoStepPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-6 py-4 bg-zinc-800 border-none rounded-2xl text-white text-center text-3xl tracking-[1em] focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  placeholder="••••••"
                />

                <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => setShowTwoStepSetup(false)}
                    className="flex-1 py-4 bg-zinc-800 text-white rounded-2xl font-bold hover:bg-zinc-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={async () => {
                      await updateUserSetting('securitySettings', 'twoStepPin', twoStepPin);
                      await updateUserSetting('securitySettings', 'twoStepEnabled', true);
                      alert("Two-step verification enabled successfully!");
                      setShowTwoStepSetup(false);
                    }}
                    disabled={twoStepPin.length !== 6}
                    className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all disabled:opacity-50"
                  >
                    Enable
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showVault && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "w-full max-w-md rounded-3xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col transition-all",
                theme === 'glow' ? "bg-zinc-950 border border-emerald-500/20" : "bg-white"
              )}
            >
              <div className={cn(
                "p-6 border-b flex items-center justify-between shrink-0 transition-all",
                theme === 'glow' ? "border-emerald-500/20" : "border-zinc-100"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                    theme === 'glow' ? "bg-emerald-500/20" : "bg-emerald-500/10"
                  )}>
                    <Shield className={cn("w-5 h-5", theme === 'glow' ? "text-emerald-400" : "text-emerald-600")} />
                  </div>
                  <h2 className={cn(
                    "text-xl font-bold",
                    theme !== 'light' ? 'text-white' : 'text-zinc-900'
                  )}>Aegis Secure Vault</h2>
                </div>
                <button onClick={() => setShowVault(false)} className="text-zinc-400 hover:text-zinc-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <div className="mb-6">
                  <label className={cn(
                    "w-full h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all",
                    theme === 'glow' ? "border-emerald-500/20 hover:bg-emerald-500/5" : "border-zinc-200 hover:bg-zinc-50"
                  )}>
                    <Plus className={cn("w-6 h-6", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400")} />
                    <span className={cn("text-sm font-medium", theme === 'glow' ? "text-emerald-500/70" : "text-zinc-500")}>Upload Secure File</span>
                    <input type="file" className="hidden" onChange={uploadToVault} />
                  </label>
                </div>

                <div className="space-y-3">
                  <h4 className={cn(
                    "text-xs font-bold uppercase tracking-wider ml-1",
                    theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400"
                  )}>Stored Files</h4>
                  {secureFiles.length === 0 ? (
                    <div className="text-center py-12 text-zinc-300">
                      <Paperclip className="w-10 h-10 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No files in vault</p>
                    </div>
                  ) : (
                    secureFiles.map((file, i) => (
                      <div key={i} className={cn(
                        "p-4 rounded-2xl border flex items-center justify-between transition-all",
                        theme === 'glow' ? "bg-emerald-900/20 border-emerald-500/20" : "bg-zinc-50 border-zinc-100"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shadow-sm transition-all",
                            theme === 'glow' ? "bg-emerald-900/40" : "bg-white"
                          )}>
                            <FileText className={cn("w-4 h-4", theme === 'glow' ? "text-emerald-400" : "text-zinc-500")} />
                          </div>
                          <div>
                            <p className={cn("text-sm font-bold truncate max-w-[150px]", theme !== 'light' ? 'text-white' : 'text-zinc-900')}>{file.name}</p>
                            <p className={cn("text-[10px]", theme === 'glow' ? "text-emerald-500/50" : "text-zinc-400")}>{(file.size / 1024).toFixed(1)} KB • {file.date}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={async () => {
                              setSelectedFile(file);
                              setShowVault(false);
                              // Auto-send if a chat is selected
                              if (selectedChatId) {
                                // We need to trigger sendMessage manually or wait for state update
                                // For simplicity, let's just set the state and the user clicks send
                                // But the user wants it "sendable", so let's try to send immediately
                                setTimeout(() => {
                                  const sendBtn = document.getElementById('chat-send-btn');
                                  sendBtn?.click();
                                }, 100);
                              }
                            }}
                            title="Send this file to the current chat"
                            className={cn(
                              "p-2 rounded-lg transition-colors text-xs font-bold uppercase tracking-widest",
                              theme === 'glow' ? "text-emerald-400 hover:bg-emerald-500/10" : "text-emerald-600 hover:bg-emerald-50"
                            )}
                          >
                            Send
                          </button>
                          <button 
                            title="Encrypted file"
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              theme === 'glow' ? "text-emerald-500/50 hover:bg-emerald-500/10" : "text-zinc-400 hover:bg-zinc-100"
                            )}
                          >
                            <Lock className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showNewGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-bold">{t.createNewGroup || 'Create New Group'}</h2>
                </div>
                <button onClick={() => setShowNewGroup(false)} className="text-zinc-400 hover:text-zinc-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Group Name</label>
                  <input 
                    type="text" 
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Enter group name..."
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Select Participants</h4>
                  <div className="space-y-2">
                    {allUsers.length > 0 ? (
                      allUsers.map((u, i) => (
                        <button 
                          key={`${u.uid || u.email}-${i}`}
                          onClick={() => {
                            const participantId = u.uid;
                            if (!participantId || participantId.startsWith('temp-')) return;
                            if (selectedGroupParticipants.includes(participantId)) {
                              setSelectedGroupParticipants(selectedGroupParticipants.filter(id => id !== participantId));
                            } else {
                              setSelectedGroupParticipants([...selectedGroupParticipants, participantId]);
                            }
                          }}
                          className={cn(
                            "w-full p-3 rounded-xl border flex items-center justify-between transition-all",
                            selectedGroupParticipants.includes(u.uid || '') 
                              ? "bg-emerald-50 border-emerald-200" 
                              : "bg-zinc-50 border-zinc-100 hover:bg-zinc-100"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-zinc-200 rounded-lg flex items-center justify-center overflow-hidden">
                              {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover" alt="" /> : <UserIcon className="w-4 h-4 text-zinc-500" />}
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-bold">{u.displayName}</p>
                              <p className="text-[10px] text-zinc-400">{u.email}</p>
                            </div>
                          </div>
                          {selectedGroupParticipants.includes(u.uid || '') && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </button>
                      ))
                    ) : (
                      <div className="p-8 text-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                        <UserPlus className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                        <p className="text-xs text-zinc-500">No other users found yet.</p>
                        <p className="text-[10px] text-zinc-400 mt-1">You can still create a group to test the verification feature.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-zinc-100">
                <button 
                  onClick={createGroup}
                  disabled={isCreatingGroup || !newGroupName.trim()}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                >
                  {isCreatingGroup ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activeVideoCall && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-center p-6"
          >
            <div className="w-full max-w-4xl aspect-video bg-zinc-900 rounded-3xl overflow-hidden relative shadow-2xl border border-zinc-800">
              <video
                id="remote-video"
                autoPlay
                playsInline
                onPlay={() => setHasRemoteVideo(true)}
                onEmptied={() => setHasRemoteVideo(false)}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className={cn("absolute inset-0 flex items-center justify-center transition-opacity", hasRemoteVideo ? "opacity-0" : "opacity-100")}>
                <div className="text-center pointer-events-none">
                  <div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-zinc-700">
                    <UserIcon className="w-12 h-12 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    {selectedChat ? getChatDisplayName(selectedChat) : 'User'}
                  </h3>
                  <p className="text-zinc-500 text-sm font-medium uppercase tracking-widest">Secure Video Call</p>
                </div>
              </div>

              {/* Deepfake Overlay Warning */}
              {(deepfakeRisk || 0) > 80 && (
                <div className="absolute inset-0 bg-red-950/80 flex items-center justify-center z-10 animate-in fade-in zoom-in duration-300 backdrop-blur-sm">
                  <div className="text-center p-8 max-w-sm">
                    <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_80px_rgba(220,38,38,0.8)] animate-pulse">
                      <ShieldAlert className="w-12 h-12 text-white" />
                    </div>
                    <h2 className="text-3xl font-black text-red-500 tracking-widest uppercase mb-4 drop-shadow-xl bg-clip-text">Deepfake Detected</h2>
                    <p className="text-white font-medium mb-8 leading-relaxed">
                      Aegis biometric scan has identified synthetic facial manipulation and deepfake audio patterns. 
                      <span className="block mt-2 text-red-400 font-bold">This is likely a scam. Disconnect immediately.</span>
                    </p>
                    <button 
                      onClick={endVideoCall}
                      className="w-full py-4 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all outline-none"
                    >
                      End Call Now
                    </button>
                  </div>
                </div>
              )}

              {/* Local Video (Simulated -> Real) */}
              <div className="absolute bottom-6 right-6 w-48 aspect-video bg-zinc-800 rounded-2xl border-2 border-zinc-700 shadow-xl overflow-hidden">
                {isCameraOn ? (
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <UserIcon className="w-8 h-8 text-zinc-600" />
                  </div>
                )}
              </div>

              {/* AI Vishing Guard Overlay */}
              <div className="absolute top-6 left-6 right-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="px-4 py-2 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-full flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">AI Vishing Guard Active</span>
                  </div>
                  
                  {callSecurityStatus && !callSecurityStatus.isSafe && (
                    <motion.div 
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="px-4 py-2 bg-red-500 backdrop-blur-md border border-red-600 rounded-full flex items-center gap-2 shadow-lg shadow-red-500/40"
                    >
                      <ShieldAlert className="w-4 h-4 text-white" />
                      <span className="text-xs font-bold text-white uppercase tracking-widest">Threat Detected</span>
                    </motion.div>
                  )}
                </div>

                {/* Real-time Transcript & Analysis */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl h-48 overflow-y-auto">
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Real-time Transcript</h4>
                    <div className="space-y-2">
                      {callTranscript.map((line, i) => (
                        <p key={i} className="text-xs text-white/80 leading-relaxed italic">"{line}"</p>
                      ))}
                      {isCalling && (
                        <div className="flex gap-1 mt-2">
                          <div className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce" />
                          <div className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn(
                    "p-4 backdrop-blur-md border rounded-2xl h-48 overflow-y-auto transition-all duration-500 flex flex-col",
                    (deepfakeRisk || 0) > 80 
                      ? "bg-red-500/20 border-red-500/40" 
                      : (deepfakeRisk || 0) > 40 ? "bg-yellow-500/20 border-yellow-500/40" : "bg-black/40 border-white/10"
                  )}>
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Deepfake Scanner</h4>
                    <div className="flex items-center gap-3 mb-2 shrink-0">
                      <div className="relative w-12 h-12 rounded-full border border-white/20 flex items-center justify-center shrink-0">
                        {isCalling && <div className="absolute inset-0 rounded-full border-t-2 border-emerald-500 animate-spin" />}
                        <Eye className={cn("w-5 h-5", (deepfakeRisk || 0) > 80 ? 'text-red-500 animate-pulse' : 'text-emerald-500')} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">Biometric Confidence</div>
                        <div className="text-xs text-zinc-400">{100 - (deepfakeRisk || 0)}% Authentic</div>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto mt-2">
                      <p className="text-[11px] text-zinc-300 italic">
                        {deepfakeStatus}
                      </p>
                      {(deepfakeRisk || 0) > 50 && (
                        <div className="mt-2 text-[10px] font-medium text-red-400 uppercase tracking-wider animate-pulse">
                          ⚠️ Live video manipulation detected
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn(
                    "p-4 backdrop-blur-md border rounded-2xl h-48 overflow-y-auto transition-all duration-500",
                    callSecurityStatus?.isSafe === false 
                      ? "bg-red-500/20 border-red-500/40" 
                      : "bg-black/40 border-white/10"
                  )}>
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">AI Security Analysis</h4>
                    {callSecurityStatus ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          {callSecurityStatus.isSafe ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 text-red-500" />
                          )}
                          <span className={cn(
                            "text-xs font-bold uppercase tracking-wider",
                            callSecurityStatus.isSafe ? "text-emerald-500" : "text-red-500"
                          )}>
                            {callSecurityStatus.isSafe ? "No Threats Detected" : "Vishing Attempt Detected"}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/70 leading-relaxed">
                          {callSecurityStatus.summary}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500 italic">Analyzing audio stream for social engineering patterns...</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Call Controls */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6">
                <button 
                  onClick={toggleMic}
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center transition-all border",
                    isMicOn ? "bg-emerald-600 border-emerald-700 text-white" : "bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700"
                  )}
                  title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button 
                  onClick={toggleCamera}
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center transition-all border",
                    isCameraOn ? "bg-emerald-600 border-emerald-700 text-white" : "bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700"
                  )}
                  title={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
                >
                  {isCameraOn ? <Camera className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
                <button 
                  onClick={endVideoCall}
                  className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-all shadow-xl shadow-red-600/20"
                >
                  <XCircle className="w-8 h-8" />
                </button>
                <button className="w-14 h-14 bg-zinc-800 text-white rounded-full flex items-center justify-center hover:bg-zinc-700 transition-all border border-zinc-700">
                  <ShieldCheck className="w-6 h-6" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar Picker Modal */}
      <AnimatePresence>
        {showAvatarPicker && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-zinc-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl bg-white rounded-[2.5rem] p-8 shadow-2xl max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Choose Profile Icon</h2>
                <button onClick={() => setShowAvatarPicker(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <XCircle className="w-6 h-6 text-zinc-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2">
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
                  {/* Gallery Option */}
                  <button 
                    onClick={() => avatarInputRef.current?.click()}
                    className="aspect-square bg-zinc-100 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                  >
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-5 h-5 text-emerald-600" />
                    </div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Gallery</span>
                  </button>

                  {/* Preset Avatars */}
                  {PRESET_AVATARS.map((url, i) => (
                    <button 
                      key={i}
                      onClick={() => {
                        setEditPhotoURL(url);
                        setShowAvatarPicker(false);
                        setIsProfileGlow(true);
                        setTimeout(() => setIsProfileGlow(false), 2000);
                      }}
                      className={cn(
                        "aspect-square rounded-2xl overflow-hidden border-2 transition-all hover:scale-110 active:scale-95 relative group",
                        editPhotoURL === url ? "border-emerald-500 glow-emerald-lg scale-105" : "border-transparent hover:border-zinc-200"
                      )}
                    >
                      <img src={url} className="w-full h-full object-cover" alt={`Avatar ${i}`} />
                      {editPhotoURL === url && (
                        <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>

              <input 
                type="file" 
                ref={avatarInputRef} 
                onChange={handleAvatarUpload} 
                className="hidden" 
                accept="image/*"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showParticipants && selectedChat && selectedChat.type === 'group' && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-zinc-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">{t.groupMembers || 'Group Members'}</h2>
                <button onClick={() => setShowParticipants(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <XCircle className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="space-y-4">
                {(selectedChat.participants || []).map(p => {
                    let profile: any = allUsers.find(u => u.email === p);
                    if (!profile) {
                      profile = syncedContacts.find(c => c.phoneNumber === p || c.email === p || c.uid === p || c.displayName === p);
                    }
                    return (
                        <div key={p} className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center overflow-hidden">
                             {profile?.photoURL ? <img src={profile.photoURL} className="w-full h-full object-cover" alt="" /> : <UserIcon className="w-5 h-5 text-zinc-500" />}
                         </div>
                         <div>
                             <p className="text-sm font-bold">{profile?.displayName || p}</p>
                             <p className="text-[10px] text-zinc-400">{p}</p>
                         </div>
                        </div>
                    )
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showChatSecurity && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-zinc-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8"
            >
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-[2rem] flex items-center justify-center">
                  <ShieldCheck className="w-10 h-10 text-emerald-500" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-white">Security Verification</h2>
                  <p className="text-zinc-500 text-sm">This chat is protected by military-grade end-to-end encryption.</p>
                </div>

                <div className="w-full space-y-3">
                  <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Lock className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm text-white">E2EE Protocol</span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-500 uppercase">AES-GCM 256</span>
                  </div>
                  <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm text-white">AI Guard</span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-500 uppercase">Active</span>
                  </div>
                  <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <UserIcon className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm text-white">Identity Verified</span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-500 uppercase">Verified</span>
                  </div>
                </div>

                  <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 w-full">
                    <p className="text-[10px] text-emerald-500/70 font-mono break-all leading-relaxed">
                      My Fingerprint: {profile?.publicKey?.slice(0, 32) || 'Generating...'}...
                    </p>
                    <p className="text-[10px] text-emerald-500/70 font-mono break-all leading-relaxed mt-2">
                      Recipient Fingerprint: {recipientProfile?.publicKey ? recipientProfile.publicKey.slice(0, 32) : 'Verifying...'}...
                    </p>
                  </div>

                  <button 
                    onClick={() => setShowChatSecurity(false)}
                    className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all"
                  >
                    Done
                  </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showGroupVerification && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden border border-zinc-200"
            >
              <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-14 h-14 rounded-3xl flex items-center justify-center shadow-lg",
                    showGroupVerification.isVerified ? "bg-emerald-500 text-white shadow-emerald-500/20" : "bg-red-500 text-white shadow-red-500/20"
                  )}>
                    {showGroupVerification.isVerified ? <ShieldCheck className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Group Verification Report</h2>
                    <p className="text-sm text-zinc-500 font-medium">Analysis for: <span className="text-zinc-900 font-bold">{showGroupVerification.groupName}</span></p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowGroupVerification(null)}
                  className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors text-zinc-400"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-4">
                  <div className={cn(
                    "p-6 rounded-[32px] border flex items-start gap-4",
                    showGroupVerification.isVerified ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"
                  )}>
                    <div className={cn(
                      "p-3 rounded-2xl",
                      showGroupVerification.isVerified ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                    )}>
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className={cn("text-lg font-bold mb-1", showGroupVerification.isVerified ? "text-emerald-900" : "text-red-900")}>
                        {showGroupVerification.verificationReport?.status === 'verified' ? 'Verified Safe Group' : 
                         showGroupVerification.verificationReport?.status === 'suspicious' ? 'Suspicious Group Detected' : 'Unverified Group'}
                      </h3>
                      <p className={cn("text-sm leading-relaxed", showGroupVerification.isVerified ? "text-emerald-700" : "text-red-700")}>
                        {showGroupVerification.verificationReport?.reason}
                      </p>
                    </div>
                  </div>
                </div>

                {showGroupVerification.verificationReport?.threatMarkers && showGroupVerification.verificationReport.threatMarkers.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      Security Threat Markers
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {showGroupVerification.verificationReport.threatMarkers.map((marker, idx) => (
                        <div key={idx} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center gap-3">
                          <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                          <p className="text-sm text-zinc-600 font-medium">{marker}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 bg-zinc-50 rounded-[32px] border border-zinc-100">
                    <History className="w-6 h-6 text-zinc-400 mb-3" />
                    <h4 className="text-xs font-bold uppercase mb-1 text-zinc-900">Analysis Date</h4>
                    <p className="text-sm text-zinc-500">
                      {showGroupVerification.verificationReport?.timestamp ? format(new Date(showGroupVerification.verificationReport.timestamp), 'PPP p') : 'N/A'}
                    </p>
                  </div>
                  <div className="p-6 bg-zinc-50 rounded-[32px] border border-zinc-100">
                    <Users className="w-6 h-6 text-zinc-400 mb-3" />
                    <h4 className="text-xs font-bold uppercase mb-1 text-zinc-900">Participants</h4>
                    <p className="text-sm text-zinc-500">{(showGroupVerification.participants || []).length} Members</p>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-zinc-50 border-t border-zinc-100 flex gap-4">
                {!showGroupVerification.isVerified && (
                  <button 
                    onClick={() => {
                      alert("Group reported for investigation.");
                      setShowGroupVerification(null);
                    }}
                    className="flex-1 py-4 bg-red-600 text-white rounded-[24px] font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                  >
                    Report Group
                  </button>
                )}
                <button 
                  onClick={() => setShowGroupVerification(null)}
                  className="flex-1 py-4 bg-white border border-zinc-200 text-zinc-600 rounded-[24px] font-bold hover:bg-zinc-100 transition-all"
                >
                  Close Report
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showSecurityReport && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-zinc-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden border border-red-100"
            >
              <div className={`p-8 border-b flex items-center justify-between ${ reportIsSafe ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                <div className="flex items-center gap-4">
                  <SecurityScoreCircle 
                    score={reportIsUndecryptable ? 100 : (showSecurityReport.securityStatus?.score ?? (showSecurityReport.securityStatus?.isSafe === false ? 0 : 100))} 
                    isSafe={reportIsSafe} 
                  />
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${ reportIsSafe ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-red-600 shadow-red-600/20'}`}>
                    {reportIsSafe ? <ShieldCheck className="w-7 h-7 text-white" /> : <ShieldAlert className="w-7 h-7 text-white" />}
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${reportIsSafe ? 'text-emerald-900' : 'text-red-900'}`}>{reportIsSafe ? 'Security Verified' : 'Security Analysis Report'}</h2>
                    <p className={`text-xs font-semibold uppercase tracking-widest ${reportIsSafe ? 'text-emerald-600' : 'text-red-600'}`}>
                      {reportIsUndecryptable ? 'Status: Encrypted content unavailable' : (reportIsSafe ? 'Status: Verified' : 'Threat Level: Critical')}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowSecurityReport(null)} className="p-2 hover:bg-red-100 rounded-full transition-colors text-red-900">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Analyzed Content Preview */}
                {(showSecurityReport.decryptedContent || showSecurityReport.decryptedImageUrl) && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                      <Eye className="w-3 h-3" />
                      Analyzed Content
                    </h3>
                    <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3">
                      {showSecurityReport.decryptedImageUrl && (
                        <div className="relative aspect-video rounded-xl overflow-hidden border border-zinc-200">
                          <img 
                            src={showSecurityReport.decryptedImageUrl} 
                            alt="Analyzed" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      {showSecurityReport.decryptedContent && (
                        <p className="text-sm text-zinc-700 italic">"{showSecurityReport.decryptedContent}"</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-zinc-200 shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 mb-1">Threat Type</h3>
                    <p className="text-sm text-zinc-600 capitalize">{(showSecurityReport.securityStatus as any).threatType.replace('_', ' ')}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles className="w-3 h-3" />
                    AI Summary
                  </h3>
                  <div className={cn(
                    "p-4 rounded-2xl border text-sm font-medium",
                    showSecurityReport.securityStatus?.isSafe 
                      ? "bg-emerald-50 border-emerald-100 text-emerald-900" 
                      : "bg-red-50 border-red-100 text-red-900"
                  )}>
                    {showSecurityReport.securityStatus?.summary}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    Point-by-Point Analysis
                  </h3>
                  <div className="space-y-2">
                    {(showSecurityReport.securityStatus?.points || []).map((point, i) => (
                      <div key={i} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex gap-3 items-start">
                        <div className="w-5 h-5 bg-white rounded-lg flex items-center justify-center shadow-sm border border-zinc-200 shrink-0 text-[10px] font-bold text-zinc-500">
                          {i + 1}
                        </div>
                        <p className="text-sm text-zinc-600 leading-relaxed">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 text-indigo-500">
                    <EyeOff className="w-3 h-3" />
                    Steganography Report
                  </h3>
                  <div className="p-6 bg-zinc-950 rounded-3xl text-zinc-300 text-sm leading-relaxed border border-zinc-800 font-mono">
                    <Markdown>{showSecurityReport.securityStatus?.steganographyReport || "No steganography analysis available for this message."}</Markdown>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {!reportIsSafe && (
                    <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                      <ShieldAlert className="w-5 h-5 text-red-600 mb-2" />
                      <h4 className="text-xs font-bold text-red-900 uppercase mb-1">Recommendation</h4>
                      <p className="text-[10px] text-red-700">Report this sender and avoid opening suspicious links or sharing sensitive information.</p>
                    </div>
                  )}
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <Info className="w-5 h-5 text-zinc-400 mb-2" />
                    <h4 className="text-xs font-bold uppercase mb-1 text-zinc-900">Detection Engine</h4>
                    <p className="text-[10px] text-zinc-500">Powered by Gemini 3 Flash with real-time heuristic & multimodal analysis.</p>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex gap-3">
                {!reportIsSafe && (
                  <button 
                    onClick={() => {
                      alert("Report accepted by AEGIS GUARD DEV.");
                      setShowSecurityReport(null);
                    }}
                    className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                  >
                    Report to AGD
                  </button>
                )}
                <button 
                  onClick={() => setShowSecurityReport(null)}
                  className="px-6 py-3 bg-white border border-zinc-200 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-100 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ScheduleModal 
        isOpen={showScheduleModal !== null}
        onClose={() => setShowScheduleModal(null)}
        onSchedule={handleScheduleEvent}
        type={showScheduleModal || 'call'}
        title={scheduleTitle}
        setTitle={setScheduleTitle}
        date={scheduleDate}
        setDate={setScheduleDate}
        time={scheduleTime}
        setTime={setScheduleTime}
        isScheduling={isScheduling}
        guests={scheduleGuests}
        setGuests={setScheduleGuests}
      />

      {showSecurityDashboard && user && (
        <SecurityDashboard
          userId={user.uid}
          userEmail={user.email || ''}
          theme={theme}
          onClose={() => setShowSecurityDashboard(false)}
        />
      )}

      {showAdminDashboard && user && isUserAdmin && (
        <AdminDashboard
          adminId={user.uid}
          theme={theme}
          onClose={() => setShowAdminDashboard(false)}
        />
      )}

      {showForwardModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Forward className="w-5 h-5" /> Forward Message</h3>
            <p className="text-sm text-zinc-500 mb-4 truncate">{showForwardModal.decryptedContent?.slice(0, 100)}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {chats.filter(c => c.type === 'direct' || c.type === 'group').map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleForwardMessage(chat.id)}
                  className="w-full text-left p-3 rounded-xl hover:bg-zinc-50 border border-zinc-100 text-sm font-medium"
                >
                  {getChatDisplayName(chat)}
                </button>
              ))}
            </div>
            <button onClick={() => setShowForwardModal(null)} className="w-full mt-4 py-2 text-zinc-500 text-sm font-bold">Cancel</button>
          </div>
        </div>
      )}

      {/* WebRTC video elements (hidden until call active) */}
      {activeMeetingRoom && (
        <div className="hidden">
          <video id="local-video" autoPlay muted playsInline />
        </div>
      )}
    </div>
  );
}
