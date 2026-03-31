# Lucky7 Backend — API Reference

Node.js + Express + TypeScript REST API and WebSocket server.

- **Base URL (production):** `https://lucky7-backend-production.up.railway.app`
- **Base URL (local):** `http://localhost:3000`
- **WebSocket:** `ws://localhost:3000/ws/chat`

---

## Authentication

All protected routes require a `Bearer` JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are obtained from `POST /api/users/register` or `POST /api/users/login`.
Tokens expire after **7 days**.

### WebSocket Auth Handshake

WebSocket connections do **not** accept tokens in the URL. After connecting, send an `auth` frame within 10 seconds or the server will close the connection:

```json
{ "type": "auth", "token": "<jwt>" }
```

Server responds with:
```json
{ "type": "auth_ok" }
```

Subsequent messages use the normal `init` / `message` types.

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| `POST /api/users/register` | 5 requests / 15 min |
| `POST /api/users/login` | 10 requests / 15 min |
| `POST /api/predictions/generate` | 10 requests / 15 min |
| `POST /api/chat/message` | 20 requests / 15 min |
| `POST /api/draws/fetch` | 30 requests / 15 min |

All limits are per IP. Exceeded requests receive `429 Too Many Requests`.

---

## Endpoints

### Health

#### `GET /health`
Server liveness check. No auth required.

**Response `200`**
```json
{ "status": "ok", "timestamp": "2026-03-06T10:00:00.000Z" }
```

---

### Users — `/api/users`

#### `POST /api/users/register`
Create a new account and generate a BaZi profile via AI.

**Body**
```json
{
  "name":   "Ken Wong",
  "email":  "ken@example.com",
  "dob":    "1990/03/15",
  "gender": "M"
}
```

| Field | Type | Rules |
|---|---|---|
| `name` | string | 1–100 chars |
| `email` | string | valid email |
| `dob` | string | `YYYY/MM/DD` |
| `gender` | string | `"M"` or `"F"` |

**Response `200`** — new user
```json
{
  "user": { "id": "uuid", "name": "Ken", "email": "ken@example.com", ... },
  "token": "<jwt>",
  "isNew": true
}
```

**Response `409`** — email already registered
```json
{ "error": "Email already registered. Use POST /api/users/login with your date of birth." }
```

---

#### `POST /api/users/login`
Authenticate an existing user using email + date of birth.

**Body**
```json
{
  "email": "ken@example.com",
  "dob":   "1990/03/15"
}
```

**Response `200`**
```json
{
  "user": { "id": "uuid", "name": "Ken", ... },
  "token": "<jwt>",
  "isNew": false
}
```

**Response `401`**
```json
{ "error": "Invalid email or date of birth" }
```

---

#### `GET /api/users/:userId` 🔒
Fetch a user's profile.

**Response `200`**
```json
{ "id": "uuid", "name": "Ken", "email": "...", "baziProfileJson": { ... } }
```

---

#### `PUT /api/users/:userId` 🔒
Update FCM push token or display name.

**Body** (at least one field required)
```json
{
  "fcmToken": "fXm9a...",
  "name": "Kenneth"
}
```

| Field | Type | Rules |
|---|---|---|
| `fcmToken` | string | 100–300 chars, alphanumeric + `:_-` |
| `name` | string | 1–100 chars |

---

### Predictions — `/api/predictions`

#### `POST /api/predictions/generate` 🔒
Generate lottery number predictions for all 6 strategies.

**Body** (optional)
```json
{ "drawDate": "2026-03-10" }
```

If `drawDate` is omitted, the next upcoming draw date is used.

