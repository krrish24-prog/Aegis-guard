import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
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
import { getStorage } from 'firebase/storage';
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
export const storage = getStorage(app);

// Use initializeFirestore with long polling to bypass potential proxy/websocket issues
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || undefined);
export const googleProvider = new GoogleAuthProvider();

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
