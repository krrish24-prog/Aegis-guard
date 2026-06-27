/** System participant ID for the Aegis Guard AI chat (not a Firebase Auth user). */
export const AEGIS_GUARD_PARTICIPANT = 'aegis-guard@aegis.ai';

export function isSystemParticipant(id: string): boolean {
  return id === AEGIS_GUARD_PARTICIPANT;
}

export function resolveParticipantToUid(
  participant: string,
  usersByEmail: Map<string, string>,
  usersByUid: Set<string>
): string | null {
  if (!participant || participant.startsWith('temp-')) return null;
  if (isSystemParticipant(participant)) return participant;
  if (usersByUid.has(participant)) return participant;
  if (participant.includes('@')) {
    return usersByEmail.get(participant.toLowerCase()) ?? null;
  }
  return participant;
}

/** Normalize a participant list to UIDs (+ system IDs). Drops unresolved emails. */
export function normalizeParticipantList(
  participants: string[],
  users: Array<{ uid: string; email?: string | null }>
): string[] {
  const usersByEmail = new Map<string, string>();
  const usersByUid = new Set<string>();
  for (const u of users) {
    usersByUid.add(u.uid);
    if (u.email) usersByEmail.set(u.email.toLowerCase(), u.uid);
  }
  const result = new Set<string>();
  for (const p of participants) {
    const uid = resolveParticipantToUid(p, usersByEmail, usersByUid);
    if (uid) result.add(uid);
  }
  return Array.from(result);
}
