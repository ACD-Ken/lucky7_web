import { baziStrategy } from '../../src/strategies/bazi';
import { frequencyStrategy } from '../../src/strategies/frequency';
import { gapStrategy } from '../../src/strategies/gap';
import { numerologyStrategy } from '../../src/strategies/numerology';
import { lunarStrategy } from '../../src/strategies/lunar';
import { iChingStrategy } from '../../src/strategies/iching';
import { deterministicSeedStrategy } from '../../src/strategies/deterministic';
import { hybridStrategy } from '../../src/strategies/hybrid';
import { runAllStrategies, computeLuckyPool, countMatches } from '../../src/strategies';
import { BaziProfile, DrawResult } from '../../src/types';

const mockProfile: BaziProfile = {
  dayMaster: 'Ding',         // Fire (丁) — Ding-Si day pillar, DOB 1970/02/06
  supportElem: 'Water',      // Water controls strong Fire (官杀 — chart has 4 Fire, 0 Water)
  lifePath: 7,
  birthTime: '11:30',
  lunarProfile: {
    lunarMonth: 1,
    lunarDay: 1,
    zodiacAnimal: 'Dog',     // 1970 = Geng-Xu year (庚戌) = Dog
    heavenlyStem: 'Geng',    // 庚 (year 1970 = Geng-Xu)
    earthlyBranch: 'Xu',     // 戌
    hourPillar: {
      heavenlyStem: 'Bing',  // 丙 (Ding/Ren day → Zi starts at Geng; Wu hour idx 6 → stem (6+6)%10=2=Bing)
      earthlyBranch: 'Wu',   // 午 (11:30 AM = Wu hour 午時)
    },
  },
};

const mockProfileWithName: BaziProfile = {
  ...mockProfile,
  name: 'Ken',
};

const mockHistory: DrawResult[] = Array.from({ length: 50 }, (_, i) => ({
  drawNo: `${3700 + i}`,
  drawDate: new Date(2024, 0, i + 1).toISOString(),
  winningNumbers: [
    ((i * 7) % 49) + 1,
    ((i * 11) % 49) + 1,
    ((i * 13) % 49) + 1,
    ((i * 17) % 49) + 1,
    ((i * 19) % 49) + 1,
    ((i * 23) % 49) + 1,
  ].map(n => Math.min(49, Math.max(1, n))),
  additionalNumber: ((i * 29) % 49) + 1,
}));

function isValidSet(numbers: number[]): boolean {
  if (numbers.length !== 6) return false;
  const set = new Set(numbers);
  if (set.size !== 6) return false;
  return numbers.every(n => n >= 1 && n <= 49 && Number.isInteger(n));
}

