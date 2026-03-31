import Anthropic from '@anthropic-ai/sdk';
import { BaziProfile } from '../types';

// ─── Ganzhi lookup tables ──────────────────────────────────────────────────
const STEMS    = ['Jia', 'Yi', 'Bing', 'Ding', 'Wu', 'Ji', 'Geng', 'Xin', 'Ren', 'Gui'];
const ELEMENTS = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
const ANIMALS  = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
const BRANCHES = ['Zi', 'Chou', 'Yin', 'Mao', 'Chen', 'Si', 'Wu', 'Wei', 'Shen', 'You', 'Xu', 'Hai'];

// Generating cycle (相生): the element that generates/feeds the Day Master element
// This is the simplified "印" (Seal) support principle used in the fallback
const STEM_TO_ELEM: Record<string, string> = {
  Jia: 'Wood', Yi: 'Wood', Bing: 'Fire', Ding: 'Fire',
  Wu: 'Earth', Ji: 'Earth', Geng: 'Metal', Xin: 'Metal',
  Ren: 'Water', Gui: 'Water',
};
const GENERATES: Record<string, string> = {
  Wood: 'Water', Fire: 'Wood', Earth: 'Fire', Metal: 'Earth', Water: 'Metal',
};

// Hour branch lookup: maps hour-of-day (0-23) → earthly branch index (0-11)
// Traditional Chinese double-hour system: Zi=23:00-00:59, Chou=01:00-02:59, …
function getHourBranchIndex(hour: number): number {
  if (hour === 23) return 0; // Zi starts at 23:00
  return Math.floor((hour + 1) / 2) % 12;
}

// Five Rat rule (五鼠遁日起时法): hour stem start index for Zi hour, keyed by Day Master stem
const HOUR_STEM_START: Record<string, number> = {
  Jia: 0, Ji: 0,      // Jia/Ji day → Zi hour starts at Jia  (index 0)
  Yi: 2,  Geng: 2,    // Yi/Geng day → Zi hour starts at Bing (index 2)
  Bing: 4, Xin: 4,    // Bing/Xin day → Zi hour starts at Wu  (index 4)
  Ding: 6, Ren: 6,    // Ding/Ren day → Zi hour starts at Geng (index 6)
  Wu: 8,  Gui: 8,     // Wu/Gui day → Zi hour starts at Ren  (index 8)
};

// ─── Julian Day Number (JDN) ─────────────────────────────────────────────
// Standard proleptic Gregorian calendar formula
function getJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

// ─── Day Pillar from JDN ─────────────────────────────────────────────────
// Formula from lunar-javascript (6tail) — the authoritative Chinese calendar library
// Source: https://github.com/6tail/lunar-javascript
// offset = JDN - 11  →  index 0 = Jia-Zi (甲子), verified against Chinese almanac
// Verification: Feb 6 1970 (CNY, Geng-Xu year) → JDN 2440624 → offset 2440613
//   stem  2440613 % 10 = 3 → Ding 丁 (Fire) ✓
//   branch 2440613 % 12 = 5 → Si 巳 ✓  Day Pillar: Ding-Si (丁巳)

function getDayPillar(year: number, month: number, day: number): { stemIdx: number; branchIdx: number } {
  const offset = getJDN(year, month, day) - 11;
  return {
    stemIdx:   ((offset % 10) + 10) % 10,
    branchIdx: ((offset % 12) + 12) % 12,
  };
}

// ─── Hour Pillar ────────────────────────────────────────────────────────
function getHourPillar(
  dayMasterStem: string,
  birthTime: string,
): { heavenlyStem: string; earthlyBranch: string } {
  const hour = parseInt(birthTime.split(':')[0] ?? '0', 10);
  const hourBranchIdx = getHourBranchIndex(hour);
  const startIdx      = HOUR_STEM_START[dayMasterStem] ?? 0;
  const hourStemIdx   = (startIdx + hourBranchIdx) % 10;
  return {
    heavenlyStem:  STEMS[hourStemIdx],
    earthlyBranch: BRANCHES[hourBranchIdx],
  };
}

// ─── Life Path ───────────────────────────────────────────────────────────
function calcLifePath(year: number, month: number, day: number): number {
  const dateStr = `${year}${month}${day}`;
  let lp = dateStr.split('').reduce((a, c) => a + parseInt(c, 10), 0);
  while (lp > 9) lp = String(lp).split('').reduce((a, c) => a + parseInt(c, 10), 0);
  return lp;
}

