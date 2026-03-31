/**
 * One-time backfill script: generates 8 strategy predictions for all draws
 * from #4114 (2025-09-18) to #4166 (2026-03-19) for every user in Supabase.
 *
 * Run: npx ts-node --transpile-only scripts/backfill-predictions.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { runAllStrategies } from '../src/strategies';
import { BaziProfile, DrawResult } from '../src/types';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } }
);

const FIRST_TARGET_DRAW = 4114;
const LAST_TARGET_DRAW = 4166;
const HISTORY_START_DRAW = 4100; // fetch a few extra earlier draws for context

async function main() {
  console.log('Fetching draws...');
  const { data: allDraws, error: drawsError } = await supabaseAdmin
    .from('draws')
    .select('id, draw_no, draw_date, win_nums, add_num')
    .gte('draw_no', HISTORY_START_DRAW)
    .lte('draw_no', LAST_TARGET_DRAW)
    .order('draw_date', { ascending: true });

  if (drawsError || !allDraws) {
    console.error('Failed to fetch draws:', drawsError?.message);
    process.exit(1);
  }

  const targetDraws = allDraws.filter(
    (d) => d.draw_no >= FIRST_TARGET_DRAW && !String(d.draw_no).startsWith('FUTURE')
  );
  console.log(`Found ${targetDraws.length} target draws, ${allDraws.length} total (incl history)`);

  console.log('Fetching users...');
  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, bazi_profile_json');

  if (usersError || !users) {
    console.error('Failed to fetch users:', usersError?.message);
    process.exit(1);
  }
  console.log(`Found ${users.length} user(s)`);

  let totalUpserted = 0;
  let totalErrors = 0;

  for (const draw of targetDraws) {
    // Build history: all draws strictly before this draw's date
    const history: DrawResult[] = allDraws
      .filter((d) => new Date(d.draw_date) < new Date(draw.draw_date))
      .map((d) => ({
        drawNo: String(d.draw_no),
        drawDate: d.draw_date,
        winningNumbers: d.win_nums ?? [],
        additionalNumber: d.add_num ?? 0,
      }));

    for (const user of users) {
      const profile: BaziProfile = (user.bazi_profile_json as BaziProfile) ?? ({} as BaziProfile);

      const results = runAllStrategies(profile, draw.draw_date, history);

      const rows = results.map((s) => ({
        user_id: user.id,
        draw_id: draw.id,
        strategy: s.strategy,
        numbers: s.numbers,
        confidence: s.confidence,
      }));

      const { error } = await supabaseAdmin
        .from('predictions')
        .upsert(rows, { onConflict: 'user_id,draw_id,strategy' });

      if (error) {
        console.error(`  ERROR draw #${draw.draw_no} user ${user.id}: ${error.message}`);
        totalErrors++;
      } else {
        totalUpserted += rows.length;
      }
    }

    console.log(`Done draw #${draw.draw_no} (${draw.draw_date})`);
  }

  console.log(`\nBackfill complete. Upserted: ${totalUpserted} rows, Errors: ${totalErrors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
