import { BaziProfile, StrategyResult } from '../types';
import { TOTO_MIN, TOTO_MAX, PICK_COUNT } from './utils';

// Heavenly Stem → 0-based index (for fallback name_value)
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

// Zodiac animal → 0-based index (for fallback name_value)
const ZODIAC_INDEX: Record<string, number> = {
  Rat: 0, Ox: 1, Tiger: 2, Rabbit: 3,
  Dragon: 4, Snake: 5, Horse: 6, Goat: 7,
  Monkey: 8, Rooster: 9, Dog: 10, Pig: 11,
};

/**
 * Deterministic Seed Strategy
 *
 * seed = sum(DOB digits) × name_value + year_energy
 *   - sum(DOB digits) → profile.lifePath  (the reduced DOB digit sum, 1-9)
 *   - name_value      → numerological value of profile.name (A=1..Z=26, reduced to ≤49)
 *                       falls back to dayMaster + zodiac encoding when name is absent
 *   - year_energy     → sum of the 4 digits of the draw year
 *
 * Number selection uses a seeded LCG (Linear Congruential Generator) — fully
 * deterministic: same profile + same draw number → always same 6 numbers per draw.
 */
export function deterministicSeedStrategy(profile: BaziProfile, drawDate: string, drawNo?: number): StrategyResult {
  // --- sum(DOB digits) ---
  const dobComponent = profile.lifePath; // 1-9

  // --- name_value ---
  let nameValue: number;
  if (profile.name && profile.name.trim().length > 0) {
    const letters = profile.name.toUpperCase().replace(/[^A-Z]/g, '');
    nameValue = letters.split('').reduce((s, ch) => s + (ch.charCodeAt(0) - 64), 0);
    // Reduce until ≤ 49
    while (nameValue > 49) {
      nameValue = String(nameValue).split('').reduce((s, d) => s + parseInt(d, 10), 0);
    }
    nameValue = Math.max(1, nameValue);
  } else {
    // Fallback: dayMaster index × 4 + zodiac index gives a unique proxy per profile type
    const stemVal   = (STEM_INDEX[profile.dayMaster] ?? 0) + 1;  // 1-10
    const zodiacVal = (ZODIAC_INDEX[profile.lunarProfile.zodiacAnimal] ?? 0) + 1; // 1-12
    nameValue = stemVal * 4 + zodiacVal; // range 5-52
  }

  // --- draw_energy: use draw number if available, else fall back to draw date YYYYMMDD ---
  const drawEnergy = drawNo
    ? drawNo
    : parseInt(drawDate.replace(/-/g, '').slice(0, 8), 10) % 10000;

  // --- seed ---
  const seed = (dobComponent * nameValue + drawEnergy) | 0;

  // --- LCG (Knuth multiplicative) — no Math.random() ---
  let state = Math.abs(seed) || 1;
  const lcg = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return Math.abs(state);
  };

  const used  = new Set<number>();
  const picks: number[] = [];
  while (picks.length < PICK_COUNT) {
    const candidate = (lcg() % TOTO_MAX) + TOTO_MIN; // 1-49
    if (!used.has(candidate)) {
      used.add(candidate);
      picks.push(candidate);
    }
  }

  const numbers = picks.sort((a, b) => a - b);

  // Confidence varies with seed "energy" (spread of the seed value)
  const confidence = 0.60 + Math.min(0.12, (Math.abs(seed) % 120) / 1000);

  return {
    strategy: 'deterministic',
    numbers,
    confidence,
    label: 'Seed',
    emoji: '🎯',
  };
}
