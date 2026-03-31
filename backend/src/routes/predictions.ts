import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { predictionsLimiter, emailLimiter } from '../middleware/rateLimiters';
import { generatePredictions } from '../agents/prediction';
import { BaziProfile, DrawResult, Strategy } from '../types';
import { getNextDrawDate } from '../services/scraper';
import supabaseAdmin from '../services/supabase';
import { sendGmailEmail } from '../services/gmail';

const router = Router();

const GenerateSchema = z.object({
  // Optional override — must be YYYY-MM-DD if supplied
  drawDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'drawDate must be YYYY-MM-DD')
    .refine(d => new Date(d) >= new Date(new Date().toISOString().split('T')[0]), 'drawDate must not be in the past')
    .optional(),
});

// POST /api/predictions/generate — rate limited: 3 per day per user
router.post('/generate', requireAuth, predictionsLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { drawDate: rawDate } = GenerateSchema.parse(req.body);

    // P7: Run all four independent fetches concurrently instead of sequentially.
    // user_id comes from the auth middleware so no fetch depends on another here.
    const [userRes, nextDraw, historyRes, statsRes] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('bazi_profile_json, favorite_numbers, gender')
        .eq('id', req.user!.id)
        .single(),
      getNextDrawDate(),
      supabaseAdmin
        .from('draws')
        .select('draw_no, draw_date, date, win_nums, winning_numbers, add_num, additional_number')
        .order('draw_date', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('strategy_stats')
        .select('strategy, avg_match')
        .eq('user_id', req.user!.id),
    ]);

    const { data: user, error: userErr } = userRes;
    if (userErr || !user || !user.bazi_profile_json) {
      return res.status(400).json({ error: 'Complete your BaZi profile first' });
    }
    const profile = user.bazi_profile_json as BaziProfile;
    const favoriteNumbers: number[] = Array.isArray(user.favorite_numbers) ? user.favorite_numbers : [];
    const gender: string = user.gender ?? 'M';

    const drawDate = rawDate || nextDraw.toISOString().split('T')[0];

    const history: DrawResult[] = (historyRes.data || []).map((d: any) => ({
      drawNo:           d.draw_no,
      drawDate:         d.draw_date || d.date,
      winningNumbers:   d.win_nums  || String(d.winning_numbers).split(' ').map(Number),
      additionalNumber: d.add_num   ?? Number(d.additional_number),
    }));

    const strategyStats = (statsRes.data || []).map((s: any) => ({
      strategy: s.strategy as Strategy,
      avgMatch: s.avg_match,
    }));

    // Derive next draw number from latest history draw (+1)
    const latestDrawNo = history.find(d => !isNaN(Number(d.drawNo)))?.drawNo;
    const nextDrawNo = latestDrawNo ? Number(latestDrawNo) + 1 : undefined;

    const output = await generatePredictions(profile, drawDate, history, strategyStats, nextDrawNo, favoriteNumbers, gender);

    let { data: draw } = await supabaseAdmin
      .from('draws').select('id').gte('draw_date', drawDate)
      .order('draw_date', { ascending: true }).limit(1).maybeSingle();

    if (!draw) {
      const { data: newDraw, error: drawErr } = await supabaseAdmin
        .from('draws').insert({
          draw_no: `FUTURE-${drawDate}`, date: drawDate, draw_date: drawDate,
          winning_numbers: '', win_nums: [], additional_number: '0', add_num: 0,
        }).select('id').single();
      if (drawErr) throw drawErr;
      draw = newDraw;
    }

    // Batch upsert: 8 strategy rows + 1 lucky_pool row
    const rows = [
      ...output.strategies.map((s: any) => ({
        user_id:    req.user!.id,
        draw_id:    draw!.id,
        strategy:   s.strategy,
        numbers:    s.numbers,
        confidence: s.confidence,
      })),
      {
        user_id:    req.user!.id,
        draw_id:    draw!.id,
        strategy:   'lucky_pool',
        numbers:    output.luckyPool,
        confidence: 1.0,
      },
    ];
    const { error: upsertErr, data: upserted } = await supabaseAdmin
      .from('predictions')
      .upsert(rows, { onConflict: 'user_id,draw_id,strategy' })
      .select('id');
    const savedCount = upsertErr ? 0 : (upserted?.length ?? rows.length);

    return res.json({ ...output, drawId: draw.id, savedCount });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: error.errors });
    console.error('Prediction error:', error);
    return res.status(500).json({ error: 'Failed to generate predictions' });
  }
});

