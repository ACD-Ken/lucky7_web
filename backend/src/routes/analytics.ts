import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { generateWeeklyInsight, StrategyPerformance } from '../agents/analytics';
import { BaziProfile, Strategy, STRATEGIES } from '../types';
import { runAllStrategies } from '../strategies';
import supabaseAdmin from '../services/supabase';

const router = Router();

// GET /api/analytics/:userId
router.get('/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.params.userId !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    // Fetch user profile and strategy stats concurrently — they're independent.
    const [userRes, statsRes] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('bazi_profile_json')   // only column needed
        .eq('id', req.user!.id)
        .single(),
      supabaseAdmin
        .from('strategy_stats')
        .select('strategy, avg_match, max_match, total_draws')
        .eq('user_id', req.user!.id),
    ]);

    if (userRes.error || !userRes.data) return res.status(404).json({ error: 'User not found' });
    const profile = userRes.data.bazi_profile_json as BaziProfile;

    // Use Map for O(1) lookup instead of O(n) find per strategy
    const statsRaw = statsRes.data || [];
    const statsLookup = new Map(statsRaw.map((s: any) => [s.strategy, s]));
    const stats: StrategyPerformance[] = STRATEGIES.map(strategy => {
      const raw = statsLookup.get(strategy);
      return {
        strategy,
        avgMatch:   raw?.avg_match   ?? 0,
        maxMatch:   raw?.max_match   ?? 0,
        totalDraws: raw?.total_draws ?? 0,
        trend:      'stable' as const,
      };
    });

    const insight = await generateWeeklyInsight(profile, stats.filter(s => s.totalDraws > 0));
    return res.json({ stats, insight, userId: req.user!.id });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ error: 'Failed to generate analytics' });
  }
});

const ScoreDrawSchema = z.object({
  drawId: z.string().uuid('drawId must be a valid UUID'),
});

// POST /api/analytics/score-draw
router.post('/score-draw', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { drawId } = ScoreDrawSchema.parse(req.body);

    const { data: draw, error: drawErr } = await supabaseAdmin
      .from('draws').select('win_nums, add_num').eq('id', drawId).single();
    if (drawErr || !draw || !draw.win_nums?.length) {
      return res.status(400).json({ error: 'Draw not yet available or no results' });
    }

    const winNums: number[] = draw.win_nums;
    const addNum: number    = draw.add_num;

    // Fetch user predictions for this draw
    const { data: predictions } = await supabaseAdmin
      .from('predictions')
      .select('id, strategy, numbers')
      .eq('user_id', req.user!.id)
      .eq('draw_id', drawId);

    if (!predictions || predictions.length === 0) {
      return res.json({ results: [], drawId, scoredAt: new Date().toISOString() });
    }

    // ── Step 1: Compute all match results in memory (no DB needed) ────────────
    const results = predictions.map((p: any) => ({
      predictionId: p.id,
      strategy:     p.strategy as Strategy,
      matchCount:   (p.numbers as number[]).filter(n => winNums.includes(n)).length,
      hasAdditional:(p.numbers as number[]).includes(addNum),
    }));

    // ── Step 2: Batch fetch existing strategy_stats + batch upsert matches ───
    // P9: Both are independent at this point — run them concurrently.
    const [, statsRes] = await Promise.all([
      // P9a: Single upsert for all matches rows (was N separate upserts)
      supabaseAdmin.from('matches').upsert(
        results.map(r => ({
          prediction_id: r.predictionId,
          match_count:   r.matchCount,
          has_additional: r.hasAdditional,
        })),
        { onConflict: 'prediction_id' }
      ),
      // P9b: Single fetch for all strategy_stats (was N separate selects)
      supabaseAdmin
        .from('strategy_stats')
        .select('strategy, avg_match, max_match, total_draws')
        .eq('user_id', req.user!.id),
    ]);

    // ── Step 3: Compute updated stats in memory using a Map ───────────────────
    const statsMap = new Map<Strategy, { avg_match: number; max_match: number; total_draws: number }>(
      (statsRes.data || []).map((s: any) => [s.strategy as Strategy, s])
    );

    const updatedStats = results.map(r => {
      const existing = statsMap.get(r.strategy);
      if (existing) {
        const newTotal = existing.total_draws + 1;
        const newAvg   = (existing.avg_match * existing.total_draws + r.matchCount) / newTotal;
        return {
          user_id:     req.user!.id,
          strategy:    r.strategy,
          avg_match:   newAvg,
          max_match:   Math.max(existing.max_match, r.matchCount),
          total_draws: newTotal,
        };
      }
      return {
        user_id:     req.user!.id,
        strategy:    r.strategy,
        avg_match:   r.matchCount,
        max_match:   r.matchCount,
        total_draws: 1,
      };
    });

    // ── Step 4: Single batch upsert for all strategy_stats ───────────────────
    // P9c: Was N separate update/insert calls (one per prediction)
    if (updatedStats.length > 0) {
      await supabaseAdmin
        .from('strategy_stats')
        .upsert(updatedStats, { onConflict: 'user_id,strategy' });
    }

    return res.json({
      results: results.map(r => ({ strategy: r.strategy, matchCount: r.matchCount, hasAdditional: r.hasAdditional })),
      drawId,
      scoredAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: error.errors });
    console.error('Score draw error:', error);
    return res.status(500).json({ error: 'Failed to score draw' });
  }
});

