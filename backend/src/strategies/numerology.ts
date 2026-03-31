import { BaziProfile, StrategyResult } from '../types';
import { TOTO_MIN, TOTO_MAX, PICK_COUNT, fillRandom, numberToNumerologyRoot } from './utils';

export function numerologyStrategy(profile: BaziProfile, drawDate: string): StrategyResult {
  const dateObj = new Date(drawDate);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();

  // Personal year = life path + current year digits reduced
  const yearSum = String(year).split('').reduce((a, c) => a + parseInt(c, 10), 0);
  const personalYear = numberToNumerologyRoot(profile.lifePath + yearSum);

  // Universal day = all digits of draw date reduced
  const universalDay = numberToNumerologyRoot(year + month + day);

  // Power numbers based on numerology roots
  const powerRoots = new Set([
    personalYear,
    universalDay,
    numberToNumerologyRoot(profile.lifePath),
    numberToNumerologyRoot(month + day),
  ]);

  // Find all TOTO numbers whose root matches any power root
  const luckNumbers: number[] = [];
  for (let n = TOTO_MIN; n <= TOTO_MAX; n++) {
    if (powerRoots.has(numberToNumerologyRoot(n))) {
      luckNumbers.push(n);
    }
  }

  // If we have enough, pick randomly from luck numbers
  let numbers: number[];
  if (luckNumbers.length >= PICK_COUNT) {
    const shuffled = [...luckNumbers].sort(() => Math.random() - 0.5);
    numbers = shuffled.slice(0, PICK_COUNT).sort((a, b) => a - b);
  } else {
    numbers = fillRandom(luckNumbers, PICK_COUNT);
  }

  const confidence = 0.55 + Math.min(0.2, (luckNumbers.length / 20) * 0.2);

  return {
    strategy: 'numerology',
    numbers,
    confidence,
    label: 'Numerology',
    emoji: '🔢',
  };
}
