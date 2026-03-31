export type Strategy = 'bazi' | 'frequency' | 'gap' | 'numerology' | 'lunar' | 'iching' | 'deterministic' | 'hybrid' | 'deepseek';

export interface BaziProfile {
  dayMaster: string;
  supportElem: string;
  lifePath: number;
  birthTime?: string;           // "HH:MM" 24h format
  lunarProfile: {
    lunarMonth: number;
    lunarDay: number;
    zodiacAnimal: string;
    heavenlyStem: string;
    earthlyBranch: string;
    hourPillar?: {               // present when birthTime provided
      heavenlyStem: string;
      earthlyBranch: string;
    };
  };
  name?: string; // optional — used by Deterministic Seed strategy for name_value
}

export interface StrategyResult {
  strategy: Strategy;
  numbers: number[];
  confidence: number;
  label: string;
  emoji: string;
}

export interface DrawResult {
  drawNo: string;
  drawDate: string;
  winningNumbers: number[];
  additionalNumber: number;
}

export interface PredictionRequest {
  userId: string;
  drawDate: string;
  historyLimit?: number;
}

export interface ChatRequest {
  userId: string;
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AnalyticsInsight {
  userId: string;
  bestStrategy: Strategy;
  worstStrategy: Strategy;
  summary: string;
  recommendations: string[];
  strategyStats: Array<{
    strategy: Strategy;
    avgMatch: number;
    totalDraws: number;
  }>;
}

export interface NotificationPayload {
  userId: string;
  drawDate: string;
  rankedStrategies: Array<{
    rank: number;
    strategy: Strategy;
    numbers: number[];
    avgMatch: number;
    emoji: string;
    label: string;
  }>;
  luckyPool: number[];
}

export interface AuthenticatedRequest extends Express.Request {
  user?: { id: string; email: string };
}

export const STRATEGY_LABELS: Record<Strategy, string> = {
  bazi:          'BaZi',
  frequency:     'Frequency',
  gap:           'Gap',
  numerology:    'Numerology',
  lunar:         'Lunar',
  iching:        'I-Ching',
  deterministic: 'Seed',
  hybrid:        'Hybrid',
  deepseek:      'DeepSeek AI',
};

export const STRATEGY_EMOJIS: Record<Strategy, string> = {
  bazi:          '☯',
  frequency:     '📊',
  gap:           '⭐',
  numerology:    '🔢',
  lunar:         '🌙',
  iching:        '☰',
  deterministic: '🎯',
  hybrid:        '🔮',
  deepseek:      '🤖',
};

export const STRATEGIES: Strategy[] = [
  'bazi', 'frequency', 'gap', 'numerology', 'lunar',
  'iching', 'deterministic', 'hybrid', 'deepseek',
];
