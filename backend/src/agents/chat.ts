import OpenAI from 'openai';
import { BaziProfile, StrategyResult } from '../types';
import { WebSocket } from 'ws';

// Lazy-init so a missing key doesn't crash the server at startup
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildSystemPrompt(profile: BaziProfile, latestPredictions: StrategyResult[]): string {
  const predsSummary = latestPredictions.map(p =>
    `${p.emoji} ${p.label}: ${p.numbers.join(', ')} (confidence: ${(p.confidence * 100).toFixed(0)}%)`
  ).join('\n');

  return `You are Lucky7, an AI assistant specializing in TOTO lottery predictions powered by BaZi (Chinese metaphysics), statistics, and numerology. You are friendly, knowledgeable, and encouraging — but always remind users that lottery is based on luck and to play responsibly.

USER BAZI PROFILE:
- Day Master: ${profile.dayMaster}
- Support Element: ${profile.supportElem}
- Life Path Number: ${profile.lifePath}
- Zodiac Animal: ${profile.lunarProfile.zodiacAnimal}
- Lunar Month/Day: ${profile.lunarProfile.lunarMonth}/${profile.lunarProfile.lunarDay}

LATEST PREDICTIONS FOR NEXT DRAW:
${predsSummary}

GUIDELINES:
1. Answer questions about BaZi, lucky numbers, draw history, and strategies in a warm, personalized way
2. When recommending numbers, reference the user's specific BaZi profile
3. Explain WHY certain numbers are suggested (element alignment, frequency, gaps, numerology)
4. Highlight numbers that appear in multiple strategies as especially auspicious
5. Always remind: TOTO is a game of chance — play for fun, spend responsibly
6. Keep responses concise (under 200 words unless a detailed explanation is needed)
7. Use emoji sparingly but warmly (☯️ 🌙 🔢 ⭐)`;
}

const CHAT_FALLBACK = "I'm having trouble reaching my AI brain right now 🤖 — please try again in a moment! In the meantime, check your latest predictions on the Predictions tab for your lucky numbers. ⭐";

export async function chatWithAI(
  userMessage: string,
  history: ChatMessage[],
  profile: BaziProfile,
  latestPredictions: StrategyResult[],
  ws?: WebSocket
): Promise<string> {
  const systemPrompt = buildSystemPrompt(profile, latestPredictions);

  // Keep last 20 messages
  const recentHistory = history.slice(-20);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...recentHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ];

  try {
    if (ws) {
      // Streaming mode via WebSocket
      let fullResponse = '';
      const stream = await getClient().chat.completions.create({
        model: 'deepseek-chat',
        max_tokens: 1024,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          fullResponse += delta;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'chunk', content: delta }));
          }
        }
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'done', content: fullResponse }));
      }

      return fullResponse || CHAT_FALLBACK;
    } else {
      // Non-streaming mode
      const response = await getClient().chat.completions.create({
        model: 'deepseek-chat',
        max_tokens: 1024,
        messages,
      });

      return response.choices[0]?.message?.content || CHAT_FALLBACK;
    }
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    const errStatus = err?.status ?? err?.response?.status ?? 'unknown';
    console.error('[chat] DeepSeek error (status=%s): %s', errStatus, errMsg);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'done', content: CHAT_FALLBACK }));
    }
    return CHAT_FALLBACK;
  }
}
