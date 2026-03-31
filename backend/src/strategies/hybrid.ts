import { BaziProfile, DrawResult, StrategyResult } from '../types';
import { TOTO_MIN, TOTO_MAX, PICK_COUNT } from './utils';
import { baziStrategy } from './bazi';
import { frequencyStrategy } from './frequency';
import { gapStrategy } from './gap';
import { numerologyStrategy } from './numerology';
import { lunarStrategy } from './lunar';
import { iChingStrategy } from './iching';
import { deterministicSeedStrategy } from './deterministic';

export function hybridStrategy(
  profile: BaziProfile,
  drawDate: string,
  history: DrawResult[]
): StrategyResult {
  // Run all 7 base strategies and collect their numbers
  const strategies = [
    baziStrategy(profile, drawDate),
    frequencyStrategy(history),
    gapStrategy(history),
    numerologyStrategy(profile, drawDate),
    lunarStrategy(profile, history),
    iChingStrategy(profile, drawDate),
    deterministicSeedStrategy(profile, drawDate),
  ];

  // Score each number by how many strategies include it (weighted by confidence)
  const scores = new Map<number, number>();
  for (let n = TOTO_MIN; n <= TOTO_MAX; n++) scores.set(n, 0);

  strategies.forEach(result => {
    result.numbers.forEach(n => {
      scores.set(n, (scores.get(n) || 0) + result.confidence);
    });
  });

  // Sort by composite score descending
  const ranked = Array.from(scores.entries())
    .filter(([n]) => n >= TOTO_MIN && n <= TOTO_MAX)
    .sort((a, b) => b[1] - a[1]);

  // Pick top 6 with some randomness — pick from top 12
  const topPool = ranked.slice(0, 12).map(([n]) => n);
  const shuffled = [...topPool].sort(() => Math.random() - 0.5);
  const numbers = shuffled.slice(0, PICK_COUNT).sort((a, b) => a - b);

  // Confidence = weighted average of all 7 strategies' confidences
  const avgConfidence = strategies.reduce((s, r) => s + r.confidence, 0) / strategies.length;

  return {
    strategy: 'hybrid',
    numbers,
    confidence: Math.min(0.92, avgConfidence + 0.05),
    label: 'Hybrid',
    emoji: '🔮',
  };
}
