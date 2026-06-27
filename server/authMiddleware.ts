import type { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import firebaseConfig from '../firebase-applet-config.json';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: firebaseConfig.projectId });
}

export interface AuthenticatedRequest extends Request {
  firebaseUser?: admin.auth.DecodedIdToken;
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
    req.firebaseUser = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
}
