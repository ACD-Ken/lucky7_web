import { BaziProfile, StrategyResult } from '../types';
import { TOTO_MIN, TOTO_MAX, PICK_COUNT, fillRandom } from './utils';

// BaZi Five Elements mapping to TOTO number ranges
const ELEMENT_RANGES: Record<string, number[]> = {
  Wood: [1, 2, 3, 11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43],
  Fire: [4, 5, 6, 14, 15, 16, 24, 25, 26, 34, 35, 36, 44, 45, 46],
  Earth: [7, 8, 9, 17, 18, 19, 27, 28, 29, 37, 38, 39, 47, 48, 49],
  Metal: [10, 11, 20, 21, 30, 31, 40, 41],
  Water: [2, 12, 22, 32, 42, 6, 16, 26, 36, 46],
};

// Heavenly Stems to elements
const STEM_ELEMENTS: Record<string, string> = {
  甲: 'Wood', 乙: 'Wood',
  丙: 'Fire', 丁: 'Fire',
  戊: 'Earth', 己: 'Earth',
  庚: 'Metal', 辛: 'Metal',
  壬: 'Water', 癸: 'Water',
  Jia: 'Wood', Yi: 'Wood',
  Bing: 'Fire', Ding: 'Fire',
  Wu: 'Earth', Ji: 'Earth',
  Geng: 'Metal', Xin: 'Metal',
  Ren: 'Water', Gui: 'Water',
};

// Zodiac animals to elements
const ZODIAC_ELEMENTS: Record<string, string> = {
  Rat: 'Water', Ox: 'Earth', Tiger: 'Wood', Rabbit: 'Wood',
  Dragon: 'Earth', Snake: 'Fire', Horse: 'Fire', Goat: 'Earth',
  Monkey: 'Metal', Rooster: 'Metal', Dog: 'Earth', Pig: 'Water',
};

export function baziStrategy(profile: BaziProfile, drawDate: string): StrategyResult {
  const dayMasterElement = STEM_ELEMENTS[profile.dayMaster] || profile.dayMaster;
  const supportElement = profile.supportElem;
  const zodiacElement = ZODIAC_ELEMENTS[profile.lunarProfile.zodiacAnimal] || 'Wood';

  // Weight elements: support element x2, day master x1.5, zodiac x1
  const weightedPool: number[] = [];

  const supportNums = ELEMENT_RANGES[supportElement] || [];
  const dayMasterNums = ELEMENT_RANGES[dayMasterElement] || [];
  const zodiacNums = ELEMENT_RANGES[zodiacElement] || [];

  // Add with weights
  supportNums.forEach(n => {
    if (n >= TOTO_MIN && n <= TOTO_MAX) {
      weightedPool.push(n, n); // weight x2
    }
  });
  dayMasterNums.forEach(n => {
    if (n >= TOTO_MIN && n <= TOTO_MAX) {
      weightedPool.push(n); // weight x1.5 (approximated)
    }
  });
  zodiacNums.forEach(n => {
    if (n >= TOTO_MIN && n <= TOTO_MAX) {
      weightedPool.push(n);
    }
  });

  // Also incorporate life path number
  const lifePathNum = ((profile.lifePath - 1) % TOTO_MAX) + 1;
  weightedPool.push(lifePathNum, lifePathNum, lifePathNum);

  // Add draw date influence (day of month)
  const drawDay = new Date(drawDate).getDate();
  if (drawDay >= TOTO_MIN && drawDay <= TOTO_MAX) {
    weightedPool.push(drawDay);
  }

  // Sample without replacement from weighted pool
  const selected = new Set<number>();
  const shuffled = [...weightedPool].sort(() => Math.random() - 0.5);

  for (const n of shuffled) {
    if (selected.size >= PICK_COUNT) break;
    if (n >= TOTO_MIN && n <= TOTO_MAX) selected.add(n);
  }

  const numbers = Array.from(selected);
  const filled = fillRandom(numbers, PICK_COUNT);

  return {
    strategy: 'bazi',
    numbers: filled,
    confidence: 0.65 + Math.random() * 0.1,
    label: 'BaZi',
    emoji: '☯',
  };
}
