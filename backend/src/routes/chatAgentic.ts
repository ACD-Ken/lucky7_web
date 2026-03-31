import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { chatLimiter } from '../middleware/rateLimiters';
import { chatAgenticWithAI } from '../agents/chatAgentic';
import { BaziProfile, StrategyResult } from '../types';
import supabaseAdmin from '../services/supabase';

const router = Router();

const MessageSchema = z.object({
  message: z.string().min(1).max(2000),
});

// POST /api/chat/agentic/message — agentic Claude with tool use + email
// Rate limited: same chatLimiter as original (20 per 15 min)
router.post('/message', requireAuth, chatLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { message } = MessageSchema.parse(req.body);
    const userId = req.user!.id;

    // Fetch user + BaZi profile
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (userErr || !user || !user.bazi_profile_json) {
      return res.status(400).json({ error: 'Complete your BaZi profile first' });
    }
    const profile = user.bazi_profile_json as BaziProfile;

    // Fetch last 20 chat messages for context
    const { data: historyRaw } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(20);
    const history = (historyRaw || []).map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
    }));

    // Fetch latest predictions for system prompt context
    const { data: latestPredRaw } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(6);
    const latestPredictions: StrategyResult[] = (latestPredRaw || []).map((p: any) => ({
      strategy: p.strategy as any,
      numbers: p.numbers,
      confidence: p.confidence,
      label: p.strategy,
      emoji: '🔮',
    }));

    // Save user message
    await supabaseAdmin.from('chat_messages').insert({
      user_id: userId,
      role: 'user',
      content: message,
    });

    // Run agentic chat (tools + email support)
    const response = await chatAgenticWithAI(
      message,
      history,
      profile,
      latestPredictions,
      userId,
      supabaseAdmin
    );

    // Save assistant response
    await supabaseAdmin.from('chat_messages').insert({
      user_id: userId,
      role: 'assistant',
      content: response,
    });

    return res.json({ response });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Agentic chat error:', error);
    return res.status(500).json({ error: 'Chat failed' });
  }
});

export default router;
