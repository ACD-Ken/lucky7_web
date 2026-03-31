export { baziStrategy } from './bazi';
export { frequencyStrategy } from './frequency';
export { gapStrategy } from './gap';
export { numerologyStrategy } from './numerology';
export { lunarStrategy } from './lunar';
export { iChingStrategy } from './iching';
export { deterministicSeedStrategy } from './deterministic';
export { hybridStrategy } from './hybrid';
export { deepseekBaziStrategy } from './deepseek';
export { countMatches } from './utils';

import { BaziProfile, DrawResult, StrategyResult } from '../types';
import { baziStrategy } from './bazi';
import { frequencyStrategy } from './frequency';
import { gapStrategy } from './gap';
import { numerologyStrategy } from './numerology';
import { lunarStrategy } from './lunar';
import { iChingStrategy } from './iching';
import { deterministicSeedStrategy } from './deterministic';
import { hybridStrategy } from './hybrid';
import { deepseekBaziStrategy } from './deepseek';

export async function runAllStrategies(
  profile: BaziProfile,
  drawDate: string,
  history: DrawResult[],
  drawNo?: number,
  favoriteNumbers?: number[],
  gender?: string
): Promise<StrategyResult[]> {
  const base: StrategyResult[] = [
    baziStrategy(profile, drawDate),
    frequencyStrategy(history),
    gapStrategy(history),
    numerologyStrategy(profile, drawDate),
    lunarStrategy(profile, history),
    iChingStrategy(profile, drawDate),
    deterministicSeedStrategy(profile, drawDate, drawNo),
    hybridStrategy(profile, drawDate, history), // always last
  ];

  if (favoriteNumbers && favoriteNumbers.length >= 12) {
    const deepseekResult = await deepseekBaziStrategy(
      profile,
      drawDate,
      favoriteNumbers,
      gender ?? 'M'
    );
    base.push(deepseekResult);
  }

  return base;
}

export function computeLuckyPool(strategies: StrategyResult[]): number[] {
  // Count how many strategies each number appears in
  const freq = new Map<number, number>();
  strategies.forEach(s => s.numbers.forEach(n => freq.set(n, (freq.get(n) || 0) + 1)));

  // Keep only numbers that appear in 3+ strategies — stricter consensus threshold
  // Returns [] if not enough overlap; caller handles regeneration
  return Array.from(freq.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]) // most frequent first, then ascending
    .map(([n]) => n);
}
