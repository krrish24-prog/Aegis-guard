import { db } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
/** Shape for user data fetched from users_public collection, used locally. */
interface PublicUserData {
  uid?: string;
  email?: string;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  publicKey?: string;
  [key: string]: unknown;
}

/** Email addresses fetched from Google People API, keyed by email → display name. */
interface GoogleContactEntry {
  email: string;
  displayName: string;
}

const PEOPLE_API_URL =
  "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=1000";

/**
 * Fetch the current user's Google Contacts via the People API.
 * Returns an array of { email, displayName } for every contact that has
 * at least one email address.
 */
async function fetchGoogleContacts(
  accessToken: string
): Promise<GoogleContactEntry[]> {
  try {
    const res = await fetch(PEOPLE_API_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.warn(
        `Google People API returned ${res.status} — contacts sync skipped.`
      );
      return [];
    }

    const data = await res.json();
    const connections: any[] = data.connections ?? [];

    const contacts: GoogleContactEntry[] = [];

    for (const person of connections) {
      const emails = person.emailAddresses ?? [];
      const names = person.names ?? [];
      const displayName =
        names.length > 0
          ? names[0].displayName || names[0].givenName || "Unknown"
          : "Unknown";

      for (const e of emails) {
        const email = (e.value || "").trim().toLowerCase();
        if (email) {
          contacts.push({ email, displayName });
        }
      }
    }

    return contacts;
  } catch (error) {
    console.warn("Failed to fetch Google Contacts:", error);
    return [];
  }
}

/**
 * Persist a sync timestamp so we do not re-sync every page load.
 */
function getLastSyncKey(uid: string): string {
  return `aegis_gcontact_sync_${uid}`;
}

function shouldSync(uid: string): boolean {
  const last = localStorage.getItem(getLastSyncKey(uid));
  if (!last) return true;
  // Re-sync every 24 hours
  return Date.now() - Number(last) > 24 * 60 * 60 * 1000;
}

function markSynced(uid: string) {
  localStorage.setItem(getLastSyncKey(uid), String(Date.now()));
}

/**
 * Core sync function:
 * 1. Fetch the user's Google Contacts via People API
 * 2. Cross-reference with `users_public` collection
 * 3. Auto-add matched users as contacts in `users/{uid}/contacts`
 * 4. Also reciprocally add the current user to the matched user's contacts
 */
