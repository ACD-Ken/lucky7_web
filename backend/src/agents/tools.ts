import OpenAI from 'openai';
import sanitizeHtml from 'sanitize-html';
import { SupabaseClient } from '@supabase/supabase-js';
import { generatePredictions } from './prediction';
import { scoreAllPredictions } from './results';
import { getNextDrawDate } from '../services/scraper';
import { sendGmailEmail } from '../services/gmail';
import { BaziProfile, DrawResult, Strategy } from '../types';

// Allowed HTML tags/attributes for AI-generated email content
const EMAIL_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'i', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li', 'h2', 'h3', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div'],
  allowedAttributes: {
    '*': ['style'],
  },
  allowedStyles: {
    '*': {
      color:            [/^#[0-9a-fA-F]{3,6}$/, /^[a-z]+$/],
      'background-color': [/^#[0-9a-fA-F]{3,6}$/, /^[a-z]+$/],
      'font-weight':    [/^(bold|normal|\d+)$/],
      'font-size':      [/^\d+(px|em|rem|%)$/],
      'text-align':     [/^(left|center|right)$/],
      padding:          [/^\d+(px|em)( \d+(px|em)){0,3}$/],
      margin:           [/^\d+(px|em)( \d+(px|em)){0,3}$/],
    },
  },
};

// ─── Tool Definitions (OpenAI / DeepSeek format) ─────────────────────────────

export const LUCKY7_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_next_draw_date',
      description:
        'Get the date of the next scheduled TOTO draw. TOTO draws are held every Monday and Thursday at 9:30 PM Singapore time. Always call this before generate_prediction if you do not already know the next draw date.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_prediction',
      description:
        'Generate TOTO number predictions for a specific draw date using all 8 strategies (BaZi, Frequency, Gap, Numerology, Lunar, I-Ching, Deterministic, Hybrid) and compute the lucky pool. Call this when the user wants lucky numbers or predictions for an upcoming draw.',
      parameters: {
        type: 'object',
        properties: {
          draw_date: {
            type: 'string',
            description: 'Draw date in YYYY-MM-DD format. Use get_next_draw_date first if unknown.',
          },
        },
        required: ['draw_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_latest_draw',
      description:
        'Get the most recent TOTO draw result including winning numbers and additional number. Call this when the user asks about the latest draw or what numbers came out last time.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_draw_history',
      description:
        'Get past TOTO draw results. Call this when the user asks about recent draws, historical results, or number frequency trends.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of past draws to return (1-50, default 10)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_predictions',
      description:
        "Get the user's recent prediction history showing which numbers were predicted for past draws.",
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of past predictions to return (1-20, default 5)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'score_my_predictions',
      description:
        "Score the user's predictions against a specific completed draw to see how many numbers matched. Call this when the user asks how they did, how their predictions scored, or how many matches they got. Requires a draw_id — use get_latest_draw first to obtain it.",
      parameters: {
        type: 'object',
        properties: {
          draw_id: {
            type: 'string',
            description: 'UUID of the draw to score against. Get this from get_latest_draw or get_draw_history.',
          },
        },
        required: ['draw_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_analytics',
      description:
        "Get the user's strategy performance statistics: average matches, max matches, and total draws scored per strategy. Call this when the user asks which strategy works best, their performance history, or analytics.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email_summary',
      description:
        "Send an email summary to the user at their registered email address. Call this ONLY when the user explicitly asks to be emailed (e.g., 'email me', 'send me a summary'). You may OFFER to email after predictions/results but do NOT send without the user confirming. Max 10 emails per week per user is enforced automatically.",
      parameters: {
        type: 'object',
        properties: {
          email_type: {
            type: 'string',
            enum: ['prediction', 'results', 'analytics', 'general'],
            description: 'Type of email content',
          },
          subject: {
            type: 'string',
            description: 'Email subject line, concise and under 60 chars',
          },
          html_content: {
            type: 'string',
            description:
              'HTML body of the email. Include all key data (lucky numbers, match results, strategy breakdown) formatted clearly with basic HTML tags.',
          },
        },
        required: ['email_type', 'subject', 'html_content'],
      },
    },
  },
];

// ─── Tool Executor ────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<unknown> {
  switch (toolName) {

    // ── get_next_draw_date ──────────────────────────────────────────────────
    case 'get_next_draw_date': {
      const nextDraw = await getNextDrawDate();
      return {
        nextDrawDate: nextDraw.toISOString().split('T')[0],
        drawTime: '21:30 SGT (Singapore Time)',
        note: 'TOTO draws occur every Monday and Thursday',
      };
    }

    // ── generate_prediction ─────────────────────────────────────────────────
    case 'generate_prediction': {
      const drawDate = String(toolInput.draw_date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) {
        return { error: 'draw_date must be in YYYY-MM-DD format' };
      }

      const [userRes, historyRes, statsRes] = await Promise.all([
        supabase.from('users').select('bazi_profile_json').eq('id', userId).single(),
        supabase
          .from('draws')
          .select('draw_no, draw_date, win_nums, add_num')
          .order('draw_date', { ascending: false })
          .limit(50),
        supabase.from('strategy_stats').select('strategy, avg_match').eq('user_id', userId),
      ]);

      if (userRes.error || !userRes.data?.bazi_profile_json) {
        return { error: 'BaZi profile not found — please complete your profile first' };
      }

      const profile = userRes.data.bazi_profile_json as BaziProfile;
      const history: DrawResult[] = (historyRes.data || []).map((d: any) => ({
        drawNo: String(d.draw_no),
        drawDate: String(d.draw_date),
        winningNumbers: Array.isArray(d.win_nums) ? d.win_nums : [],
        additionalNumber: Number(d.add_num ?? 0),
      }));
      const strategyStats = (statsRes.data || []).map((s: any) => ({
        strategy: s.strategy as Strategy,
        avgMatch: Number(s.avg_match ?? 0),
      }));

      const output = await generatePredictions(profile, drawDate, history, strategyStats);
      return {
        drawDate: output.drawDate,
        luckyPool: output.luckyPool,
        luckyPoolIterations: output.luckyPoolIterations,
        strategies: output.strategies.map(s => ({
          strategy: s.strategy,
          label: s.label,
          emoji: s.emoji,
          numbers: s.numbers,
          confidence: Math.round(s.confidence * 100),
        })),
      };
    }

    // ── get_latest_draw ─────────────────────────────────────────────────────
    case 'get_latest_draw': {
      const { data, error } = await supabase
        .from('draws')
        .select('id, draw_no, draw_date, win_nums, add_num')
        .order('draw_date', { ascending: false })
        .limit(1)
        .single();
      if (error || !data) return { error: 'No draws found' };
      return {
        id: data.id,
        drawNo: data.draw_no,
        drawDate: data.draw_date,
        winningNumbers: data.win_nums,
        additionalNumber: data.add_num,
      };
    }

    // ── get_draw_history ────────────────────────────────────────────────────
    case 'get_draw_history': {
      const limit = Math.min(Math.max(1, Number(toolInput.limit) || 10), 50);
      const { data, error } = await supabase
        .from('draws')
        .select('id, draw_no, draw_date, win_nums, add_num')
        .order('draw_date', { ascending: false })
        .limit(limit);
      if (error) return { error: 'Failed to fetch draw history' };
      return (data || []).map((d: any) => ({
        id: d.id,
        drawNo: d.draw_no,
        drawDate: d.draw_date,
        winningNumbers: d.win_nums,
        additionalNumber: d.add_num,
      }));
    }

    // ── get_my_predictions ──────────────────────────────────────────────────
    case 'get_my_predictions': {
      const limit = Math.min(Math.max(1, Number(toolInput.limit) || 5), 20);
      const { data, error } = await supabase
        .from('predictions')
        .select('id, strategy, numbers, confidence, created_at, draw_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { error: 'Failed to fetch predictions' };
      return (data || []).map((p: any) => ({
        id: p.id,
        strategy: p.strategy,
        numbers: p.numbers,
        confidence: Math.round((p.confidence || 0) * 100),
        createdAt: p.created_at,
        drawId: p.draw_id,
      }));
    }

    // ── score_my_predictions ────────────────────────────────────────────────
    case 'score_my_predictions': {
      const drawId = String(toolInput.draw_id || '');
      if (!drawId) return { error: 'draw_id is required' };

      const [drawRes, predsRes] = await Promise.all([
        supabase
          .from('draws')
          .select('draw_no, draw_date, win_nums, add_num')
          .eq('id', drawId)
          .single(),
        supabase
          .from('predictions')
          .select('id, strategy, numbers')
          .eq('user_id', userId)
          .eq('draw_id', drawId),
      ]);

      if (drawRes.error || !drawRes.data?.win_nums?.length) {
        return { error: 'Draw not found or results not yet available' };
      }
      if (!predsRes.data || predsRes.data.length === 0) {
        return { error: 'No predictions found for this draw. Generate predictions before the draw date to track results.' };
      }

      const drawResult: DrawResult = {
        drawNo: String(drawRes.data.draw_no),
        drawDate: String(drawRes.data.draw_date),
        winningNumbers: drawRes.data.win_nums,
        additionalNumber: Number(drawRes.data.add_num ?? 0),
      };

      const predictions = predsRes.data.map((p: any) => ({
        strategy: p.strategy as Strategy,
        numbers: p.numbers as number[],
      }));

      const results = scoreAllPredictions(predictions, drawResult);
      return {
        drawNo: drawResult.drawNo,
        drawDate: drawResult.drawDate,
        winningNumbers: drawResult.winningNumbers,
        additionalNumber: drawResult.additionalNumber,
        results: results.map(r => ({
          strategy: r.strategy,
          predictedNumbers: r.predictedNumbers,
          matchCount: r.matchCount,
          hasAdditional: r.hasAdditional,
        })),
      };
    }

    // ── get_my_analytics ────────────────────────────────────────────────────
    case 'get_my_analytics': {
      const { data, error } = await supabase
        .from('strategy_stats')
        .select('strategy, avg_match, max_match, total_draws')
        .eq('user_id', userId);
      if (error) return { error: 'Failed to fetch analytics' };
      return (data || []).map((s: any) => ({
        strategy: s.strategy,
        avgMatch: parseFloat((s.avg_match || 0).toFixed(2)),
        maxMatch: s.max_match || 0,
        totalDraws: s.total_draws || 0,
      }));
    }

    // ── send_email_summary ──────────────────────────────────────────────────
    case 'send_email_summary': {
      const VALID_EMAIL_TYPES = ['prediction', 'results', 'analytics', 'general'] as const;
      const rawType = String(toolInput.email_type || '');
      const emailType = VALID_EMAIL_TYPES.includes(rawType as typeof VALID_EMAIL_TYPES[number]) ? rawType : 'general';
      const subject    = String(toolInput.subject     || 'Lucky7 TOTO Update').slice(0, 100);
      // Sanitize AI-generated HTML to prevent XSS / script injection in emails
      const htmlContent = sanitizeHtml(String(toolInput.html_content || ''), EMAIL_SANITIZE_OPTIONS);

      // 1. Fetch user email (never accept email from tool input — always from DB)
      const { data: user, error: userErr } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .single();
      if (userErr || !user?.email) return { error: 'Could not retrieve user email' };

      // 2. Hard quota check BEFORE sending — prevents sending then failing to log
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('email_sends')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('sent_at', weekAgo);
      const sent = count ?? 0;
      if (sent >= 10) {
        return { error: 'Weekly email limit reached (10 per week). No email sent.' };
      }

      // 3. Build branded HTML wrapper (htmlContent is already sanitized)
      const wrappedHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8fafc;">
  <div style="font-family:sans-serif;max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1a2744;padding:24px 32px;">
      <h1 style="color:#f5c518;margin:0;font-size:22px;">🍀 Lucky7 TOTO</h1>
      <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Your personal TOTO prediction assistant</p>
    </div>
    <div style="padding:32px;">
      ${htmlContent}
    </div>
    <div style="background:#f1f5f9;padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">
        You received this because you requested it via Lucky7 chat.<br/>
        Emails remaining this week: <strong>${9 - sent}</strong> of 10.<br/>
        TOTO is a game of chance — please play responsibly. 🎱
      </p>
    </div>
  </div>
</body>
</html>`;

      // 4. Log first (DB trigger enforces quota atomically), then send
      const { error: insertErr } = await supabase.from('email_sends').insert({
        user_id:    userId,
        email_type: emailType,
        subject,
        sent_at:    new Date().toISOString(),
      });
      if (insertErr) {
        // Trigger raised EMAIL_QUOTA_EXCEEDED or other DB constraint
        if (insertErr.message?.includes('EMAIL_QUOTA_EXCEEDED')) {
          return { error: 'Weekly email limit reached (10 per week). No email sent.' };
        }
        console.error('email_sends insert error:', insertErr.message);
        return { error: 'Failed to record email quota — no email sent.' };
      }

      // 5. Send via Gmail API (quota already recorded)
      try {
        await sendGmailEmail(user.email, subject, wrappedHtml);
      } catch (sendErr) {
        console.error('Gmail send error:', (sendErr as Error).message);
        return { error: `Email delivery failed: ${(sendErr as Error).message}` };
      }

      return {
        success: true,
        sentTo: user.email,
        emailsSentThisWeek: sent + 1,
        remainingThisWeek: Math.max(0, 9 - sent),
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
