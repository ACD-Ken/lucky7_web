import { Router, Request, Response, CookieOptions } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { deriveProfileWithAI } from '../agents/profile';
import { requireAuth, AuthRequest, invalidateTokenVersionCache } from '../middleware/auth';
import { registerLimiter, loginLimiter, checkEmailLockout, recordFailedLogin, clearEmailLockout } from '../middleware/rateLimiters';
import supabaseAdmin, { supabaseForUser } from '../services/supabase';
import { logAuthLogin, logAuthLoginFailed, logAuthLoginLocked, logAuthRegister, logAuthLogout, logAuthTokenRevoked } from '../services/logger';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.APP_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

function signToken(id: string, email: string, version: number): string {
  // `sub` mirrors the user id so Supabase RLS policies using auth.uid() work
  // when this JWT is passed to a user-scoped Supabase client.
  // `iat` is included explicitly (jsonwebtoken adds it by default, but explicit is clearer).
  return jwt.sign({ sub: id, id, email, version, iat: Math.floor(Date.now() / 1000) }, getJwtSecret(), { expiresIn: '7d' });
}

const TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const router = Router();

const RegisterSchema = z.object({
  name:      z.string().min(1).max(100),
  email:     z.string().email(),
  dob: z.string()
    .regex(/^\d{4}\/\d{2}\/\d{2}$/, 'Date must be YYYY/MM/DD')
    .refine(d => {
      const [y, m, day] = d.split('/').map(Number);
      const date = new Date(y, m - 1, day);
      return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === day
        && y >= 1900 && y <= new Date().getFullYear();
    }, 'Invalid date of birth'),
  birthTime: z.string()
    .regex(/^\d{2}:\d{2}$/, 'Birth time must be HH:MM (24h format)')
    .refine(t => {
      const [h, m] = t.split(':').map(Number);
      return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    }, 'Birth time must be between 00:00 and 23:59'),
  gender:    z.enum(['M', 'F']),
});

const LoginSchema = z.object({
  email: z.string().email(),
  dob: z.string()
    .regex(/^\d{4}\/\d{2}\/\d{2}$/, 'Date must be YYYY/MM/DD')
    .refine(d => {
      const [y, m, day] = d.split('/').map(Number);
      const date = new Date(y, m - 1, day);
      return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === day
        && y >= 1900 && y <= new Date().getFullYear();
    }, 'Invalid date of birth'),
});

// POST /api/users/register — rate limited: 5 per 15 min
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  try {
    const body = RegisterSchema.parse(req.body);

    // Reject if email already exists — do NOT issue a token without DOB verification
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', body.email)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: 'Email already registered. Use POST /api/users/login with your date of birth.',
      });
    }

    // Derive BaZi profile using AI (falls back to deterministic if API key missing)
    const baziProfile = await deriveProfileWithAI(body.dob, body.gender, body.name, body.birthTime);

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert({
        name:              body.name,
        email:             body.email,
        dob:               body.dob,
        birth_time:        body.birthTime,
        gender:            body.gender,
        bazi_profile_json: baziProfile,
      })
      .select()
      .single();

    if (error) throw error;

    const tokenVersion: number = user.token_version ?? 0;
    const token = signToken(user.id, user.email, tokenVersion);
    res.cookie('token', token, TOKEN_COOKIE_OPTIONS);
    logAuthRegister(user.id, user.email, req.ip);
    return res.status(201).json({
      user:       { ...user, baziProfileJson: user.bazi_profile_json },
      baziProfile,
      token,       // kept for React Native mobile client
      isNew:      true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/users/login — rate limited: 10 per 15 min
// DOB acts as the credential — verifies the caller knows the account's date of birth
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, dob } = LoginSchema.parse(req.body);

    // Per-email lockout — blocks brute-force of DOB (36,500 combinations)
    const lockout = checkEmailLockout(email);
    if (lockout.locked) {
      logAuthLoginLocked(email, req.ip, lockout.retryAfterSecs!);
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${lockout.retryAfterSecs} seconds.`,
      });
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    // Use a constant-time comparison message to avoid leaking whether the email exists
    if (!user || user.dob !== dob) {
      recordFailedLogin(email);
      logAuthLoginFailed(email, req.ip, 'invalid_dob');
      return res.status(401).json({ error: 'Invalid email or date of birth' });
    }

    clearEmailLockout(email); // reset on successful login

    const tokenVersion: number = user.token_version ?? 0;
    const token = signToken(user.id, user.email, tokenVersion);
    res.cookie('token', token, TOKEN_COOKIE_OPTIONS);
    logAuthLogin(user.id, user.email, req.ip);
    return res.json({
      user:  { ...user, baziProfileJson: user.bazi_profile_json },
      token,  // kept for React Native mobile client
      isNew: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/users/profile
router.get('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Use user-scoped client so RLS enforces row ownership at the DB level
    const { data: user, error } = await supabaseForUser(req.token!)
      .from('users')
      .select('*')
      .eq('id', req.user!.id)
      .single();

    if (error || !user) return res.status(404).json({ error: 'User not found' });
    return res.json({ ...user, baziProfileJson: user.bazi_profile_json });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

const UpdateProfileSchema = z.object({
  fcmToken: z.string().min(100).max(300).regex(/^[A-Za-z0-9:_\-]+$/, 'Invalid FCM token format').optional(),
  name:     z.string().min(1).max(100).optional(),
}).refine(data => data.fcmToken !== undefined || data.name !== undefined, {
  message: 'At least one of fcmToken or name must be provided',
});

// PUT /api/users/profile
router.put('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { fcmToken, name } = UpdateProfileSchema.parse(req.body);
    const updates: Record<string, string> = {};
    if (fcmToken) updates.fcm_token = fcmToken;
    if (name)     updates.name      = name;

    const { data: user, error } = await supabaseForUser(req.token!)
      .from('users')
      .update(updates)
      .eq('id', req.user!.id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ ...user, baziProfileJson: user.bazi_profile_json });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: error.errors });
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

const FavoriteNumbersSchema = z.object({
  numbers: z.array(z.number().int().min(1).max(49)).length(12),
});

// PUT /api/users/favorite-numbers
router.put('/favorite-numbers', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { numbers } = FavoriteNumbersSchema.parse(req.body);

    const { data: user, error } = await supabaseForUser(req.token!)
      .from('users')
      .update({ favorite_numbers: numbers })
      .eq('id', req.user!.id)
      .select('id, favorite_numbers')
      .single();

    if (error) throw error;
    return res.json({ favoriteNumbers: user.favorite_numbers });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to update favorite numbers' });
  }
});

// POST /api/users/logout — revoke token + clear auth cookie
router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    // Increment token_version — all existing tokens for this user are now invalid
    await supabaseAdmin.rpc('increment_token_version', { user_id: userId });
    invalidateTokenVersionCache(userId); // immediate local effect
    logAuthTokenRevoked(userId, req.ip);
  } catch {
    // Non-fatal: still clear the cookie even if DB update fails
    logAuthLogout(req.user!.id, req.ip);
  }
  res.clearCookie('token', TOKEN_COOKIE_OPTIONS);
  res.json({ success: true });
});

export default router;
