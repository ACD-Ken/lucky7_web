import axios from 'axios';
import * as cheerio from 'cheerio';
import { DrawResult } from '../types';

const SINGAPORE_POOLS_URL = 'https://www.singaporepools.com.sg/en/product/Pages/toto_results.aspx';

export async function scrapeLatestDraw(): Promise<DrawResult | null> {
  try {
    const response = await axios.get(SINGAPORE_POOLS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Lucky7Bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const result = parseDrawPage($);
    return result;
  } catch (error) {
    console.error('Scraper error:', error);
    // Return mock data in dev mode if scraper fails
    if (process.env.NODE_ENV === 'development') {
      return getMockDrawResult();
    }
    return null;
  }
}

function parseDrawPage($: cheerio.CheerioAPI): DrawResult | null {
  try {
    // Singapore Pools TOTO result selectors (adjust if their HTML changes)
    const drawNo = $('.drawNumber').first().text().trim() ||
                   $('[class*="draw-no"]').first().text().trim();

    const drawDate = $('.drawDate').first().text().trim() ||
                     $('[class*="draw-date"]').first().text().trim();

    const numbers: number[] = [];
    $('[class*="winNum"], .win-num, .winning-number').each((_, el) => {
      const n = parseInt($(el).text().trim(), 10);
      if (!isNaN(n) && numbers.length < 6) numbers.push(n);
    });

    const additionalText = $('[class*="additional"], .add-num').first().text().trim();
    const additionalNumber = parseInt(additionalText, 10) || 0;

    if (numbers.length === 6) {
      return {
        drawNo: drawNo || `AUTO-${Date.now()}`,
        drawDate: drawDate || new Date().toISOString(),
        winningNumbers: numbers,
        additionalNumber,
      };
    }

    return getMockDrawResult();
  } catch {
    return getMockDrawResult();
  }
}

function getMockDrawResult(): DrawResult {
  // Realistic mock for development/testing
  const nums = getRandomUnique(6, 1, 49);
  const pool = Array.from({ length: 49 }, (_, i) => i + 1).filter(n => !nums.includes(n));
  const additional = pool[Math.floor(Math.random() * pool.length)];
  return {
    drawNo: `DEV-${Date.now()}`,
    drawDate: new Date().toISOString(),
    winningNumbers: nums,
    additionalNumber: additional,
  };
}

function getRandomUnique(count: number, min: number, max: number): number[] {
  const set = new Set<number>();
  while (set.size < count) {
    set.add(Math.floor(Math.random() * (max - min + 1)) + min);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export async function getNextDrawDate(): Promise<Date> {
  const now = new Date();
  // TOTO draws every Monday (1) and Thursday (4) at 21:30 SGT (UTC+8)
  const sgNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const day = sgNow.getUTCDay();
  const hour = sgNow.getUTCHours();
  const minute = sgNow.getUTCMinutes();

  const drawDays = [1, 4]; // Monday = 1, Thursday = 4
  const drawHour = 21;
  const drawMinute = 30;

  // Find next draw day
  for (let offset = 0; offset <= 7; offset++) {
    const checkDay = (day + offset) % 7;
    if (drawDays.includes(checkDay)) {
      if (offset === 0 && (hour > drawHour || (hour === drawHour && minute >= drawMinute))) {
        continue; // Already past today's draw
      }
      const next = new Date(sgNow);
      next.setUTCDate(next.getUTCDate() + offset);
      next.setUTCHours(drawHour, drawMinute, 0, 0);
      // Convert back to local time
      return new Date(next.getTime() - 8 * 60 * 60 * 1000);
    }
  }

  // Fallback: next Thursday
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 3);
  fallback.setHours(21, 30, 0, 0);
  return fallback;
}
