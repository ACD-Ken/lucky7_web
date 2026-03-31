import { DrawResult, StrategyResult } from '../types';
import { TOTO_MIN, TOTO_MAX, PICK_COUNT } from './utils';

export function gapStrategy(history: DrawResult[]): StrategyResult {
  // Find "overdue" numbers — ones that haven't appeared in a long time
  const lastSeen = new Map<number, number>();
  for (let i = TOTO_MIN; i <= TOTO_MAX; i++) lastSeen.set(i, history.length + 1);

  history.forEach((draw, index) => {
    [...draw.winningNumbers, draw.additionalNumber].forEach(n => {
      if (n >= TOTO_MIN && n <= TOTO_MAX) {
        if (!lastSeen.has(n) || lastSeen.get(n)! > index) {
          // The smaller the index, the more recent. We want larger gaps.
          lastSeen.set(n, index);
        }
      }
    });
  });

  // Gap = draws since last seen (higher = more overdue = higher priority)
  const gaps = Array.from(lastSeen.entries()).map(([n, lastIdx]) => ({
    number: n,
    gap: lastIdx, // how many draws ago it appeared (higher = more overdue)
  }));

  // Sort by gap descending (most overdue first)
  gaps.sort((a, b) => b.gap - a.gap);

  // Pick from top overdue numbers with some randomness
  const overduePool = gaps.slice(0, 15).map(g => g.number);
  const shuffled = [...overduePool].sort(() => Math.random() - 0.5);
  const numbers = shuffled.slice(0, PICK_COUNT).sort((a, b) => a - b);

  const maxGap = gaps[0]?.gap || 1;
  const avgGap = numbers.reduce((s, n) => {
    const g = gaps.find(x => x.number === n)?.gap || 0;
    return s + g;
  }, 0) / numbers.length;

  const confidence = Math.min(0.9, 0.45 + (avgGap / maxGap) * 0.45);

  return {
    strategy: 'gap',
    numbers,
    confidence,
    label: 'Gap',
    emoji: '⭐',
  };
}
