import Anthropic from '@anthropic-ai/sdk';
import { BaziProfile, StrategyResult } from '../types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type AgentIntent =
  | 'profile'
  | 'prediction'
  | 'chat'
  | 'results'
  | 'analytics'
  | 'draw_info'
  | 'general';

export interface OrchestratorDecision {
  intent: AgentIntent;
  confidence: number;
  extractedEntities: {
    drawDate?: string;
    strategy?: string;
    question?: string;
  };
}

// ─── Intent-classification cache (P13) ───────────────────────────────────────
// Identical messages (normalised) reuse the same classification for 5 minutes.
// Evicts the oldest entry once the map exceeds 500 entries (simple LRU-lite).
const INTENT_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const INTENT_CACHE_MAX    = 500;

interface CachedIntent { decision: OrchestratorDecision; expiresAt: number; }
const intentCache = new Map<string, CachedIntent>();

export async function classifyIntent(userMessage: string): Promise<OrchestratorDecision> {
  // ── Cache look-up ──────────────────────────────────────────────────────────
  const normalised = userMessage.trim().toLowerCase();
  const cached = intentCache.get(normalised);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.decision;
  }

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Classify this TOTO lottery app user message into exactly one intent. Return ONLY a JSON object.

Message: "${userMessage}"

Intents:
- profile: User wants to update/view their BaZi profile or personal info
- prediction: User wants to generate/view lottery number predictions
- chat: General conversation, questions about BaZi, lucky numbers, draw timing
- results: User wants to see past draw results or match scores
- analytics: User wants insights, statistics, strategy performance reports
- draw_info: User wants to know next draw date/time or draw history
- general: Everything else

Return JSON: {"intent": "<intent>", "confidence": <0-1>, "extractedEntities": {"drawDate": null, "strategy": null, "question": "<the core question if chat>"}}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

  let decision: OrchestratorDecision;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    decision = JSON.parse(jsonMatch[0]) as OrchestratorDecision;
  } catch {
    decision = {
      intent: 'chat',
      confidence: 0.5,
      extractedEntities: { question: userMessage },
    };
  }

  // ── Cache store with bounded eviction ─────────────────────────────────────
  if (intentCache.size >= INTENT_CACHE_MAX) {
    // Map insertion order is preserved; delete the oldest (first) entry
    const oldest = intentCache.keys().next().value as string;
    intentCache.delete(oldest);
  }
  intentCache.set(normalised, { decision, expiresAt: Date.now() + INTENT_CACHE_TTL_MS });

  return decision;
}

// ─── Health-check cache (P6) ──────────────────────────────────────────────────
// /api/agents/status hits Anthropic on every request. Cache for 60 s to avoid
// burning API credits on status-page polling.
const HEALTH_CACHE_TTL_MS = 60_000; // 60 seconds

let healthCache: { result: Record<string, string>; expiresAt: number } | null = null;

export async function healthCheck(): Promise<Record<string, string>> {
  // ── Cache look-up ──────────────────────────────────────────────────────────
  if (healthCache && Date.now() < healthCache.expiresAt) {
    return healthCache.result;
  }

  const agents = ['profile', 'prediction', 'chat', 'results', 'analytics', 'scheduler'];
  const status: Record<string, string> = {};

  // Check if Anthropic API is reachable
  try {
    await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }],
    });
    agents.forEach(a => { status[a] = 'healthy'; });
  } catch (error) {
    agents.forEach(a => { status[a] = 'degraded'; });
  }

  // ── Cache store ────────────────────────────────────────────────────────────
  healthCache = { result: status, expiresAt: Date.now() + HEALTH_CACHE_TTL_MS };
  return status;
}
