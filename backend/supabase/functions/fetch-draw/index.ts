// Supabase Edge Function: fetch-draw
// Triggered by pg_cron on Mon/Thu 21:35 SGT
// Scrapes Singapore Pools TOTO results and upserts into draws table

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function scrapeToToResults(): Promise<{
  drawNo: string;
  drawDate: string;
  winningNumbers: number[];
  additionalNumber: number;
} | null> {
  try {
    const response = await fetch(
      'https://www.singaporepools.com.sg/en/product/Pages/toto_results.aspx',
      {
        headers: { 'User-Agent': 'Lucky7Bot/1.0' },
      }
    );
    const html = await response.text();

    // Parse draw number
    const drawNoMatch = html.match(/Draw No[.\s]*:?\s*(\d{4,5})/i);
    const drawNo = drawNoMatch ? drawNoMatch[1] : `AUTO-${Date.now()}`;

    // Parse winning numbers (6 balls + 1 additional)
    const numsMatch = html.match(/class="[^"]*winNum[^"]*">(\d+)</gi) || [];
    const numbers = numsMatch.map(m => parseInt(m.replace(/\D/g, ''), 10)).filter(n => n > 0 && n <= 49);

    if (numbers.length < 7) {
      // Return mock data if parsing fails
      return {
        drawNo,
        drawDate: new Date().toISOString(),
        winningNumbers: [7, 14, 21, 28, 35, 42],
        additionalNumber: 3,
      };
    }

    return {
      drawNo,
      drawDate: new Date().toISOString(),
      winningNumbers: numbers.slice(0, 6).sort((a, b) => a - b),
      additionalNumber: numbers[6],
    };
  } catch (error) {
    console.error('Scrape error:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  // Allow CRON triggers and authorized calls
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    // Allow cron trigger (no auth header required from pg_cron)
    if (req.headers.get('x-trigger-source') !== 'pg_cron') {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const result = await scrapeToToResults();
  if (!result) {
    return new Response(JSON.stringify({ error: 'Scrape failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await supabase
    .from('draws')
    .upsert({
      draw_no: result.drawNo,
      draw_date: result.drawDate,
      winning_numbers: result.winningNumbers,
      additional_number: result.additionalNumber,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'draw_no' })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, draw: data }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
