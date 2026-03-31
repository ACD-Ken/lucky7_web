import axios from 'axios';
import { BaziProfile, StrategyResult } from '../types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function deepseekBaziStrategy(
  profile: BaziProfile,
  drawDate: string,
  favoriteNumbers: number[],
  gender: string
): Promise<StrategyResult> {
  const fallback = (): StrategyResult => ({
    strategy: 'deepseek',
    label: 'DeepSeek AI',
    emoji: '🤖',
    numbers: [...favoriteNumbers].sort((a, b) => a - b).slice(0, 6),
    confidence: 0.70,
  });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[DeepSeek] DEEPSEEK_API_KEY not set — using fallback');
    return fallback();
  }

  // Sanitize before prompt inclusion — prevent prompt injection via stored favorite numbers
  const safeNums = favoriteNumbers
    .map(n => Math.floor(Number(n)))
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 49)
    .slice(0, 12);

  const prompt = `You are a BaZi (Four Pillars of Destiny) numerology expert helping select lottery numbers.

User BaZi Profile:
- Day Master: ${profile.dayMaster}
- Support Element: ${profile.supportElem}
- Life Path Number: ${profile.lifePath}
- Zodiac Animal: ${profile.lunarProfile.zodiacAnimal}
- Heavenly Stem: ${profile.lunarProfile.heavenlyStem}
- Earthly Branch: ${profile.lunarProfile.earthlyBranch}
- Gender: ${gender === 'M' ? 'Male' : 'Female'}

Coming Draw Date: ${drawDate}

User's 12 Favorite Numbers: ${safeNums.join(', ')}

Using BaZi principles — element compatibility, lucky numbers for the Day Master, lunar energy of the draw date, and numerological resonance — select exactly 6 numbers from the 12 favorites above that best align with this person's destiny chart for the draw date.

Respond with ONLY a JSON array of 6 integers, no explanation. Example: [3, 15, 22, 31, 40, 47]`;

  try {
    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 60,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const content: string = response.data?.choices?.[0]?.message?.content?.trim() ?? '';

    // Extract JSON array from response
    const match = content.match(/\[[\d,\s]+\]/);
    if (!match) {
      console.warn('[DeepSeek] No JSON array in response:', content);
      return fallback();
    }

    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length !== 6) {
      console.warn('[DeepSeek] Invalid array length:', parsed);
      return fallback();
    }

    const numbers = (parsed as number[]).map(Number);

    // Validate all 6 are within the sanitized favorites
    const favSet = new Set(safeNums);
    const allValid = numbers.every(n => Number.isInteger(n) && favSet.has(n));
    if (!allValid) {
      console.warn('[DeepSeek] Numbers outside favorites:', numbers, favoriteNumbers);
      return fallback();
    }

    return {
      strategy: 'deepseek',
      label: 'DeepSeek AI',
      emoji: '🤖',
      numbers: numbers.sort((a, b) => a - b),
      confidence: 0.75,
    };
  } catch (err: any) {
    console.error('[DeepSeek] API error:', err?.message ?? err);
    return fallback();
  }
}
