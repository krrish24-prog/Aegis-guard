import type { Request, Response, NextFunction } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json';

if (!getApps().length) {
  initializeApp({ projectId: firebaseConfig.projectId });
}

export interface AuthenticatedRequest extends Request {
  firebaseUser?: DecodedIdToken;
}

export async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: missing Bearer token' });
    return;
  }
  try {
    const token = authHeader.slice(7);
    req.firebaseUser = await getAuth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
}
