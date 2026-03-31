import { BaziProfile, StrategyResult } from '../types';
import { TOTO_MIN, TOTO_MAX, PICK_COUNT, fillRandom } from './utils';

// Heavenly Stem → 0-based index
const STEM_INDEX: Record<string, number> = {
  甲: 0, Jia: 0,
  乙: 1, Yi:  1,
  丙: 2, Bing: 2,
  丁: 3, Ding: 3,
  戊: 4, Wu:  4,
  己: 5, Ji:  5,
  庚: 6, Geng: 6,
  辛: 7, Xin: 7,
  壬: 8, Ren: 8,
  癸: 9, Gui: 9,
};

// Zodiac animal → 0-based index
const ZODIAC_INDEX: Record<string, number> = {
  Rat: 0, Ox: 1, Tiger: 2, Rabbit: 3,
  Dragon: 4, Snake: 5, Horse: 6, Goat: 7,
  Monkey: 8, Rooster: 9, Dog: 10, Pig: 11,
};

/**
 * I-Ching Hexagram Strategy
 *
 * Derives a primary hexagram number via `seed mod 49` (→ 1-49), then uses the
 * 6-bit binary pattern of the corresponding 64-hexagram structure to generate
 * 5 companion TOTO numbers (yang lines: upper-half resonance; yin lines: complement).
 */
export function iChingStrategy(profile: BaziProfile, drawDate: string): StrategyResult {
  const stemIdx   = STEM_INDEX[profile.dayMaster] ?? 0;
  const zodiacIdx = ZODIAC_INDEX[profile.lunarProfile.zodiacAnimal] ?? 0;
  const drawYear  = new Date(drawDate).getFullYear();

  // Personal seed — deterministic per profile + draw year
  const seed =
    profile.lifePath * 49 +
    profile.lunarProfile.lunarMonth * 13 +
    profile.lunarProfile.lunarDay * 7 +
    stemIdx * 17 +
    zodiacIdx * 11 +
    (drawYear % 100) * 3;

  // Primary hexagram number: seed mod 49 → 1-49
  const hexagramNum = (Math.abs(seed) % 49) + 1;

  // Map into the 64-hexagram system to extract its 6-line binary pattern
  const hexagram64 = Math.min(64, Math.floor(((hexagramNum - 1) / 49) * 64) + 1);

  // Build companion numbers from each hexagram line
  const selected = new Set<number>([hexagramNum]);
  for (let line = 0; line < 6 && selected.size < PICK_COUNT; line++) {
    const lineYang = (hexagram64 >> line) & 1; // 1 = yang, 0 = yin
    const candidate = lineYang
      ? ((hexagramNum + line * 7 + stemIdx) % 49) + 1       // yang → upper resonance
      : ((49 - hexagramNum + line * 7 + zodiacIdx) % 49) + 1; // yin  → complement
    if (candidate >= TOTO_MIN && candidate <= TOTO_MAX) {
      selected.add(candidate);
    }
  }

  const numbers = fillRandom(Array.from(selected), PICK_COUNT);

  return {
    strategy: 'iching',
    numbers,
    confidence: 0.60 + Math.random() * 0.08,
    label: 'I-Ching',
    emoji: '☰',
  };
}