// POST /api/analytics/backtest — simulate strategies against all historical draws
router.post('/backtest', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { data: user } = await supabaseAdmin
      .from('users').select('bazi_profile_json').eq('id', req.user!.id).single();
    if (!user || !user.bazi_profile_json) {
      return res.status(400).json({ error: 'Complete your BaZi profile first' });
    }
    const profile = user.bazi_profile_json as BaziProfile;

    // Fetch all draws with real results (skip FUTURE draws)
    const { data: allDraws } = await supabaseAdmin
      .from('draws').select('draw_no, draw_date, date, win_nums, winning_numbers, add_num, additional_number')
      .order('draw_date', { ascending: true })
      .limit(100);

    const validDraws = (allDraws || []).filter((d: any) =>
      d.win_nums?.length > 0 && !String(d.draw_no).startsWith('FUTURE')
    );

    if (validDraws.length === 0) {
      return res.json({ message: 'No historical draws with results found', scored: 0 });
    }

    // Accumulate stats per strategy
    const acc: Record<Strategy, { total: number; max: number; count: number }> = {
      bazi:          { total: 0, max: 0, count: 0 },
      frequency:     { total: 0, max: 0, count: 0 },
      gap:           { total: 0, max: 0, count: 0 },
      numerology:    { total: 0, max: 0, count: 0 },
      lunar:         { total: 0, max: 0, count: 0 },
      iching:        { total: 0, max: 0, count: 0 },
      deterministic: { total: 0, max: 0, count: 0 },
      hybrid:        { total: 0, max: 0, count: 0 },
      deepseek:      { total: 0, max: 0, count: 0 },
    };

    for (let i = 0; i < validDraws.length; i++) {
      const draw = validDraws[i];
      const drawDate = (draw.draw_date || draw.date || '').split('T')[0];
      // Use draws BEFORE this one as history for the strategies
      const history = validDraws.slice(0, i).map((d: any) => ({
        drawNo: d.draw_no,
        drawDate: d.draw_date || d.date,
        winningNumbers: d.win_nums || String(d.winning_numbers || '').split(' ').map(Number).filter(Boolean),
        additionalNumber: d.add_num ?? Number(d.additional_number || 0),
      }));

      const strategies = await runAllStrategies(profile, drawDate, history);
      const winNums: number[] = draw.win_nums;

      for (const s of strategies) {
        const matchCount = s.numbers.filter((n: number) => winNums.includes(n)).length;
        const stat = acc[s.strategy as Strategy];
        stat.total += matchCount;
        stat.max = Math.max(stat.max, matchCount);
        stat.count++;
      }
    }

    // Upsert strategy_stats for this user
    await Promise.all(
      STRATEGIES.map(strategy => {
        const stat = acc[strategy];
        const avgMatch = stat.count > 0 ? stat.total / stat.count : 0;
        return supabaseAdmin.from('strategy_stats').upsert({
          user_id: req.user!.id,
          strategy,
          avg_match: parseFloat(avgMatch.toFixed(4)),
          max_match: stat.max,
          total_draws: stat.count,
        }, { onConflict: 'user_id,strategy' });
      })
    );

    return res.json({
      message: `Backtested all 8 strategies against ${validDraws.length} historical draws`,
      scored: validDraws.length,
    });
  } catch (error) {
    console.error('Backtest error:', error);
    return res.status(500).json({ error: 'Backtest failed' });
  }
});

export default router;
