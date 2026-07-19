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
  if (!email) return 0;

  // Get all registered users
  const publicSnap = await getDocs(collection(db, "users_public"));
  let syncedCount = 0;

  for (const d of publicSnap.docs) {
    const otherUid = d.id;
    if (otherUid === uid) continue;

    // Check if this other user has us in their contacts
    const theirContactRef = doc(db, "users", otherUid, "contacts", uid);
    const theirContactSnap = await getDoc(theirContactRef);

    if (theirContactSnap.exists()) {
      // They have us — we should have them too (if not already)
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
    console.log(`[ContactSync] Synced ${syncedCount} reciprocal contacts`);
  }
  return syncedCount;
}
