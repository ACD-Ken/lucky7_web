import { BaziProfile } from '../types';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FourDSuggestion {
  number: string;           // e.g. "1122"
  pairPositions: number[];  // indices where BaZi pair digit appears
  hexagramNo: number;       // 1–64
  ibetType: string;
  permCount: number;
}

export interface FourDResult {
  pairDigit: number;
  element: string;            // supportElem
  drawDate: string;
  drawDay: string;
  suggestions: FourDSuggestion[];
  generatedAt: string;
}


// ─── I-Ching index maps ─────────────────────────────────────────────────────
const STEM_INDEX: Record<string, number> = {
  '甲': 0, 'Jia': 0,
  '乙': 1, 'Yi':  1,
  '丙': 2, 'Bing': 2,
  '丁': 3, 'Ding': 3,
  '戊': 4, 'Wu':  4,
  '己': 5, 'Ji':  5,
  '庚': 6, 'Geng': 6,
  '辛': 7, 'Xin': 7,
  '壬': 8, 'Ren': 8,
  '癸': 9, 'Gui': 9,
};

const ZODIAC_INDEX: Record<string, number> = {
  'Rat': 0, 'Ox': 1, 'Tiger': 2, 'Rabbit': 3,
  'Dragon': 4, 'Snake': 5, 'Horse': 6, 'Goat': 7,
  'Monkey': 8, 'Rooster': 9, 'Dog': 10, 'Pig': 11,
};

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// All C(4,2) = 6 position-pair arrangements
const PAIR_POSITIONS: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 3],
  [1, 2], [1, 3], [2, 3],
];

// ─── Next 4D draw date ──────────────────────────────────────────────────────
export function getNext4DDrawDate(): { date: string; dayName: string } {
  const DRAW_DAYS = new Set([0, 3, 6]);
  const DRAW_HOUR = 17;
  const DRAW_MIN  = 55;

  const nowUtc = new Date();
  const sgtMs  = nowUtc.getTime() + 8 * 60 * 60 * 1000;
  const sgtNow = new Date(sgtMs);

  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const candidate = new Date(sgtMs + daysAhead * 86400000);
    const dow = candidate.getUTCDay();
    if (!DRAW_DAYS.has(dow)) continue;

    if (daysAhead === 0) {
      const h = sgtNow.getUTCHours();
      const m = sgtNow.getUTCMinutes();
      if (h > DRAW_HOUR || (h === DRAW_HOUR && m >= DRAW_MIN)) continue;
    }

    const yyyy = candidate.getUTCFullYear();
    const mm   = String(candidate.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(candidate.getUTCDate()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, dayName: DAY_NAMES[dow] };
  }

  const fb = new Date(sgtMs);
  return {
    date: `${fb.getUTCFullYear()}-${String(fb.getUTCMonth()+1).padStart(2,'0')}-${String(fb.getUTCDate()).padStart(2,'0')}`,
    dayName: DAY_NAMES[fb.getUTCDay()],
  };
}

// ─── All draw dates in next 7 calendar days ─────────────────────────────────
export function getDrawDatesInNext7Days(): Array<{ date: string; dayName: string }> {
  const DRAW_DAYS = new Set([0, 3, 6]);
  const DRAW_HOUR = 17;
  const DRAW_MIN  = 55;

  const nowUtc = new Date();
  const sgtMs  = nowUtc.getTime() + 8 * 60 * 60 * 1000;
  const sgtNow = new Date(sgtMs);
  const results: Array<{ date: string; dayName: string }> = [];

  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const candidate = new Date(sgtMs + daysAhead * 86400000);
    const dow = candidate.getUTCDay();
    if (!DRAW_DAYS.has(dow)) continue;

    if (daysAhead === 0) {
      const h = sgtNow.getUTCHours();
      const m = sgtNow.getUTCMinutes();
      if (h > DRAW_HOUR || (h === DRAW_HOUR && m >= DRAW_MIN)) continue;
    }

    const yyyy = candidate.getUTCFullYear();
    const mm   = String(candidate.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(candidate.getUTCDate()).padStart(2, '0');
    results.push({ date: `${yyyy}-${mm}-${dd}`, dayName: DAY_NAMES[dow] });
  }

  return results;
}

// ─── Draw sequence counter ──────────────────────────────────────────────────
// Counts Wed/Sat/Sun draws since Jan 3 2026 (first Sat draw of 2026)
function getDrawIndex(drawDate: string): number {
  const EPOCH_MS = new Date('2026-01-03T00:00:00Z').getTime();
  const daysDiff = Math.round((new Date(drawDate + 'T00:00:00Z').getTime() - EPOCH_MS) / 86400000);
  const weeksElapsed = Math.floor(daysDiff / 7);
  const rem = ((daysDiff % 7) + 7) % 7;
  return weeksElapsed * 3 + (rem >= 1 ? 1 : 0) + (rem >= 4 ? 1 : 0);
}