// POST /api/predictions/email — upsert predictions to Supabase and send email to registered user
router.post('/email', requireAuth, emailLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { strategies, luckyPool, drawDate } = req.body as {
      strategies: Array<{ strategy: string; label: string; emoji: string; numbers: number[]; confidence: number }>;
      luckyPool: number[];
      drawDate?: string;
    };

    if (!strategies?.length) {
      return res.status(400).json({ error: 'No prediction data provided' });
    }

    // Get user's registered email
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', req.user!.id)
      .maybeSingle();
    const userEmail = userRow?.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'No registered email found for your account' });
    }

    // Look up the draw row by drawDate so we can upsert predictions
    let drawId: string | null = null;
    if (drawDate) {
      const { data: draw } = await supabaseAdmin
        .from('draws')
        .select('id')
        .gte('draw_date', drawDate)
        .order('draw_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      drawId = draw?.id ?? null;
    }

    // Upsert predictions to Supabase
    let savedCount = 0;
    if (drawId) {
      const rows = [
        ...strategies.map(s => ({
          user_id:    req.user!.id,
          draw_id:    drawId!,
          strategy:   s.strategy,
          numbers:    s.numbers,
          confidence: s.confidence ?? 0,
        })),
        ...(luckyPool?.length ? [{
          user_id:    req.user!.id,
          draw_id:    drawId!,
          strategy:   'lucky_pool',
          numbers:    luckyPool,
          confidence: 1.0,
        }] : []),
      ];
      const { data: upserted, error: upsertErr } = await supabaseAdmin
        .from('predictions')
        .upsert(rows, { onConflict: 'user_id,draw_id,strategy' })
        .select('id');
      savedCount = upsertErr ? 0 : (upserted?.length ?? rows.length);
    }

    // Build HTML email body
    const dateLabel = drawDate
      ? new Date(drawDate).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : 'Next Draw';

    const strategyRows = strategies.map(s =>
      `<tr><td style="padding:6px 12px;">${s.emoji ?? ''} ${s.label ?? s.strategy}</td><td style="padding:6px 12px;font-weight:bold;letter-spacing:2px;">${s.numbers.join(' · ')}</td></tr>`
    ).join('');

    const htmlBody = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a1628;color:#fff;padding:24px;border-radius:12px;">
        <h2 style="color:#f5c518;margin:0 0 4px;">🍀 Lucky7 TOTO AI Predictions</h2>
        <p style="color:#aaa;margin:0 0 20px;">Draw Date: ${dateLabel}</p>
        ${luckyPool?.length ? `
        <div style="background:#1a2840;border-radius:8px;padding:12px;margin-bottom:16px;">
          <p style="color:#f5c518;margin:0 0 8px;font-weight:bold;">🎯 Lucky Pool (3+ consensus)</p>
          <p style="font-size:22px;letter-spacing:4px;margin:0;">${luckyPool.join(' · ')}</p>
        </div>` : ''}
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#1a2840;color:#f5c518;"><th style="padding:8px 12px;text-align:left;">Strategy</th><th style="padding:8px 12px;text-align:left;">Numbers</th></tr>
          ${strategyRows}
        </table>
        <p style="color:#666;font-size:12px;margin-top:20px;">Generated by Lucky7 TOTO AI · For entertainment only</p>
      </div>`;

    // Send email via Gmail OAuth2 (same as AI chat agent)
    let emailSent = false;
    let sendError: string | null = null;
    try {
      await sendGmailEmail(
        userEmail,
        `🍀 Lucky7 TOTO Predictions — ${dateLabel}`,
        htmlBody,
      );
      emailSent = true;
    } catch (gmailErr: any) {
      sendError = gmailErr?.message || 'Gmail send failed';
      console.error('Gmail send error:', gmailErr);
    }

    return res.json({ emailSent, sentTo: userEmail, savedCount, drawId, sendError });
  } catch (error) {
    console.error('Email predictions error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

// GET /api/predictions/:userId
// Note: userId param is ignored — always scoped to the authenticated user
router.get('/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { data: predictions, error } = await supabaseAdmin
      .from('predictions')
      .select('id, strategy, numbers, confidence, draw_id, created_at, draws(id,draw_no,draw_date,win_nums,add_num), matches(match_count,has_additional)')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(predictions || []);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

export default router;
