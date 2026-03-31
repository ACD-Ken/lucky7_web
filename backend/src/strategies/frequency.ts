import { DrawResult, StrategyResult } from '../types';
import { TOTO_MIN, TOTO_MAX, PICK_COUNT } from './utils';

export function frequencyStrategy(history: DrawResult[]): StrategyResult {
  // Count how often each number has appeared in recent draws
  const freq = new Map<number, number>();
  for (let i = TOTO_MIN; i <= TOTO_MAX; i++) freq.set(i, 0);

  // Weight more recent draws higher
  history.forEach((draw, index) => {
    const recencyWeight = 1 + (history.length - index) / history.length;
    [...draw.winningNumbers, draw.additionalNumber].forEach(n => {
      if (n >= TOTO_MIN && n <= TOTO_MAX) {
        freq.set(n, (freq.get(n) || 0) + recencyWeight);
      }
    });
  });

  // Sort by frequency descending, pick top 6
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([n]) => n);

  // Pick top hot numbers with slight randomness (pick from top 15)
  const hotPool = sorted.slice(0, 15);
  const shuffled = [...hotPool].sort(() => Math.random() - 0.5);
  const numbers = shuffled.slice(0, PICK_COUNT).sort((a, b) => a - b);

  const maxFreq = freq.get(sorted[0]) || 1;
  const avgFreq = numbers.reduce((s, n) => s + (freq.get(n) || 0), 0) / numbers.length;
  const confidence = Math.min(0.9, 0.5 + (avgFreq / maxFreq) * 0.4);

  return {
    strategy: 'frequency',
    numbers,
    confidence,
    label: 'Frequency',
    emoji: '📊',
  };
}