**Response `200`**
```json
{
  "strategies": [
    { "strategy": "bazi", "numbers": [3, 12, 21, 33, 41, 47], "confidence": 0.72 },
    { "strategy": "frequency", "numbers": [...], "confidence": 0.65 },
    { "strategy": "gap", "numbers": [...], "confidence": 0.61 },
    { "strategy": "numerology", "numbers": [...], "confidence": 0.68 },
    { "strategy": "lunar", "numbers": [...], "confidence": 0.59 },
    { "strategy": "hybrid", "numbers": [...], "confidence": 0.78 }
  ],
  "luckyPool": [3, 7, 12, 21, 25, 33, 38, 41, 44, 47],
  "drawDate": "2026-03-10",
  "generatedAt": "2026-03-06T10:00:00.000Z",
  "drawId": "uuid",
  "savedCount": 6
}
```

---

#### `GET /api/predictions/:userId` 🔒
List all predictions for the authenticated user (`:userId` is ignored — always scoped to the token owner).

**Response `200`** — array of prediction objects with nested draw and match data.

---

### Analytics — `/api/analytics`

#### `GET /api/analytics/:userId` 🔒
Fetch strategy performance stats and an AI-generated weekly insight report.

The insight is cached per user for **24 hours** — repeated page loads do not incur an Anthropic API call.

**Response `200`**
```json
{
  "stats": [
    {
      "strategy": "bazi",
      "avgMatch": 2.4,
      "maxMatch": 4,
      "totalDraws": 10,
      "trend": "stable"
    }
  ],
  "insight": {
    "bestStrategy": "hybrid",
    "worstStrategy": "gap",
    "report": "...",
    "recommendations": ["...", "...", "..."],
    "generatedAt": "2026-03-06T10:00:00.000Z"
  },
  "userId": "uuid"
}
```

---

#### `POST /api/analytics/score-draw` 🔒
Score the user's predictions against a completed draw. Updates strategy stats.

**Body**
```json
{ "drawId": "uuid" }
```

**Response `200`**
```json
{
  "results": [
    { "strategy": "bazi", "matchCount": 3, "hasAdditional": true }
  ],
  "drawId": "uuid",
  "scoredAt": "2026-03-06T10:00:00.000Z"
}
```

---

#### `POST /api/analytics/backtest` 🔒
Simulate all 6 strategies against historical draws and populate strategy stats.

**Response `200`**
```json
{
  "message": "Backtested all 6 strategies against 42 historical draws",
  "scored": 42
}
```

---

### Draws — `/api/draws`

#### `GET /api/draws/latest`
Latest TOTO draw result and next draw date. No auth required.

**Response `200`**
```json
{
  "draw": {
    "drawNo": "3812",
    "drawDate": "2026-03-02",
    "winningNumbers": [4, 11, 22, 31, 38, 45],
    "additionalNumber": 17
  },
  "nextDrawDate": "2026-03-09T00:00:00.000Z"
}
```

---

#### `GET /api/draws/history`
Last 20 draw results. No auth required.

**Response `200`** — array of draw objects.

---

#### `POST /api/draws/fetch` 🔒
Trigger a scrape of the Singapore Pools website to refresh draw data.

**Response `200`**
```json
{ "message": "Draw data refreshed", "count": 5 }
```

---

### Chat — `/api/chat`

#### `POST /api/chat/message` 🔒
Send a chat message to the AI assistant (REST fallback — prefer WebSocket for streaming).

**Body**
```json
{ "message": "What are my lucky numbers this week?" }
```

**Response `200`**
```json
{ "response": "Based on your BaZi profile...", "intent": "prediction" }
```

---

#### WebSocket `/ws/chat`

Real-time streaming chat. After auth handshake:

**Init context**
```json
{ "type": "init", "userId": "uuid", "baziProfile": { ... } }
```

**Send message**
```json
{ "type": "message", "content": "What does my chart say?" }
```

**Receive streamed tokens**
```json
{ "type": "token", "content": "Based" }
{ "type": "token", "content": " on" }
{ "type": "done" }
```

---

### Notifications — `/api/notifications`

#### `POST /api/notifications/subscribe` 🔒
Register device FCM token for push notifications.

