import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from './db.js';
import { User } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'insecure-dev-secret';
const JWT_ACCESS_MINUTES = parseInt(process.env.JWT_ACCESS_MINUTES || '15', 10);
const JWT_REFRESH_DAYS = parseInt(process.env.JWT_REFRESH_DAYS || '7', 10);

export function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createAccessToken(userId: string, role: string): string {
  const payload = {
    sub: userId,
    role: role,
    type: 'access',
  };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: `${JWT_ACCESS_MINUTES}m`,
  });
}

export function createRefreshToken(userId: string): string {
  const payload = {
    sub: userId,
    type: 'refresh',
  };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: `${JWT_REFRESH_DAYS}d`,
  });
}

export function decodeToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function findUserById(userId: string): User | undefined {
  return db.users.find(u => u.id === userId && u.isActive);
}