export async function syncGoogleContacts(
  uid: string,
  accessToken: string
): Promise<{ synced: number; total: number }> {
  if (!accessToken) return { synced: 0, total: 0 };

  // Rate-limit: only sync once per 24h
  if (!shouldSync(uid)) {
    console.log("[GContact] Sync skipped — already synced within 24h");
    return { synced: 0, total: 0 };
  }

  // 1. Fetch contacts from Google
  const googleContacts = await fetchGoogleContacts(accessToken);
  if (googleContacts.length === 0) {
    console.log("[GContact] No Google Contacts found");
    markSynced(uid); // mark anyway so we don't retry every load
    return { synced: 0, total: 0 };
  }

  // 2. Get all registered app users — filter out empty emails client-side
  const publicSnap = await getDocs(collection(db, "users_public"));
  const registeredByEmail = new Map<string, string>(); // email → uid
  const registeredProfiles = new Map<string, PublicUserData>(); // uid → profile data

  for (const d of publicSnap.docs) {
    const data = d.data() as PublicUserData;
    const email = (data.email || "").toLowerCase().trim();
    if (email) {
      registeredByEmail.set(email, d.id);
      registeredProfiles.set(d.id, data);
    }
  }

  // 3. Cross-reference: which Google contacts are also registered on the app?
  const matchedContacts: GoogleContactEntry[] = [];

  for (const gc of googleContacts) {
    if (registeredByEmail.has(gc.email)) {
      matchedContacts.push(gc);
    }
  }

  if (matchedContacts.length === 0) {
    console.log("[GContact] No Google Contacts are registered on Aegis");
    markSynced(uid);
    return { synced: 0, total: googleContacts.length };
  }

  // 4. Auto-save matched contacts
  let syncedCount = 0;

  for (const mc of matchedContacts) {
    const targetUid = registeredByEmail.get(mc.email);
    if (!targetUid) continue;

    // Skip if the matched contact is the current user
    if (targetUid === uid) continue;

    // Check if already a contact
    const existingContact = await getDoc(
      doc(db, "users", uid, "contacts", targetUid)
    );
    if (existingContact.exists()) continue;

    const targetProfile = registeredProfiles.get(targetUid);
    if (!targetProfile) continue;

    // Save contact for current user
    await setDoc(doc(db, "users", uid, "contacts", targetUid), {
      uid: targetUid,
      displayName: targetProfile.displayName || mc.displayName || "Unknown",
      email: mc.email,
      phoneNumber: targetProfile.phoneNumber || "",
      photoURL: targetProfile.photoURL || "",
      publicKey: targetProfile.publicKey || "",
      createdAt: serverTimestamp(),
      source: "google_contacts",
    });

    // Reciprocally add current user to the matched user's contacts
    const currentUserDoc = await getDoc(doc(db, "users_public", uid));
    if (currentUserDoc.exists()) {
      const cu = currentUserDoc.data();
      const reciprocalRef = doc(db, "users", targetUid, "contacts", uid);
      const reciprocalExisting = await getDoc(reciprocalRef);
      if (!reciprocalExisting.exists()) {
        await setDoc(reciprocalRef, {
          uid,
          displayName: cu.displayName || "Unknown",
          email: cu.email || "",
          phoneNumber: cu.phoneNumber || "",
          photoURL: cu.photoURL || "",
          publicKey: cu.publicKey || "",
          createdAt: serverTimestamp(),
          source: "google_contacts_auto",
        });
      }
    }

    syncedCount++;
  }

  markSynced(uid);
  console.log(
    `[GContact] Synced ${syncedCount}/${matchedContacts.length} contacts from Google`
  );
  return { synced: matchedContacts.length, total: googleContacts.length };
}

/**
 * For non-Google auth methods (email/password), we scan all registered
 * users and check if any have this user in THEIR Google-synced contacts.
 * Simpler approach: auto-add any user who has already added the current
 * user as a contact (reciprocal discovery).
 */
export async function syncReciprocalContacts(
  uid: string,
  email: string
): Promise<number> {
  if (!email) return 0;

  const emailLower = email.toLowerCase().trim();

  // Find all users who have this user's email saved as a contact
  // We do this by checking if any contact documents reference this user
  const publicSnap = await getDocs(collection(db, "users_public"));
  let syncedCount = 0;

  for (const d of publicSnap.docs) {
    const otherUid = d.id;
    if (otherUid === uid) continue;

    // Check if this other user has us in their contacts
    const theirContactRef = doc(db, "users", otherUid, "contacts", uid);
    const theirContactSnap = await getDoc(theirContactRef);

    if (theirContactSnap.exists()) {
      // They have us — we should have them too
      const ourContactRef = doc(db, "users", uid, "contacts", otherUid);
      const ourContactSnap = await getDoc(ourContactRef);
      if (!ourContactSnap.exists()) {
        const otherData = d.data();
        await setDoc(ourContactRef, {
          uid: otherUid,
          displayName: otherData.displayName || "Unknown",
          email: otherData.email || "",
          phoneNumber: otherData.phoneNumber || "",
          photoURL: otherData.photoURL || "",
          publicKey: otherData.publicKey || "",
          createdAt: serverTimestamp(),
          source: "reciprocal_auto",
        });
        syncedCount++;
      }
    }
  }

  if (syncedCount > 0) {
    console.log(`[GContact] Synced ${syncedCount} reciprocal contacts`);
  }
  return syncedCount;
}
