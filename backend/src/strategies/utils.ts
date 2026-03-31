export const TOTO_MIN = 1;
export const TOTO_MAX = 49;
export const PICK_COUNT = 6;

export function getRandomUnique(count: number, pool: number[]): number[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).sort((a, b) => a - b);
}

export function fillRandom(numbers: number[], count: number): number[] {
  const existing = new Set(numbers);
  const pool: number[] = [];
  for (let i = TOTO_MIN; i <= TOTO_MAX; i++) {
    if (!existing.has(i)) pool.push(i);
  }
  const extra = getRandomUnique(count - numbers.length, pool);
  return [...numbers, ...extra].sort((a, b) => a - b);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function numberToNumerologyRoot(n: number): number {
  // Reduce to single digit
  let sum = n;
  while (sum > 9) {
    sum = String(sum).split('').reduce((a, c) => a + parseInt(c, 10), 0);
  }
  return sum;
}

export function countMatches(predicted: number[], actual: number[], additional: number): {
  count: number;
  hasAdditional: boolean;
} {
  const actualSet = new Set(actual);
  const count = predicted.filter(n => actualSet.has(n)).length;
  const hasAdditional = predicted.includes(additional);
  return { count, hasAdditional };
}
