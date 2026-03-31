import { Router, Request, Response } from 'express';
import { scrapeLatestDraw, getNextDrawDate } from '../services/scraper';
import { fetchDrawLimiter, publicDrawsLimiter } from '../middleware/rateLimiters';
import { requireAuth, AuthRequest } from '../middleware/auth';
import supabaseAdmin from '../services/supabase';

const router = Router();

// Normalise a draws row into a consistent shape for the frontend
function normaliseRow(row: any) {
  return {
    id:               row.id,
    drawNo:           row.draw_no,
    drawDate:         row.draw_date || row.date,
    winningNumbers:   row.win_nums  || (row.winning_numbers ? String(row.winning_numbers).split(' ').map(Number) : []),
    additionalNumber: row.add_num   ?? (row.additional_number ? Number(row.additional_number) : 0),
  };
}

// GET /api/draws/latest
router.get('/latest', publicDrawsLimiter, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('draws')
      .select('*')
      .order('draw_date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    const nextDraw = await getNextDrawDate();
    return res.json({ draw: data ? normaliseRow(data) : null, nextDrawDate: nextDraw.toISOString() });
  } catch (error) {
    console.error('Latest draw error:', error);
    return res.status(500).json({ error: 'Failed to fetch latest draw' });
  }
});

// GET /api/draws/history?limit=50
router.get('/history', publicDrawsLimiter, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const { data, error } = await supabaseAdmin
      .from('draws')
      .select('*')
      .order('draw_date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return res.json((data || []).map(normaliseRow));
  } catch (error) {
    console.error('Draw history error:', error);
    return res.status(500).json({ error: 'Failed to fetch draw history' });
  }
});

// POST /api/draws/fetch — auth required + rate limited: 5 per hour
router.post('/fetch', requireAuth as any, fetchDrawLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const result = await scrapeLatestDraw();
    if (!result) return res.status(503).json({ error: 'Scraper unavailable' });

    const { data, error } = await supabaseAdmin
      .from('draws')
      .upsert({
        draw_no:           result.drawNo,
        date:              result.drawDate,
        draw_date:         result.drawDate,
        winning_numbers:   result.winningNumbers.join(' '),
        win_nums:          result.winningNumbers,
        additional_number: String(result.additionalNumber),
        add_num:           result.additionalNumber,
        fetched_at:        new Date().toISOString(),
      }, { onConflict: 'draw_no' })
      .select()
      .single();

    if (error) throw error;
    return res.json({ draw: normaliseRow(data), message: 'Draw fetched and stored' });
  } catch (error) {
    console.error('Fetch draw error:', error);
    return res.status(500).json({ error: 'Failed to fetch draw' });
  }
});

export default router;