// ─── Deterministic fallback ───────────────────────────────────────────────
function computeFallbackProfile(dob: string, gender: string, birthTime?: string): BaziProfile {
  const [ys, ms, ds] = dob.split('/');
  const year  = parseInt(ys ?? '1990', 10);
  const month = parseInt(ms ?? '1',    10);
  const day   = parseInt(ds ?? '1',    10);

  // Day Pillar using JDN (accurate 60-cycle)
  const { stemIdx, branchIdx } = getDayPillar(year, month, day);
  const dayMaster = STEMS[stemIdx];

  // Support element = element that generates Day Master in Wu Xing cycle (印 Seal)
  const supportElem = GENERATES[STEM_TO_ELEM[dayMaster] ?? 'Wood'] ?? 'Water';

  // Year pillar (approximate — counts from year 4 CE, standard Ganzhi offset)
  const zodiacIndex  = ((year - 4) % 12 + 12) % 12;
  const yearStemIdx  = ((year - 4) % 10 + 10) % 10;

  // Hour pillar (when birth time provided)
  const hourPillar = birthTime
    ? getHourPillar(dayMaster, birthTime)
    : undefined;

  return {
    dayMaster,
    supportElem,
    lifePath: calcLifePath(year, month, day),
    birthTime,
    lunarProfile: {
      lunarMonth:   month,      // solar month used as approximation
      lunarDay:     day,
      zodiacAnimal: ANIMALS[zodiacIndex],
      heavenlyStem: STEMS[yearStemIdx],
      earthlyBranch: BRANCHES[zodiacIndex],
      hourPillar,
    },
  };
}

// ─── AI-powered derivation ────────────────────────────────────────────────
export async function deriveProfileWithAI(
  dob: string,
  gender: string,
  name: string,
  birthTime?: string,
): Promise<BaziProfile> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-ant-REPLACE')) {
    console.warn('No Anthropic API key — using deterministic BaZi profile');
    return computeFallbackProfile(dob, gender, birthTime);
  }

  const client = new Anthropic({ apiKey });

  const hourPillarInstruction = birthTime
    ? `4. Birth time is ${birthTime} (HH:MM, 24h). Calculate the Hour Pillar using the Five Rat rule (五鼠遁日起时法) and include it in hourPillar.`
    : `4. Birth time is unknown — omit hourPillar (set to null).`;

  const prompt = `You are a classical BaZi (四柱八字) expert. Given the person's details below, calculate their complete Four Pillars chart and derive the most beneficial element (用神 Yòng Shén).

Date of Birth : ${dob} (YYYY/MM/DD)
Time of Birth : ${birthTime ?? 'unknown'}
Gender        : ${gender}

Rules:
1. Use the SOLAR calendar and solar terms (节气) to determine the month pillar — NOT the lunar month. Li Chun (立春, ~Feb 4) starts Month 1 (Tiger/Yin month). Use accurate solar term dates for each year.
2. Calculate the Day Pillar using the traditional 60-Jiazi (六十甲子) cycle from a reliable reference date.
3. The Day Master is the HEAVENLY STEM of the Day Pillar only — not the year, month, or hour stem.
${hourPillarInstruction}
5. Assess the Day Master's strength based on: birth season (月令), any stems/branches in the chart that share the same element (比劫), and elements that generate or control it.
6. Derive 用神 (supportElem) = the single element most beneficial to balance this chart:
   - If the Day Master is weak → use the element that generates it (印星, mother element)
   - If the Day Master is strong → use the element that controls it (官杀) or drains it (食伤)
   - Do NOT return the same element as the Day Master itself as supportElem.
7. lifePath = reduce the digit-sum of all digits in YYYYMMDD (without separators) to a single digit 1–9.
8. For lunarMonth and lunarDay, give the approximate traditional lunar calendar equivalent.
9. zodiacAnimal = determined by Chinese New Year of the birth year.
10. heavenlyStem and earthlyBranch in lunarProfile refer to the YEAR pillar stems.

Return ONLY this JSON object — no markdown, no explanation:
{
  "dayMaster": "<Jia|Yi|Bing|Ding|Wu|Ji|Geng|Xin|Ren|Gui>",
  "supportElem": "<Wood|Fire|Earth|Metal|Water>",
  "lifePath": <number 1-9>,
  "birthTime": "${birthTime ?? ''}",
  "lunarProfile": {
    "lunarMonth": <number 1-12>,
    "lunarDay": <number 1-30>,
    "zodiacAnimal": "<Rat|Ox|Tiger|Rabbit|Dragon|Snake|Horse|Goat|Monkey|Rooster|Dog|Pig>",
    "heavenlyStem": "<Jia|Yi|Bing|Ding|Wu|Ji|Geng|Xin|Ren|Gui>",
    "earthlyBranch": "<Zi|Chou|Yin|Mao|Chen|Si|Wu|Wei|Shen|You|Xu|Hai>",
    "hourPillar": ${birthTime ? '{ "heavenlyStem": "<stem>", "earthlyBranch": "<branch>" }' : 'null'}
  }
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]) as BaziProfile;
  } catch (err) {
    console.warn('BaZi AI profile failed, using deterministic fallback:', (err as Error).message);
    return computeFallbackProfile(dob, gender, birthTime);
  }
}