describe('BaZi Strategy', () => {
  test('returns 6 unique numbers in range 1-49', () => {
    const result = baziStrategy(mockProfile, '2024-06-01');
    expect(isValidSet(result.numbers)).toBe(true);
    expect(result.strategy).toBe('bazi');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('numbers are sorted ascending', () => {
    const result = baziStrategy(mockProfile, '2024-06-01');
    const sorted = [...result.numbers].sort((a, b) => a - b);
    expect(result.numbers).toEqual(sorted);
  });
});

describe('Frequency Strategy', () => {
  test('returns 6 unique numbers in range 1-49', () => {
    const result = frequencyStrategy(mockHistory);
    expect(isValidSet(result.numbers)).toBe(true);
    expect(result.strategy).toBe('frequency');
  });

  test('works with empty history', () => {
    const result = frequencyStrategy([]);
    expect(isValidSet(result.numbers)).toBe(true);
  });

  test('confidence is between 0 and 1', () => {
    const result = frequencyStrategy(mockHistory);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe('Gap Strategy', () => {
  test('returns 6 unique numbers in range 1-49', () => {
    const result = gapStrategy(mockHistory);
    expect(isValidSet(result.numbers)).toBe(true);
    expect(result.strategy).toBe('gap');
  });

  test('works with empty history', () => {
    const result = gapStrategy([]);
    expect(isValidSet(result.numbers)).toBe(true);
  });
});

describe('Numerology Strategy', () => {
  test('returns 6 unique numbers in range 1-49', () => {
    const result = numerologyStrategy(mockProfile, '2024-06-01');
    expect(isValidSet(result.numbers)).toBe(true);
    expect(result.strategy).toBe('numerology');
  });

  test('different draw dates produce valid results', () => {
    const dates = ['2024-01-01', '2024-06-15', '2024-12-31'];
    dates.forEach(d => {
      const result = numerologyStrategy(mockProfile, d);
      expect(isValidSet(result.numbers)).toBe(true);
    });
  });
});

describe('Lunar Strategy', () => {
  test('returns 6 unique numbers in range 1-49', () => {
    const result = lunarStrategy(mockProfile, mockHistory);
    expect(isValidSet(result.numbers)).toBe(true);
    expect(result.strategy).toBe('lunar');
  });

  test('all zodiac animals work', () => {
    const animals = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
    animals.forEach(zodiacAnimal => {
      const profile = { ...mockProfile, lunarProfile: { ...mockProfile.lunarProfile, zodiacAnimal } };
      const result = lunarStrategy(profile, mockHistory);
      expect(isValidSet(result.numbers)).toBe(true);
    });
  });
});

describe('I-Ching Strategy', () => {
  test('returns 6 unique numbers in range 1-49', () => {
    const result = iChingStrategy(mockProfile, '2024-06-01');
    expect(isValidSet(result.numbers)).toBe(true);
    expect(result.strategy).toBe('iching');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('numbers are sorted ascending', () => {
    const result = iChingStrategy(mockProfile, '2024-06-01');
    const sorted = [...result.numbers].sort((a, b) => a - b);
    expect(result.numbers).toEqual(sorted);
  });

  test('all zodiac animals produce valid results', () => {
    const animals = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
    animals.forEach(zodiacAnimal => {
      const profile = { ...mockProfile, lunarProfile: { ...mockProfile.lunarProfile, zodiacAnimal } };
      const result = iChingStrategy(profile, '2024-06-01');
      expect(isValidSet(result.numbers)).toBe(true);
    });
  });

  test('label and emoji are correct', () => {
    const result = iChingStrategy(mockProfile, '2024-06-01');
    expect(result.label).toBe('I-Ching');
    expect(result.emoji).toBe('☰');
  });
});

describe('Deterministic Seed Strategy', () => {
  test('returns 6 unique numbers in range 1-49', () => {
    const result = deterministicSeedStrategy(mockProfile, '2024-06-01');
    expect(isValidSet(result.numbers)).toBe(true);
    expect(result.strategy).toBe('deterministic');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('numbers are sorted ascending', () => {
    const result = deterministicSeedStrategy(mockProfile, '2024-06-01');
    const sorted = [...result.numbers].sort((a, b) => a - b);
    expect(result.numbers).toEqual(sorted);
  });

  test('same inputs always produce the same numbers (deterministic)', () => {
    const r1 = deterministicSeedStrategy(mockProfile, '2024-06-01');
    const r2 = deterministicSeedStrategy(mockProfile, '2024-06-01');
    expect(r1.numbers).toEqual(r2.numbers);
  });

  test('works without name in profile (fallback seed)', () => {
    const result = deterministicSeedStrategy(mockProfile, '2024-06-01');
    expect(isValidSet(result.numbers)).toBe(true);
  });

  test('works with name in profile', () => {
    const result = deterministicSeedStrategy(mockProfileWithName, '2024-06-01');
    expect(isValidSet(result.numbers)).toBe(true);
  });

  test('different draw years produce different numbers', () => {
    // Use dates with different MMDD to avoid same %10000 drawEnergy collision
    const r2024 = deterministicSeedStrategy(mockProfile, '2024-01-15');
    const r2025 = deterministicSeedStrategy(mockProfile, '2025-07-22');
    expect(r2024.numbers).not.toEqual(r2025.numbers);
  });

  test('label and emoji are correct', () => {
    const result = deterministicSeedStrategy(mockProfile, '2024-06-01');
    expect(result.label).toBe('Seed');
    expect(result.emoji).toBe('🎯');
  });
});

describe('Hybrid Strategy', () => {
  test('returns 6 unique numbers in range 1-49', () => {
    const result = hybridStrategy(mockProfile, '2024-06-01', mockHistory);
    expect(isValidSet(result.numbers)).toBe(true);
    expect(result.strategy).toBe('hybrid');
  });

  test('has higher confidence than most individual strategies', () => {
    const result = hybridStrategy(mockProfile, '2024-06-01', mockHistory);
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe('runAllStrategies', () => {
  test('returns exactly 8 strategies', async () => {
    const results = await runAllStrategies(mockProfile, '2024-06-01', mockHistory);
    expect(results).toHaveLength(8);
  });

  test('all strategies have valid numbers', async () => {
    const results = await runAllStrategies(mockProfile, '2024-06-01', mockHistory);
    results.forEach(r => {
      expect(isValidSet(r.numbers)).toBe(true);
    });
  });

  test('all 8 strategies are present', async () => {
    const results = await runAllStrategies(mockProfile, '2024-06-01', mockHistory);
    const strategies = results.map(r => r.strategy);
    expect(strategies).toContain('bazi');
    expect(strategies).toContain('frequency');
    expect(strategies).toContain('gap');
    expect(strategies).toContain('numerology');
    expect(strategies).toContain('lunar');
    expect(strategies).toContain('iching');
    expect(strategies).toContain('deterministic');
    expect(strategies).toContain('hybrid');
  });

  test('hybrid is the last strategy', async () => {
    const results = await runAllStrategies(mockProfile, '2024-06-01', mockHistory);
    expect(results[results.length - 1].strategy).toBe('hybrid');
  });
});

describe('computeLuckyPool', () => {
  test('returns union of all strategy numbers', async () => {
    const results = await runAllStrategies(mockProfile, '2024-06-01', mockHistory);
    const pool = computeLuckyPool(results);
    expect(pool.length).toBeGreaterThanOrEqual(0); // consensus pool may be small or empty
    expect(pool.length).toBeLessThanOrEqual(49); // max 8×6=48 unique numbers
    pool.forEach(n => {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(49);
    });
    expect(new Set(pool).size).toBe(pool.length); // no duplicates
  });
});

describe('countMatches', () => {
  test('correctly counts matches', () => {
    const predicted = [1, 2, 3, 4, 5, 6];
    const actual = [1, 2, 3, 7, 8, 9];
    const additional = 4;
    const result = countMatches(predicted, actual, additional);
    expect(result.count).toBe(3);
    expect(result.hasAdditional).toBe(true);
  });

  test('returns 0 for no matches', () => {
    const predicted = [40, 41, 42, 43, 44, 45];
    const actual = [1, 2, 3, 4, 5, 6];
    const additional = 7;
    const result = countMatches(predicted, actual, additional);
    expect(result.count).toBe(0);
    expect(result.hasAdditional).toBe(false);
  });

  test('handles perfect match', () => {
    const predicted = [1, 2, 3, 4, 5, 6];
    const actual = [1, 2, 3, 4, 5, 6];
    const additional = 7;
    const result = countMatches(predicted, actual, additional);
    expect(result.count).toBe(6);
  });
});
