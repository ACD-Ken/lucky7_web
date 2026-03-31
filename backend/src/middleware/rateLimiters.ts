import rateLimit from 'express-rate-limit';
import { Request } from 'express';

interface AuthRequest extends Request {
  user?: { id: string };
}

// Key by authenticated user ID; fall back to IP for unauthenticated requests
const userKey = (req: AuthRequest) => req.user?.id || req.ip || 'unknown';

// POST /api/users/login — 10 attempts per 15 min per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// POST /api/users/register — 5 attempts per 15 min per IP
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again in 15 minutes.' },
});

// POST /api/predictions/generate — 3 per day per USER
export const predictionsLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  keyGenerator: userKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Daily limit reached. You can generate predictions 3 times per day.' },
});

// POST /api/draws/fetch — 5 calls per hour per IP
export const fetchDrawLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many fetch requests. Try again in 1 hour.' },
});

// GET /api/draws/* — 60 per 15 min per IP (was 120)
export const publicDrawsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.' },
});

// GET /api/agents/status — 3 per min per USER (was 10 per IP)
export const agentStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  keyGenerator: userKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many status requests. Try again in a minute.' },
});

// POST /api/chat/* — 15 per 15 min per USER (was 20 per IP)
export const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: userKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat messages. Try again in 15 minutes.' },
});

// All /api/* baseline — 150 per 15 min per IP (was 200)
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.' },
});

// POST /api/predictions/email, /api/4d/email — 3 per hour per USER
export const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: userKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Email limit reached. You can send 3 emails per hour.' },
});

// ── Per-email login lockout (brute-force protection) ──────────────────────────
// Tracks failed login attempts per email address in memory.
// Locks the email for 15 min after 5 consecutive failures.
// In-memory is sufficient for a single-instance Railway deployment.

interface LockoutRecord { count: number; lockedUntil: number }
const emailAttempts = new Map<string, LockoutRecord>();

export function checkEmailLockout(email: string): { locked: boolean; retryAfterSecs?: number } {
  const record = emailAttempts.get(email.toLowerCase());
  if (!record || Date.now() >= record.lockedUntil) return { locked: false };
  return { locked: true, retryAfterSecs: Math.ceil((record.lockedUntil - Date.now()) / 1000) };
}

export function recordFailedLogin(email: string): void {
  const key = email.toLowerCase();
  const record = emailAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  record.count++;
  if (record.count >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000;
    record.count = 0; // reset counter so next window starts fresh after lockout
  }
  emailAttempts.set(key, record);
}

export function clearEmailLockout(email: string): void {
  emailAttempts.delete(email.toLowerCase());
}
