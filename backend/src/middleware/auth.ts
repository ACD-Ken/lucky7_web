import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import supabaseAdmin from '../services/supabase';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; version: number };
  token?: string; // raw JWT — pass to supabaseForUser() for RLS-scoped queries
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.APP_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return secret;
}

function extractToken(req: Request): string | undefined {
  // 1. httpOnly cookie (web app)
  const cookieToken = (req as any).cookies?.token;
  if (cookieToken) return cookieToken;
  // 2. Authorization Bearer header (React Native mobile app)
  return req.headers.authorization?.replace('Bearer ', '');
}

// ── Token version cache ───────────────────────────────────────────────────────
// Avoids a DB lookup on every request while still supporting revocation.
// A revoked token is detected within CACHE_TTL_MS at most.
// Call invalidateTokenVersionCache(userId) on logout for immediate effect.

interface CacheEntry { version: number; cachedAt: number }
const tokenVersionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000; // 15s — logout calls invalidateTokenVersionCache() for immediate effect; this covers edge cases only

export function invalidateTokenVersionCache(userId: string): void {
  tokenVersionCache.delete(userId);
}

export async function getStoredTokenVersion(userId: string): Promise<number> {
  const cached = tokenVersionCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.version;

  const { data } = await supabaseAdmin
    .from('users')
    .select('token_version')
    .eq('id', userId)
    .single();

  const version = data?.token_version ?? 0;
  tokenVersionCache.set(userId, { version, cachedAt: Date.now() });
  return version;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { id: string; email: string; version?: number };

    // Token version check — detects revoked tokens (e.g., after logout)
    const storedVersion = await getStoredTokenVersion(payload.id);
    const tokenVersion = payload.version ?? 0;
    if (tokenVersion !== storedVersion) {
      res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
      return;
    }

    req.user  = { id: payload.id, email: payload.email, version: tokenVersion };
    req.token = token;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { id: string; email: string; version?: number };
      req.user = { id: payload.id, email: payload.email, version: payload.version ?? 0 };
    } catch {
      // Optional — ignore invalid tokens
    }
  }
  next();
}