// ─── BaZi Four Pillars personal sequence ────────────────────────────────────
// Unique permutation of [0-9] derived from the user's Four Pillars chart.
// Guarantees all 10 digits appear across 10 consecutive draws (via draw index)
// but the ORDER is personalized — not sequentially predictable.
function baziPersonalSequence(profile: BaziProfile): number[] {
  const stemIdx   = STEM_INDEX[profile.dayMaster ?? ''] ?? 0;
  const zodiacIdx = ZODIAC_INDEX[profile.lunarProfile.zodiacAnimal] ?? 0;
  const seed =
    profile.lifePath                * 7919 +
    profile.lunarProfile.lunarMonth * 997  +
    profile.lunarProfile.lunarDay   * 101  +
    stemIdx                         * 137  +
    zodiacIdx                       * 53;

  const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  let s = Math.abs(seed) >>> 0;
  for (let i = 9; i > 0; i--) {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const j = Math.floor((s / 0x100000000) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── iBet type classifier ───────────────────────────────────────────────────
export function getIBetType(number: string): { ibetType: string; permCount: number } {
  const counts = new Array(10).fill(0);
  for (const d of number) counts[parseInt(d)]++;
  const freqs = counts.filter(c => c > 0).sort((a, b) => b - a);

  if (freqs[0] === 4)                   return { ibetType: 'Straight', permCount: 1  };
  if (freqs[0] === 3)                   return { ibetType: 'iBet 4',   permCount: 4  };
  if (freqs[0] === 2 && freqs[1] === 2) return { ibetType: 'iBet 6',   permCount: 6  };
  if (freqs[0] === 2)                   return { ibetType: 'iBet 12',  permCount: 12 };
  return                                       { ibetType: 'iBet 24',  permCount: 24 };
}

// ─── iBet permutations ──────────────────────────────────────────────────────
export function getIBetPermutations(number: string): string[] {
  const digits  = number.split('').map(Number);
  const results = new Set<string>();

  function permute(arr: number[], l: number): void {
    if (l === arr.length - 1) { results.add(arr.join('')); return; }
    for (let i = l; i < arr.length; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]];
      permute(arr, l + 1);
      [arr[l], arr[i]] = [arr[i], arr[l]];
    }
  }

  permute([...digits], 0);
  return [...results].sort();
}

// ─── Deterministic LCG ─────────────────────────────────────────────────────
function lcg(seed: number): () => number {
  let s = Math.abs(seed) >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ─── Core generator ─────────────────────────────────────────────────────────
// All 4 digits are BaZi-derived:
//   Pair positions (×2): supportElem digit, chosen by (lifePath + drawMonth + drawDay) % 2
//   Filler 1:            dayMaster element digit, chosen by (lunarMonth + drawDay) % 2
//   Filler 2:            heavenlyStem element digit, chosen by (lunarDay + drawMonth) % 2
// I-Ching seed picks WHICH two positions get the pair digit.
export function generate4DSuggestions(
  profile: BaziProfile,
  drawDate: string,
  count: number = 1,
): FourDResult {
  // ── BaZi Four Pillars pair digit ─────────────────────────────────────────
  const supportElem = profile.supportElem || 'Earth';
  const personalSeq = baziPersonalSequence(profile);
  const pairDigit   = personalSeq[getDrawIndex(drawDate) % 10];

  // ── Draw date components (used for I-Ching seed) ─────────────────────────
  const parts  = drawDate.split('-').map(Number);
  const dYear  = parts[0] ?? new Date().getFullYear();
  const dMonth = parts[1] ?? (new Date().getMonth() + 1);
  const dDay   = parts[2] ?? new Date().getDate();

  // ── I-Ching seed ──────────────────────────────────────────────────────────
  const stemIdx   = STEM_INDEX[profile.lunarProfile.heavenlyStem] ?? 0;
  const zodiacIdx = ZODIAC_INDEX[profile.lunarProfile.zodiacAnimal] ?? 0;

  const seed =
    profile.lifePath * 49 +
    profile.lunarProfile.lunarMonth * 13 +
    profile.lunarProfile.lunarDay   * 7  +
    stemIdx   * 17 +
    zodiacIdx * 11 +
    (dYear % 100) * 3 +
    dMonth * 5 +
    dDay   * 2;

  const hexagramNo = (Math.abs(seed) % 64) + 1;

  // ── Generate candidates ───────────────────────────────────────────────────
  const suggestions: FourDSuggestion[] = [];
  const seen = new Set<string>();

  // Offset pair position by I-Ching hexagram + draw index so both pair and fill
  // digits rotate through all 6 position combinations across different draws
  const startPosIdx = (hexagramNo + getDrawIndex(drawDate)) % 6;

  for (let round = 0; round < 4 && suggestions.length < count; round++) {
    const seedMul = [31, 53, 67, 89][round];
    const idxMul  = [97, 113, 127, 149][round];
    const hexMul  = [13, 29, 37, 47][round];

    for (let posIdx = 0; posIdx < PAIR_POSITIONS.length && suggestions.length < count; posIdx++) {
      const pairPos  = PAIR_POSITIONS[(posIdx + startPosIdx) % 6];
      const fillSeed = seed * seedMul + posIdx * idxMul + hexagramNo * hexMul + round * 7919;

      // I-Ching LCG fills the 2 remaining positions with any digit 0-9
      const lcgFn = lcg(fillSeed);
      lcgFn(); // advance past swap step (keep seed alignment)

      const digits = [-1, -1, -1, -1];
      digits[pairPos[0]] = pairDigit;
      digits[pairPos[1]] = pairDigit;

      const fillPositions = ([0, 1, 2, 3] as number[]).filter(i => !pairPos.includes(i));
      digits[fillPositions[0]] = Math.floor(lcgFn() * 10);
      digits[fillPositions[1]] = Math.floor(lcgFn() * 10);

      const numStr = digits.join('');
      if (!seen.has(numStr)) {
        seen.add(numStr);
        const { ibetType, permCount } = getIBetType(numStr);
        const pairDigitPositions = digits.map((d, i) => d === pairDigit ? i : -1).filter(i => i >= 0);
        suggestions.push({
          number:        numStr,
          pairPositions: pairDigitPositions,
          hexagramNo,
          ibetType,
          permCount,
        });
      }
    }
  }

  return {
    pairDigit,
    element:     supportElem,
    drawDate,
    drawDay:     DAY_NAMES[new Date(drawDate + 'T00:00:00Z').getUTCDay()],
    suggestions: suggestions.slice(0, count),
    generatedAt: new Date().toISOString(),
  };
}
