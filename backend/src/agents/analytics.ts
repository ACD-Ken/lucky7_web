import Anthropic from '@anthropic-ai/sdk';
import { BaziProfile, Strategy, STRATEGY_LABELS } from '../types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface StrategyPerformance {
  strategy: Strategy;
  avgMatch: number;
  maxMatch: number;
  totalDraws: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface WeeklyInsight {
  bestStrategy: Strategy;
  worstStrategy: Strategy;
  report: string;
  recommendations: string[];
  generatedAt: string;
}

// ─── In-memory cache for weekly insights ─────────────────────────────────────
// Key: lightweight fingerprint of (profile + stats). TTL: 24 hours.
// Avoids calling the Anthropic API on every analytics page load (P4).
const INSIGHT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedInsight { insight: WeeklyInsight; expiresAt: number; }
const insightCache = new Map<string, CachedInsight>();

function fingerprintInsightInput(profile: BaziProfile, stats: StrategyPerformance[]): string {
  // Include only the fields that actually affect the AI prompt output
  const statsKey = stats
    .map(s => `${s.strategy}:${s.avgMatch.toFixed(3)}:${s.maxMatch}:${s.totalDraws}:${s.trend}`)
    .join('|');
  return `${profile.dayMaster}|${profile.lifePath}|${statsKey}`;
}

export async function generateWeeklyInsight(
  profile: BaziProfile,
  stats: StrategyPerformance[]
): Promise<WeeklyInsight> {
  if (stats.length === 0) {
    // Trivial path — no AI call needed, skip caching
    return {
      bestStrategy: 'hybrid',
      worstStrategy: 'bazi',
      report: 'Not enough draw history yet. Play more draws to see personalized insights!',
      recommendations: [
        'Generate predictions for every draw',
        'Try all 6 strategies to build your performance history',
        'Come back after 5+ draws for personalized insights',
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Cache look-up ──────────────────────────────────────────────────────────
  const cacheKey = fingerprintInsightInput(profile, stats);
  const cached = insightCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.insight;
  }

  const sorted = [...stats].sort((a, b) => b.avgMatch - a.avgMatch);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const statsSummary = stats.map(s =>
    `${STRATEGY_LABELS[s.strategy]}: avg ${s.avgMatch.toFixed(2)} matches, max ${s.maxMatch}, over ${s.totalDraws} draws (${s.trend})`
  ).join('\n');

  let result: WeeklyInsight;

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are Lucky7's analytics expert. Generate a personalized weekly insight report for this TOTO player.

PLAYER BAZI PROFILE:
- Day Master: ${profile.dayMaster}
- Support Element: ${profile.supportElem}
- Life Path Number: ${profile.lifePath}
- Zodiac: ${profile.lunarProfile.zodiacAnimal}

STRATEGY PERFORMANCE (last 10 draws):
${statsSummary}

Best strategy: ${STRATEGY_LABELS[best.strategy]} (avg ${best.avgMatch.toFixed(2)} matches)
Needs improvement: ${STRATEGY_LABELS[worst.strategy]} (avg ${worst.avgMatch.toFixed(2)} matches)

Write a personalized 3-paragraph report that:
1. Celebrates their best strategy and explains WHY it works for their BaZi profile
2. Gives specific tips to improve their worst strategy
3. Predicts which strategy will perform best in the next draw based on current trends

Then provide exactly 3 bullet-point recommendations (start each with "•").
Format: paragraphs first, then recommendations.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse recommendations from bullet points
    const lines = text.split('\n');
    const recommendations = lines
      .filter(l => l.trim().startsWith('•'))
      .map(l => l.trim().replace(/^•\s*/, ''))
      .slice(0, 3);

    const report = lines
      .filter(l => !l.trim().startsWith('•'))
      .join('\n')
      .trim();

    result = {
      bestStrategy: best.strategy,
      worstStrategy: worst.strategy,
      report,
      recommendations: recommendations.length > 0
        ? recommendations
        : ['Focus on your best-performing strategy', 'Play consistently each draw', 'Track your results over time'],
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    // Fallback: deterministic insight without AI when API credits are unavailable
    console.warn('Analytics AI insight failed, using deterministic fallback:', (err as Error).message);
    result = {
      bestStrategy: best.strategy,
      worstStrategy: worst.strategy,
      report: `Based on ${best.totalDraws} draws analysed, your ${STRATEGY_LABELS[best.strategy]} strategy leads with an average of ${best.avgMatch.toFixed(2)} matches per draw (best: ${best.maxMatch}). Your ${STRATEGY_LABELS[worst.strategy]} strategy has averaged ${worst.avgMatch.toFixed(2)} — consider using it alongside your top strategy for broader coverage.`,
      recommendations: [
        `Prioritise ${STRATEGY_LABELS[best.strategy]} — it's your strongest performer`,
        `Your Day Master (${profile.dayMaster}) aligns well with element-based strategies`,
        'Generate predictions before every draw to build a richer performance history',
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Cache store (both AI result and deterministic fallback) ────────────────
  insightCache.set(cacheKey, { insight: result, expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS });
  return result;
}
