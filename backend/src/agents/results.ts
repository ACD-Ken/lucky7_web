import Anthropic from '@anthropic-ai/sdk';
import { DrawResult, Strategy, StrategyResult } from '../types';
import { countMatches } from '../strategies';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface MatchResult {
  strategy: Strategy;
  predictedNumbers: number[];
  matchCount: number;
  hasAdditional: boolean;
}

export function scoreAllPredictions(
  predictions: Array<{ strategy: Strategy; numbers: number[] }>,
  drawResult: DrawResult
): MatchResult[] {
  return predictions.map(p => {
    const { count, hasAdditional } = countMatches(
      p.numbers,
      drawResult.winningNumbers,
      drawResult.additionalNumber
    );
    return {
      strategy: p.strategy,
      predictedNumbers: p.numbers,
      matchCount: count,
      hasAdditional,
    };
  });
}

export async function generateResultsCommentary(
  matchResults: MatchResult[],
  drawResult: DrawResult
): Promise<string> {
  const resultsSummary = matchResults
    .sort((a, b) => b.matchCount - a.matchCount)
    .map(r =>
      `${r.strategy}: ${r.matchCount} matches${r.hasAdditional ? ' + additional' : ''} (predicted: ${r.predictedNumbers.join(', ')})`
    )
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `TOTO Draw ${drawResult.drawNo} results: Winning numbers: ${drawResult.winningNumbers.join(', ')} + Additional: ${drawResult.additionalNumber}

Strategy performance:
${resultsSummary}

Write a brief, encouraging 2-3 sentence commentary on these results. Highlight the best-performing strategy and any notable patterns. Keep it warm and motivating.`,
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
