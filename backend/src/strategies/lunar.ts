import { BaziProfile, DrawResult, StrategyResult } from '../types';
import { TOTO_MIN, TOTO_MAX, PICK_COUNT, fillRandom } from './utils';

// Simplified lunar calendar mapping (approximation for TOTO use)
// Based on Chinese lunar months and their associated lucky number ranges
const LUNAR_MONTH_NUMBERS: Record<number, number[]> = {
  1:  [1, 10, 19, 28, 37, 46],   // 正月 - Spring
  2:  [2, 11, 20, 29, 38, 47],   // 二月
  3:  [3, 12, 21, 30, 39, 48],   // 三月
  4:  [4, 13, 22, 31, 40, 49],   // 四月
  5:  [5, 14, 23, 32, 41, 6],    // 五月
  6:  [6, 15, 24, 33, 42, 7],    // 六月
  7:  [7, 16, 25, 34, 43, 8],    // 七月 - Ghost Month
  8:  [8, 17, 26, 35, 44, 9],    // 八月 - Mid-Autumn
  9:  [9, 18, 27, 36, 45, 1],    // 九月
  10: [10, 19, 28, 37, 46, 2],   // 十月
  11: [11, 20, 29, 38, 47, 3],   // 十一月
  12: [12, 21, 30, 39, 48, 4],   // 十二月
};

// Lunar day auspicious patterns (simplified)
function getLunarDayBonus(lunarDay: number): number[] {
  const bonusMap: Record<number, number[]> = {
    1: [1, 13, 25, 37, 49],
    7: [7, 14, 21, 28, 35, 42],
    15: [6, 15, 24, 33, 42],   // Full moon
    30: [9, 18, 27, 36, 45],   // New moon (or end of month)
  };

  for (const [day, nums] of Object.entries(bonusMap)) {
    if (parseInt(day) === lunarDay) return nums;
  }

  // Default: use day number and its multiples
  const result: number[] = [];
  for (let mult = lunarDay; mult <= TOTO_MAX; mult += lunarDay) {
    result.push(mult);
  }
  return result.slice(0, 8);
}

export function lunarStrategy(profile: BaziProfile, history: DrawResult[]): StrategyResult {
  const { lunarMonth, lunarDay, zodiacAnimal } = profile.lunarProfile;

  const monthNums = LUNAR_MONTH_NUMBERS[lunarMonth] || LUNAR_MONTH_NUMBERS[1];
  const dayBonus = getLunarDayBonus(lunarDay);

  // Zodiac animal lucky numbers (simplified)
  const zodiacLucky: Record<string, number[]> = {
    Rat: [2, 3], Ox: [1, 4], Tiger: [1, 3], Rabbit: [3, 4],
    Dragon: [1, 6], Snake: [2, 8], Horse: [2, 3], Goat: [2, 7],
    Monkey: [1, 8], Rooster: [5, 7], Dog: [3, 4], Pig: [2, 5],
  };
  const zodiacMultipliers = zodiacLucky[zodiacAnimal] || [3, 7];

  const pool: number[] = [];
  monthNums.forEach(n => { if (n >= TOTO_MIN && n <= TOTO_MAX) pool.push(n, n); });
  dayBonus.forEach(n => { if (n >= TOTO_MIN && n <= TOTO_MAX) pool.push(n); });

  // Apply zodiac multipliers
  zodiacMultipliers.forEach(mult => {
    for (let n = mult; n <= TOTO_MAX; n += mult) {
      pool.push(n);
    }
  });

  // Sample from pool
  const selected = new Set<number>();
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const n of shuffled) {
    if (selected.size >= PICK_COUNT) break;
    if (n >= TOTO_MIN && n <= TOTO_MAX) selected.add(n);
  }

  const numbers = fillRandom(Array.from(selected), PICK_COUNT);

  return {
    strategy: 'lunar',
    numbers,
    confidence: 0.58 + Math.random() * 0.1,
    label: 'Lunar',
    emoji: '🌙',
  };
}
