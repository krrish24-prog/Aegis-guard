import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';
import { 
  getFirestore, 
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
  getDocFromServer,
  initializeFirestore
} from 'firebase/firestore';
import firebaseConfigRaw from '../firebase-applet-config.json';

// Provide a fallback empty config to prevent hard crashes if json is empty
const firebaseConfig = {
  projectId: firebaseConfigRaw.projectId || 'demo-project',
  appId: firebaseConfigRaw.appId || '1:1234567890:web:abcdef',
  apiKey: firebaseConfigRaw.apiKey || 'fake-api-key',
  authDomain: firebaseConfigRaw.authDomain || 'demo.firebaseapp.com',
  firestoreDatabaseId: firebaseConfigRaw.firestoreDatabaseId || '',
  storageBucket: firebaseConfigRaw.storageBucket || 'demo.appspot.com',
  messagingSenderId: firebaseConfigRaw.messagingSenderId || '123456789',
  measurementId: firebaseConfigRaw.measurementId || ''
};

const app = initializeApp(firebaseConfig);
export { app };
export const auth = getAuth(app);

// Use the existing AI Studio Firestore database so free-tier projects do not need to create `(default)`.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || undefined);


export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

/**
 * Turns a Firestore SDK error into something a user can act on. The free plan
 * reports "Quota exceeded." for both reads and writes, which used to be shown
 * as if the security rules were wrong.
 */
export function describeFirestoreError(error: unknown): string {
  const err = error as { code?: string; message?: string } | null;
  const code = err?.code || '';
  const message = err?.message || (error instanceof Error ? error.message : String(error));

  if (code === 'resource-exhausted' || /quota/i.test(message)) {
    return 'Firestore daily quota reached. The free plan allows 50,000 reads and 20,000 writes per day per project and resets at midnight Pacific time. Media files are stored in Backblaze B2, so only small records count; upgrading the Firebase project to the Blaze plan removes the daily cap.';
  }
  if (code === 'permission-denied') {
    return 'Firestore denied this request. Deploy the latest security rules with "firebase deploy --only firestore:rules", then try again.';
  }
  if (code === 'unavailable') {
    return 'Could not reach Firestore. Check the internet connection and try again.';
  }
  if (code === 'failed-precondition') {
    return 'Firestore needs an index for this query. Deploy firestore.indexes.json or wait for the index build to finish.';
  }
  return message;
}