#### `POST /api/notifications/send` 🔒
Send a manual push notification (admin use).

#### `GET /api/notifications/history/:userId` 🔒
Fetch notification history for a user.

---

### Agents — `/api/agents`

#### `GET /api/agents/status`
Health check for all AI agents. Result cached for **60 seconds**.

**Response `200`**
```json
{
  "profile": "healthy",
  "prediction": "healthy",
  "chat": "healthy",
  "results": "healthy",
  "analytics": "healthy",
  "scheduler": "healthy"
}
```

---

## Strategies

| Strategy | Description |
|---|---|
| `bazi` | BaZi Day Master element affinity numbers |
| `frequency` | Most-drawn numbers from recent history |
| `gap` | Numbers overdue based on draw gaps |
| `numerology` | Life path + draw date numerology |
| `lunar` | Lunar calendar + zodiac resonance |
| `hybrid` | Weighted blend of all five strategies |

---

## Cron Jobs

Runs via `node-cron` inside the server process:

| Schedule | Job |
|---|---|
| Every Thursday & Sunday at 21:30 SGT | Fetch latest draw results |
| Every Thursday & Sunday at 21:45 SGT | Send personalised prediction push notifications |

Notifications are sent in parallel batches of 10 users.

---

## Error Responses

All errors follow this shape:

```json
{ "error": "Human-readable message" }
```

Validation errors include a `details` array:

```json
{
  "error": "Validation error",
  "details": [{ "path": ["drawId"], "message": "drawId must be a valid UUID" }]
}
```

| Status | Meaning |
|---|---|
| `400` | Bad request / validation error |
| `401` | Missing or invalid JWT |
| `403` | Authenticated but not authorised |
| `404` | Resource not found |
| `409` | Conflict (e.g. email already registered) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key |
| `SUPABASE_URL` | ✅ | Supabase project REST URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service role key (bypasses RLS) |
| `JWT_SECRET` | ✅ | Signing secret, min 32 chars |
| `DATABASE_URL` | ✅ | PostgreSQL URL for Prisma migrations |
| `FCM_SERVER_KEY` | ✅ | Firebase Cloud Messaging server key |
| `FIREBASE_PROJECT_ID` | ✅ | Firebase project ID |
| `PORT` | — | HTTP port (default: `3000`) |
| `NODE_ENV` | — | `development` or `production` |

All required variables are validated at startup. The server will throw and refuse to start if any are missing.

---

## Project Layout

```
backend/src/
├── index.ts              Express app, WebSocket server, cron jobs
├── agents/
│   ├── analytics.ts      generateWeeklyInsight() — 24h cached
│   ├── chat.ts           streamChatResponse()
│   ├── orchestrator.ts   classifyIntent() — 5min cached, healthCheck() — 60s cached
│   ├── prediction.ts     generatePredictions()
│   ├── profile.ts        deriveProfileWithAI()
│   └── scheduler.ts      Push notification payload builder
├── middleware/
│   ├── auth.ts           requireAuth JWT middleware
│   └── rateLimiters.ts   Per-route express-rate-limit instances
├── routes/
│   ├── analytics.ts      /api/analytics
│   ├── chat.ts           /api/chat
│   ├── draws.ts          /api/draws
│   ├── notifications.ts  /api/notifications
│   ├── predictions.ts    /api/predictions
│   └── users.ts          /api/users
├── services/
│   ├── fcm.ts            Firebase Admin push helper
│   ├── scraper.ts        Singapore Pools draw scraper
│   └── supabase.ts       Supabase admin client
├── strategies/
│   ├── bazi.ts / frequency.ts / gap.ts
│   ├── numerology.ts / lunar.ts / hybrid.ts
│   ├── index.ts          runAllStrategies(), computeLuckyPool()
│   └── utils.ts          Shared helpers
└── types/index.ts        Shared TypeScript types
```
