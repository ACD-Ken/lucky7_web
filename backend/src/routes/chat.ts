import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { chatLimiter } from '../middleware/rateLimiters';
import { chatWithAI, ChatMessage } from '../agents/chat';
import { BaziProfile, StrategyResult } from '../types';
import supabaseAdmin from '../services/supabase';

const router = Router();

const MessageSchema = z.object({
  message: z.string().min(1).max(2000),
});

// POST /api/chat/message — rate limited: 20 per 15 min
router.post('/message', requireAuth, chatLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { message } = MessageSchema.parse(req.body);
    const userId = req.user!.id;

    // Fetch user, chat history, and latest predictions concurrently
    const [userRes, historyRes, predRes] = await Promise.all([
      supabaseAdmin.from('users').select('bazi_profile_json').eq('id', userId).single(),
      supabaseAdmin.from('chat_messages').select('role, content').eq('user_id', userId)
        .order('created_at', { ascending: true }).limit(20),
      supabaseAdmin.from('predictions').select('strategy, numbers, confidence')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(6),
    ]);

    if (userRes.error || !userRes.data?.bazi_profile_json) {
      return res.status(400).json({ error: 'Complete your BaZi profile first' });
    }
    const profile = userRes.data.bazi_profile_json as BaziProfile;

    const history: ChatMessage[] = (historyRes.data || []).map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const latestPredictions: StrategyResult[] = (predRes.data || []).map((p: any) => ({
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

    // Get AI response
    const response = await chatWithAI(message, history, profile, latestPredictions);

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
    console.error('Chat error:', error);
    return res.status(500).json({ error: 'Chat failed' });
  }
});

// GET /api/chat/history
router.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const userId = req.user!.id;

    const { data: messages, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    // Normalise field names to match what the frontend expects
    const normalised = (messages || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    }));

    return res.json(normalised);
  } catch (error) {
    console.error('Chat history error:', error);
    return res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

export default router;
