import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { emailLimiter } from '../middleware/rateLimiters';
import { generate4DSuggestions, getIBetPermutations, getIBetType, getNext4DDrawDate, getDrawDatesInNext7Days, FourDSuggestion } from '../strategies/fourD';
import { BaziProfile } from '../types';
import supabaseAdmin from '../services/supabase';
import { sendGmailEmail } from '../services/gmail';

const router = Router();

// Rate limiter: 10 generates per hour per user
const fourDLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req: any) => req.user?.id || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Hourly limit reached. You can generate 4D numbers up to 10 times per hour.' },
});

// ── POST /api/4d/generate ─────────────────────────────────────────────────────
router.post('/generate', requireAuth, fourDLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('bazi_profile_json')
      .eq('id', userId)
      .single();

    if (userErr || !user?.bazi_profile_json) {
      return res.status(400).json({ error: 'Complete your BaZi profile first.' });
    }

    const profile = user.bazi_profile_json as BaziProfile;

    if (!profile.supportElem || !profile.lifePath || !profile.lunarProfile) {
      return res.status(400).json({ error: 'BaZi profile is incomplete.' });
    }

    const { date: drawDate } = getNext4DDrawDate();
    const result = generate4DSuggestions(profile, drawDate, 1);
    return res.json(result);
  } catch (error) {
    console.error('[4D] Generation error:', error);
    return res.status(500).json({ error: 'Failed to generate 4D numbers.' });
  }
});

// ── POST /api/4d/generate-week ───────────────────────────────────────────────
// Returns one BaZi-derived 4D number for each draw in the next 7 days (up to 3)
router.post('/generate-week', requireAuth, fourDLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('bazi_profile_json')
      .eq('id', userId)
      .single();

    if (userErr || !user?.bazi_profile_json) {
      return res.status(400).json({ error: 'Complete your BaZi profile first.' });
    }

    const profile = user.bazi_profile_json as BaziProfile;
    if (!profile.supportElem || !profile.lifePath || !profile.lunarProfile) {
      return res.status(400).json({ error: 'BaZi profile is incomplete.' });
    }

    const drawDates = getDrawDatesInNext7Days();
    const results = drawDates.map(({ date }) => generate4DSuggestions(profile, date, 1));

    return res.json({ draws: results });
  } catch (error) {
    console.error('[4D] Week generation error:', error);
    return res.status(500).json({ error: 'Failed to generate 4D numbers.' });
  }
});

// ── POST /api/4d/email ────────────────────────────────────────────────────────
router.post('/email', requireAuth, emailLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const {
      suggestions,
      pairDigit,
      element,
      drawDate,
      drawDay,
    } = req.body as {
      suggestions: FourDSuggestion[];
      pairDigit: number;
      element: string;
      drawDate: string;
      drawDay: string;
    };

    if (!suggestions?.length) {
      return res.status(400).json({ error: 'No 4D data provided.' });
    }

    // Get user's registered email
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', req.user!.id)
      .maybeSingle();

    const userEmail = userRow?.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'No registered email found for your account.' });
    }

    // Format draw date label
    const dateLabel = drawDate
      ? new Date(drawDate + 'T00:00:00+08:00').toLocaleDateString('en-SG', {
          weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
        })
      : drawDay ?? 'Next Draw';

    // Build HTML rows for each suggestion (with permutations)
    const suggestionRows = suggestions.map((s, i) => {
      const digits  = s.number.split('');
      const pairSet = new Set<number>(s.pairPositions);
      const perms   = getIBetPermutations(s.number);
      const { ibetType, permCount } = getIBetType(s.number);

      const digitCells = digits.map((d, idx) => {
        const isPair = pairSet.has(idx);
        return `<span style="display:inline-block;width:36px;height:42px;line-height:42px;text-align:center;border-radius:8px;font-size:22px;font-weight:800;margin:0 3px;${
          isPair
            ? 'background:#f5c518;color:#0a1628;'
            : 'background:#1e2d6b;color:#fff;border:1px solid #2d3f8f;'
        }">${d}</span>`;
      }).join('');

      const permGrid = perms.map(p =>
        `<span style="display:inline-block;width:54px;padding:4px 0;text-align:center;background:rgba(255,255,255,0.06);border-radius:6px;margin:2px;font-size:13px;letter-spacing:1px;color:#9ca3af;">${p}</span>`
      ).join('');

      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #1e2d6b;">
            <div style="margin-bottom:4px;font-size:11px;color:#f5c518;font-weight:700;">#${i + 1} &nbsp;
              <span style="border:1px solid #f5c518;border-radius:6px;padding:1px 6px;font-size:10px;">${ibetType} · ${permCount} combo${permCount > 1 ? 's' : ''}</span>
            </div>
            <div style="margin-bottom:6px;">${digitCells}</div>
            <div style="font-size:12px;color:#4b5563;margin-bottom:8px;">I-Ching Hexagram #${s.hexagramNo}</div>
            <div>${permGrid}</div>
          </td>
        </tr>`;
    }).join('');

    const htmlBody = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a1628;color:#fff;padding:24px;border-radius:12px;">
        <h2 style="color:#f5c518;margin:0 0 4px;">🎯 Lucky7 4D Lucky Generator</h2>
        <p style="color:#aaa;margin:0 0 6px;">Draw: <strong style="color:#fff;">${dateLabel}</strong> · 5:55 PM SGT</p>
        <p style="color:#aaa;margin:0 0 20px;font-size:13px;">BaZi pair digit: <strong style="color:#f5c518;">${pairDigit}</strong> &nbsp;·&nbsp; Element: <strong style="color:#f5c518;">${element}</strong></p>

        <div style="background:#12194a;border-radius:10px;padding:12px 16px;margin-bottom:20px;border:1px solid rgba(245,197,24,0.25);">
          <span style="color:#9ca3af;font-size:12px;">BaZi Analysis</span><br/>
          <span style="font-size:15px;">Element: <strong style="color:#f5c518;">${element}</strong></span>
          &nbsp;&nbsp;
          <span style="font-size:15px;">Lucky Pair Digit: <strong style="color:#f5c518;font-size:26px;">${pairDigit}</strong></span>
        </div>

        <table style="width:100%;border-collapse:collapse;background:#12194a;border-radius:10px;overflow:hidden;border:1px solid rgba(245,197,24,0.12);">
          ${suggestionRows}
        </table>

        <p style="color:#374151;font-size:11px;margin-top:20px;text-align:center;">
          For entertainment only · Singapore Pools 4D is a registered lottery<br/>
          Generated by Lucky7 TOTO AI
        </p>
      </div>`;

    let emailSent = false;
    let sendError: string | null = null;
    try {
      await sendGmailEmail(
        userEmail,
        `🎯 Lucky7 4D Numbers — ${dateLabel}`,
        htmlBody,
      );
      emailSent = true;
    } catch (gmailErr: any) {
      sendError = gmailErr?.message || 'Gmail send failed';
      console.error('[4D] Gmail send error:', gmailErr);
    }

    return res.json({ emailSent, sentTo: userEmail, sendError });
  } catch (error) {
    console.error('[4D] Email error:', error);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
});

export default router;
