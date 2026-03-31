import OpenAI from 'openai';
import { SupabaseClient } from '@supabase/supabase-js';
import { BaziProfile, StrategyResult } from '../types';
import { WebSocket } from 'ws';
import { LUCKY7_TOOLS, executeTool } from './tools';

// Re-export ChatMessage so the route can import it from here
export type { ChatMessage } from './chat';

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseURL: 'https://api.deepseek.com',
    });
  }
  return _client;
}

const MAX_ITERATIONS = 10;
const ITERATION_TIMEOUT_MS = 28_000; // 28s hard limit (Railway has 30s timeout)

const CHAT_FALLBACK =
  "I'm having trouble reaching my AI brain right now 🤖 — please try again in a moment! In the meantime, check your latest predictions on the Predictions tab for your lucky numbers. ⭐";

function buildSystemPrompt(profile: BaziProfile, latestPredictions: StrategyResult[]): string {
  const predsSummary =
    latestPredictions.length > 0
      ? latestPredictions
          .map(
            p =>
              `${p.emoji} ${p.label}: ${p.numbers.join(', ')} (confidence: ${(p.confidence * 100).toFixed(0)}%)`
          )
          .join('\n')
      : 'No recent predictions yet — use the generate_prediction tool to create one.';

  return `You are Lucky7, an AI assistant specialising in TOTO lottery predictions powered by BaZi (Chinese metaphysics), statistics, and numerology. You are friendly, knowledgeable, and encouraging — but always remind users that lottery is based on luck and to play responsibly.

USER BAZI PROFILE:
- Day Master: ${profile.dayMaster}
- Support Element: ${profile.supportElem}
- Life Path Number: ${profile.lifePath}
- Zodiac Animal: ${profile.lunarProfile.zodiacAnimal}
- Lunar Month/Day: ${profile.lunarProfile.lunarMonth}/${profile.lunarProfile.lunarDay}

LATEST PREDICTIONS FOR NEXT DRAW:
${predsSummary}

AVAILABLE TOOLS — use them whenever they improve your answer:
• get_next_draw_date   — ALWAYS call this first before generate_prediction if you don't know the upcoming draw date
• generate_prediction  — generate lucky numbers using all 8 strategies for a specific draw date
• get_latest_draw      — get the most recent TOTO draw result (use to obtain draw_id for scoring)
• get_draw_history     — get multiple past draw results (specify limit up to 50)
• get_my_predictions   — see the user's recent prediction history
• score_my_predictions — score predictions against a completed draw (requires draw_id)
• get_my_analytics     — get strategy performance statistics
• send_email_summary   — send an email to the user's registered address (max 10/week)

TOOL USAGE GUIDELINES:
1. "lucky numbers / predict / generate" → call get_next_draw_date THEN generate_prediction
2. "how did I do / score / matches" → call get_latest_draw to get draw_id, THEN score_my_predictions
3. "recent draws / history" → call get_draw_history
4. "best strategy / analytics / performance" → call get_my_analytics
5. Compound questions (e.g., "last draw AND analytics") → call multiple tools in the same response
6. "email me / send me / mail me" → call send_email_summary ONLY after user explicitly asks
   — You MAY offer to email after predictions/results, but do NOT send without confirmation
   — Always tell the user how many emails remain this week after sending

RESPONSE GUIDELINES:
1. Reference the user's BaZi profile when discussing lucky numbers
2. Explain WHY certain numbers are suggested (element alignment, frequency, gaps, numerology)
3. Highlight numbers appearing in multiple strategies as especially auspicious
4. Always remind: TOTO is a game of chance — play for fun, spend responsibly
5. Keep responses concise (under 200 words unless detail is specifically needed)
6. Use emoji sparingly but warmly (☯️ 🌙 🔢 ⭐)`;
}

/** Word-chunk a string over WebSocket to simulate streaming */
function streamText(text: string, ws: WebSocket): void {
  const words = text.split(/(\s+)/);
  for (const fragment of words) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chunk', content: fragment }));
    }
  }
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'done', content: text }));
  }
}

export async function chatAgenticWithAI(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  profile: BaziProfile,
  latestPredictions: StrategyResult[],
  userId: string,
  supabase: SupabaseClient,
  ws?: WebSocket
): Promise<string> {
  const systemPrompt = buildSystemPrompt(profile, latestPredictions);
  const recentHistory = history.slice(-20);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...recentHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ];

  let iteration = 0;
  const startTime = Date.now();

  try {
    while (iteration < MAX_ITERATIONS) {
      if (Date.now() - startTime > ITERATION_TIMEOUT_MS) {
        console.warn('[chatAgentic] timeout after', iteration, 'iterations');
        return CHAT_FALLBACK;
      }
      iteration++;

      const response = await getClient().chat.completions.create({
        model: 'deepseek-chat',
        max_tokens: 4096,
        messages,
        tools: LUCKY7_TOOLS,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];
      if (!choice) break;

      const { finish_reason, message } = choice;

      // ── Final answer ─────────────────────────────────────────────────────
      if (finish_reason === 'stop') {
        const text = message.content || CHAT_FALLBACK;
        if (ws && ws.readyState === WebSocket.OPEN) {
          streamText(text, ws);
        }
        return text;
      }

      // ── Tool calls ───────────────────────────────────────────────────────
      if (finish_reason === 'tool_calls' && message.tool_calls?.length) {
        // Filter to function-type tool calls only
        const toolCalls = (message.tool_calls as OpenAI.ChatCompletionMessageToolCall[]).filter(
          (tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: 'function' } => tc.type === 'function'
        );

        // Notify WS client which tools are being called
        if (ws && ws.readyState === WebSocket.OPEN) {
          for (const tc of toolCalls) {
            ws.send(JSON.stringify({ type: 'tool_call', tool: tc.function.name, toolUseId: tc.id }));
          }
        }

        // Append assistant message (with tool_calls) to history
        messages.push(message as OpenAI.ChatCompletionMessageParam);

        // Execute each tool and append results
        for (const tc of toolCalls) {
          let result: unknown;
          try {
            const toolInput = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
            result = await executeTool(tc.function.name, toolInput, userId, supabase);
          } catch (toolErr: any) {
            console.warn(`[chatAgentic] Tool '${tc.function.name}' failed:`, toolErr?.message);
            result = { error: `Tool execution failed: ${toolErr?.message}` };
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }

        continue;
      }

      // ── max_tokens hit ───────────────────────────────────────────────────
      if (finish_reason === 'length') {
        const partial = message.content;
        const text = partial || 'My response was too long — please ask a more specific question.';
        if (ws && ws.readyState === WebSocket.OPEN) streamText(text, ws);
        return text;
      }

      // Unknown finish_reason — bail out
      break;
    }

    const fallback = 'I reached the maximum reasoning steps. Please rephrase your question and try again.';
    if (ws && ws.readyState === WebSocket.OPEN) streamText(fallback, ws);
    return fallback;
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    const errStatus = err?.status ?? err?.response?.status ?? 'unknown';
    console.error('[chatAgentic] DeepSeek error (status=%s): %s', errStatus, errMsg);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'done', content: CHAT_FALLBACK }));
    }
    return CHAT_FALLBACK;
  }
}
