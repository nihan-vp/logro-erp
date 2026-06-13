import crypto from 'crypto';
import { UserRole } from '../../src/types';

export const JWT_SECRET = 'construction_jwt_secret_key_2026';
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_TIME = 15 * 60 * 1000;
export const loginAttempts: Record<string, { attempts: number; lockoutUntil: number }> = {};

export function hashPassword(password: string): string {
  const salt = 'construction_salt_2026';
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha256');
  return hash.toString('hex');
}

export function signToken(payload: { userId: string; role: UserRole; name: string; companyName: string; email: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): { userId: string; role: UserRole; name: string; companyName: string; email: string } | null {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
  } catch (err) {
    return null;
  }
}

export function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

export function requireAdmin(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator permissions required' });
  }
  next();
}

export function requireAdminOrAccountant(req: any, res: any, next: any) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'accountant')) {
    return res.status(403).json({ error: 'Forbidden: Access restricted' });
  }
  next();
}

