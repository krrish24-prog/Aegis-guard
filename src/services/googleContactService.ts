import { db } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

/** Shape for user data fetched from users_public collection. */
interface PublicUserData {
  uid?: string;
  email?: string;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  publicKey?: string;
  [key: string]: unknown;
}

/**
 * Scans all registered users and checks if any have the current user
 * in THEIR contacts. If so, automatically adds them to the current
 * user's contact list (reciprocal discovery).
 *
 * This works for ALL auth methods (Google sign-in, email/password, etc.)
 * without needing any Google API scopes.
 */
export async function syncReciprocalContacts(
  uid: string,
  email: string
): Promise<number> {
  const emailKey = (email || '').toLowerCase();
  const publicSnap = await getDocs(collection(db, "users_public"));
  let syncedCount = 0;

  for (const d of publicSnap.docs) {
    const otherUid = d.id;
    if (otherUid === uid) continue;

    const otherData = d.data();
    const theirUidContact = await getDoc(doc(db, "users", otherUid, "contacts", uid));
    const theirEmailContact = emailKey
      ? await getDoc(doc(db, "users", otherUid, "contacts", emailKey))
      : null;

    if (theirUidContact.exists() || theirEmailContact?.exists()) {
      const ourContactRef = doc(db, "users", uid, "contacts", otherUid);
      const ourContactSnap = await getDoc(ourContactRef);
      if (!ourContactSnap.exists()) {
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

  return syncedCount;
}
