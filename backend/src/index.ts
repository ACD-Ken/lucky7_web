import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cron from 'node-cron';
import jwt from 'jsonwebtoken';
import { generalLimiter, agentStatusLimiter } from './middleware/rateLimiters';
import { requireAuth, AuthRequest, getStoredTokenVersion } from './middleware/auth';

import usersRouter from './routes/users';
import drawsRouter from './routes/draws';
import predictionsRouter from './routes/predictions';
import chatRouter from './routes/chat';
import agenticChatRouter from './routes/chatAgentic';
import analyticsRouter from './routes/analytics';
import fourDRouter from './routes/fourD';

import { chatWithAI, ChatMessage } from './agents/chat';
import { scrapeLatestDraw } from './services/scraper';
import { BaziProfile } from './types';
import { healthCheck } from './agents/orchestrator';
import supabaseAdmin from './services/supabase';

dotenv.config();

// ─── Startup Environment Validation ────────────────────────────────────────
// Support alternate env var names used by Railway
if (!process.env.JWT_SECRET && process.env.APP_SECRET) process.env.JWT_SECRET = process.env.APP_SECRET;
if (!process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REQUIRED_ENV = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
if ((process.env.JWT_SECRET || '').length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET!;
}

const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy
const httpServer = createServer(app);
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map(o => o.trim());

if (process.env.NODE_ENV === 'production') {
  const insecure = allowedOrigins.filter(o => !o.startsWith('https://'));
  if (insecure.length > 0) {
    console.error(`❌ Insecure HTTP origins in ALLOWED_ORIGINS (production requires HTTPS): ${insecure.join(', ')}`);
    process.exit(1);
  }
}

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  frameguard:      { action: 'deny' },
  referrerPolicy:  { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false, // not needed for a JSON API
}));
app.use(cors({
  origin: (origin, callback) => {
    // No origin = native mobile client (React Native, curl) — not subject to CORS.
    // Pass through without setting CORS headers; JWT still required by auth middleware.
    if (!origin) return callback(null, false);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ['GET', 'POST', 'PUT'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(cookieParser());
app.use(morgan('combined'));
app.use(express.json({ limit: '512kb' }));

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/api', generalLimiter);

app.use('/api/users', usersRouter);
app.use('/api/draws', drawsRouter);
app.use('/api/predictions', predictionsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/chat/agentic', agenticChatRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/4d', fourDRouter);

// Agent status — rate-limited + auth-required (calls Anthropic on every request)
app.get('/api/agents/status', agentStatusLimiter, requireAuth as any, async (req: AuthRequest, res: any) => {
  try {
    const status = await healthCheck();
    res.json({ status: 'ok', agents: status, timestamp: new Date().toISOString() });
  } catch {
    res.status(500).json({ error: 'Status check failed' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.1.0', routes: ['predictions/generate', 'predictions/email'] }));
app.get('/ping', (req, res) => res.json({ pong: true, ts: Date.now() }));

// ─── WebSocket Chat Server ──────────────────────────────────────────────────
// Auth is performed via the first message frame, NOT the URL query string.
// Tokens in URLs appear in server access logs (morgan), proxy logs, and
// browser history — keeping them out of the URL prevents accidental exposure.
//
// Handshake protocol:
//   1. Client connects to ws://host/ws/chat  (no token in URL)
//   2. Client immediately sends: { type: "auth", token: "<jwt>" }
//   3. Server validates JWT → replies { type: "auth_ok" } or closes with 4001
//   4. Client sends: { type: "init", profile: {...}, predictions: [...] }
//   5. Client sends: { type: "message", content: "..." }

const WS_MAX_MSG_BYTES     = 16 * 1024; // 16 KB per message
const WS_RATE_WINDOW_MS    = 60_000;   // 1-minute sliding window
const WS_RATE_MAX_MSGS     = 15;       // Max chat messages per minute per connection
const WS_MAX_CONTENT_CHARS = 2000;    // Mirror REST chat limit
const WS_AUTH_TIMEOUT_MS = 10_000;    // Close if auth not received within 10 s

const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat' });

wss.on('connection', (ws: WebSocket) => {
  console.log('WebSocket client connected — awaiting auth');

  let isAuthenticated = false;
  let wsToken = '';
  let wsTokenExp = 0;     // JWT exp claim in ms (token expiry timestamp)
  let wsUserId = '';
  let wsTokenVersion = 0; // JWT version claim — re-checked per message for revocation
  const conversationHistory: ChatMessage[] = [];
  let userProfile: BaziProfile | null = null;
  let latestPredictions: any[] = [];
  // Per-connection sliding-window rate limiter
  const msgTimestamps: number[] = [];

  // Auto-close if client never sends auth within the timeout
  const authTimeout = setTimeout(() => {
    if (!isAuthenticated) {
      ws.close(4001, 'Authentication timeout');
    }
  }, WS_AUTH_TIMEOUT_MS);

  ws.on('message', async (raw: Buffer) => {
    // Enforce message size limit
    if (raw.length > WS_MAX_MSG_BYTES) {
      ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
      return;
    }

    try {
      const msg = JSON.parse(raw.toString());

      // Validate message structure
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        return;
      }

      // ── Auth frame — must be first ────────────────────────────────────────
      if (msg.type === 'auth') {
        const token = typeof msg.token === 'string' ? msg.token : '';
        if (!token) {
          ws.close(4001, 'Authentication required');
          return;
        }
        try {
          const payload = jwt.verify(token, getJwtSecret()) as { id?: string; exp?: number; version?: number };
          isAuthenticated = true;
          wsToken = token;
          wsTokenExp = (payload.exp ?? 0) * 1000; // convert to ms
          wsUserId = payload.id ?? '';
          wsTokenVersion = payload.version ?? 0;
          clearTimeout(authTimeout);
          ws.send(JSON.stringify({ type: 'auth_ok' }));
          console.log('WebSocket client authenticated');
        } catch {
          ws.close(4001, 'Invalid or expired token');
        }
        return;
      }

      // ── All subsequent frames require a valid auth ────────────────────────
      if (!isAuthenticated) {
        ws.close(4001, 'Authentication required');
        return;
      }

      if (msg.type === 'init') {
        if (msg.profile && typeof msg.profile === 'object') {
          userProfile = msg.profile as BaziProfile;
        }
        latestPredictions = Array.isArray(msg.predictions) ? msg.predictions.slice(0, 10) : [];
        ws.send(JSON.stringify({ type: 'ready', message: 'Connected to Lucky7 AI Chat' }));
        return;
      }

      if (msg.type === 'message') {
        // Re-validate token expiry on every chat message
        if (Date.now() >= wsTokenExp) {
          ws.close(4001, 'Token expired');
          return;
        }

        // Re-check token version — detects revoked tokens (e.g. logout from another device)
        if (wsUserId) {
          const storedVersion = await getStoredTokenVersion(wsUserId);
          if (wsTokenVersion !== storedVersion) {
            ws.close(4001, 'Token has been revoked. Please log in again.');
            return;
          }
        }

        // Sliding-window rate limit: max 15 chat messages per minute
        const now = Date.now();
        while (msgTimestamps.length && msgTimestamps[0] < now - WS_RATE_WINDOW_MS) msgTimestamps.shift();
        if (msgTimestamps.length >= WS_RATE_MAX_MSGS) {
          ws.send(JSON.stringify({ type: 'error', message: 'Too many messages. Try again in a minute.' }));
          return;
        }
        msgTimestamps.push(now);
        if (!userProfile) {
          ws.send(JSON.stringify({ type: 'error', message: 'Send init first' }));
          return;
        }
        const content = typeof msg.content === 'string'
          ? msg.content.trim().slice(0, WS_MAX_CONTENT_CHARS)
          : '';
        if (!content) {
          ws.send(JSON.stringify({ type: 'error', message: 'Empty message' }));
          return;
        }
        conversationHistory.push({ role: 'user', content });
        await chatWithAI(content, conversationHistory, userProfile, latestPredictions, ws);
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    console.log('WebSocket client disconnected');
  });
  ws.on('error', err => console.error('WebSocket error:', err.message));
});

// ─── Cron Jobs ─────────────────────────────────────────────────────────────

// Data Fetch: Every Monday and Thursday at 21:35 SGT (13:35 UTC)
cron.schedule('35 13 * * 1,4', async () => {
  console.log('[CRON] Fetching latest TOTO draw...');
  try {
    const result = await scrapeLatestDraw();
    if (!result) return;

    await supabaseAdmin.from('draws').upsert({
      draw_no:           result.drawNo,
      date:              result.drawDate,
      draw_date:         result.drawDate,
      winning_numbers:   result.winningNumbers.join(' '),
      win_nums:          result.winningNumbers,
      additional_number: String(result.additionalNumber),
      add_num:           result.additionalNumber,
      fetched_at:        new Date().toISOString(),
    }, { onConflict: 'draw_no' });

    console.log('[CRON] Draw saved:', result.drawNo);
  } catch (err) {
    console.error('[CRON] Draw fetch failed:', (err as Error).message);
  }
}, { timezone: 'Asia/Singapore' });

// ─── Start Server ──────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🎰 Lucky7 Backend running on port ${PORT}`);
  console.log(`📡 WebSocket chat: ws://localhost:${PORT}/ws/chat  (send {type:"auth",token:"<jwt>"} as first message)`);
});

export default app;
