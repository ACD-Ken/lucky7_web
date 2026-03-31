import { BaziProfile, DrawResult, StrategyResult, Strategy, STRATEGY_LABELS, STRATEGY_EMOJIS } from '../types';
import { runAllStrategies, computeLuckyPool } from '../strategies';

export interface PredictionOutput {
  strategies: StrategyResult[];
  luckyPool: number[];
  luckyPoolIterations: number;
  drawDate: string;
  generatedAt: string;
}

export async function generatePredictions(
  profile: BaziProfile,
  drawDate: string,
  history: DrawResult[],
  strategyStats?: Array<{ strategy: Strategy; avgMatch: number }>,
  drawNo?: number,
  favoriteNumbers?: number[],
  gender?: string
): Promise<PredictionOutput> {
  // Auto-regenerate until the pool has 4+ numbers each confirmed by 3+ strategies.
  // Strategies have randomness (getRandomUnique), so each iteration may yield a different pool.
  let strategies: StrategyResult[] = [];
  let luckyPool: number[] = [];
  let luckyPoolIterations = 0;
  const MAX_ITERATIONS = 10;

  do {
    strategies = await runAllStrategies(profile, drawDate, history, drawNo, favoriteNumbers, gender);
    luckyPool = computeLuckyPool(strategies);
    luckyPoolIterations++;
  } while (luckyPool.length < 4 && luckyPoolIterations < MAX_ITERATIONS);

  // Apply confidence blending AFTER finding a good pool (uses final strategies set)
  if (strategyStats && strategyStats.length > 0) {
    const maxAvg = Math.max(...strategyStats.map(s => s.avgMatch), 0.01);
    strategies.forEach(s => {
      const stat = strategyStats.find(st => st.strategy === s.strategy);
      if (stat) {
        // Blend algorithmic confidence with historical performance
        const histWeight = Math.min(1, stat.avgMatch / maxAvg) * 0.3;
        s.confidence = s.confidence * 0.7 + histWeight;
      }
    });
  }

  return {
    strategies,
    luckyPool,
    luckyPoolIterations,
    drawDate,
    generatedAt: new Date().toISOString(),
  };
}

export function rankStrategiesByAvgMatch(
  strategies: StrategyResult[],
  stats: Array<{ strategy: Strategy; avgMatch: number }>
): StrategyResult[] {
  return [...strategies].sort((a, b) => {
    const aAvg = stats.find(s => s.strategy === a.strategy)?.avgMatch ?? 0;
    const bAvg = stats.find(s => s.strategy === b.strategy)?.avgMatch ?? 0;
    return bAvg - aAvg;
  });
}
