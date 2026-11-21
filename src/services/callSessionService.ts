import {
  equalTo,
  get,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  update,
  type DataSnapshot,
} from 'firebase/database';
import type { CallSession, CallType } from '../types';
import { rtdb } from '../firebase';

type CallSessionUpdate = Partial<Omit<CallSession, 'id' | 'startedAt'>> & {
  endedAt?: number | null;
  transcriptEntries?: unknown[] | null;
};

function database() {
  if (!rtdb) {
    throw new Error('Call signaling is not configured. Set VITE_FIREBASE_DATABASE_URL to your Realtime Database URL.');
  }
  return rtdb;
}

function sessionFromSnapshot(snapshot: DataSnapshot): CallSession | null {
  if (!snapshot.exists()) return null;
  const value = snapshot.val() as Omit<CallSession, 'id'> & { transcriptEntries?: Record<string, unknown> | unknown[] };
  const transcriptEntries = value.transcriptEntries
    ? (Array.isArray(value.transcriptEntries) ? value.transcriptEntries : Object.values(value.transcriptEntries))
    : undefined;
  return { ...value, id: snapshot.key || '', transcriptEntries } as CallSession;
}

function sessionsFromSnapshot(snapshot: DataSnapshot): CallSession[] {
  const calls: CallSession[] = [];
  snapshot.forEach(child => {
    const call = sessionFromSnapshot(child);
    if (call) calls.push(call);
  });
  return calls;
}

export async function createCallSession(
  roomId: string,
  callerId: string,
  calleeId: string,
  type: CallType,
  callerDisplayName = '',
): Promise<CallSession> {
  const callRef = push(ref(database(), 'callSessions'));
  if (!callRef.key) throw new Error('Could not allocate a call session.');
  const call: CallSession = {
    id: callRef.key,
    roomId,
    callerId,
    calleeId,
    type,
    callerDisplayName,
    status: 'ringing',
    startedAt: Date.now(),
  };
  const storedCall = {
    roomId: call.roomId,
    callerId: call.callerId,
    calleeId: call.calleeId,
    callerDisplayName: call.callerDisplayName,
    type: call.type,
    status: call.status,
    startedAt: call.startedAt,
  };
  await set(callRef, storedCall);
  return call;
}

export async function getCallSession(callId: string): Promise<CallSession | null> {
  return sessionFromSnapshot(await get(ref(database(), `callSessions/${callId}`)));
}

export function updateCallSession(callId: string, values: CallSessionUpdate): Promise<void> {
  return update(ref(database(), `callSessions/${callId}`), values as Record<string, unknown>);
}

export async function appendCallTranscriptEntries(callId: string, entries: unknown[]): Promise<void> {
  if (!entries.length) return;
  const snapshot = await get(ref(database(), `callSessions/${callId}/transcriptEntries`));
  const current = snapshot.exists()
    ? (Array.isArray(snapshot.val()) ? snapshot.val() : Object.values(snapshot.val()))
    : [];
  await set(ref(database(), `callSessions/${callId}/transcriptEntries`), [...current, ...entries].slice(-40));
}

export function subscribeIncomingCallSessions(
  userId: string,
  next: (calls: CallSession[]) => void,
  error: (reason: Error) => void,
): () => void {
  if (!rtdb) {
    error(new Error('Call signaling is not configured. Set VITE_FIREBASE_DATABASE_URL.'));
    return () => undefined;
  }
  const incomingQuery = query(ref(database(), 'callSessions'), orderByChild('calleeId'), equalTo(userId), limitToLast(10));
  return onValue(incomingQuery, snapshot => next(sessionsFromSnapshot(snapshot)), error);
}

export function subscribeCallSession(
  callId: string,
  next: (call: CallSession | null) => void,
  error: (reason: Error) => void,
): () => void {
  if (!rtdb) {
    error(new Error('Call signaling is not configured. Set VITE_FIREBASE_DATABASE_URL.'));
    return () => undefined;
  }
  return onValue(ref(database(), `callSessions/${callId}`), snapshot => next(sessionFromSnapshot(snapshot)), error);
}

export function subscribeCallHistory(
  userId: string,
  next: (calls: CallSession[]) => void,
  error: (reason: Error) => void,
): () => void {
  if (!rtdb) {
    error(new Error('Call signaling is not configured. Set VITE_FIREBASE_DATABASE_URL.'));
    return () => undefined;
  }
  let outgoing: CallSession[] = [];
  let incoming: CallSession[] = [];
  const publish = () => {
    const unique = new Map<string, CallSession>();
    [...outgoing, ...incoming].forEach(call => unique.set(call.id, call));
    next(Array.from(unique.values()).sort((a, b) => Number(b.startedAt) - Number(a.startedAt)));
  };
  const callsRef = ref(database(), 'callSessions');
  const stopOutgoing = onValue(
    query(callsRef, orderByChild('callerId'), equalTo(userId), limitToLast(100)),
    snapshot => { outgoing = sessionsFromSnapshot(snapshot); publish(); },
    error,
  );
  const stopIncoming = onValue(
    query(callsRef, orderByChild('calleeId'), equalTo(userId), limitToLast(100)),
    snapshot => { incoming = sessionsFromSnapshot(snapshot); publish(); },
    error,
  );
  return () => { stopOutgoing(); stopIncoming(); };
}
