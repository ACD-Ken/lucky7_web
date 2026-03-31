import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/userStore';

interface StrategyResult {
  strategy:   string;
  label:      string;
  emoji:      string;
  numbers:    number[];
  confidence: number;
}

const STRATEGY_GRADIENTS: Record<string, string> = {
  bazi:          'from-purple-900 to-purple-700',
  frequency:     'from-teal-900 to-teal-700',
  gap:           'from-yellow-900 to-yellow-700',
  numerology:    'from-blue-900 to-blue-700',
  lunar:         'from-violet-900 to-violet-700',
  iching:        'from-emerald-900 to-emerald-700',
  deterministic: 'from-rose-900 to-rose-700',
  hybrid:        'from-gray-900 to-gray-700',
};

const STRATEGY_META: Record<string, { label: string; emoji: string }> = {
  bazi:          { label: 'BaZi',       emoji: '☯' },
  frequency:     { label: 'Frequency',  emoji: '📊' },
  gap:           { label: 'Gap',        emoji: '⭐' },
  numerology:    { label: 'Numerology', emoji: '🔢' },
  lunar:         { label: 'Lunar',      emoji: '🌙' },
  iching:        { label: 'I-Ching',    emoji: '☰' },
  deterministic: { label: 'Seed',       emoji: '🎯' },
  hybrid:        { label: 'Hybrid',     emoji: '🔮' },
};

export default function PredictionsPage() {
  const { user } = useUserStore();
  const [strategies,  setStrategies]  = useState<StrategyResult[]>([]);
  const [avgMatches,  setAvgMatches]  = useState<Record<string, number>>({});
  const [drawDate,    setDrawDate]    = useState('');
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    if (user) {
      loadFromSupabase();
      loadStats();
    }
  }, [user?.id]); // ← depend on id only, not entire object

  /* ── Load latest stored predictions — no FK join ── */
  const loadFromSupabase = async () => {
    setLoading(true);
    try {
      // Step 1: most recent draw_id for this user
      const { data: latest, error: e1 } = await supabase
        .from('predictions')
        .select('draw_id')
        .eq('user_id', user!.id)
        .order('draw_id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (e1) console.error('predictions query error:', e1);
      if (!latest?.draw_id) return;

      const drawId = latest.draw_id;

      // Step 2: all strategies for that draw (no join)
      const { data: preds, error: e2 } = await supabase
        .from('predictions')
        .select('strategy, numbers, confidence')
        .eq('user_id', user!.id)
        .eq('draw_id', drawId);

      if (e2) console.error('preds fetch error:', e2);

      if (preds?.length) {
        setStrategies(preds.map((p: any) => ({
          strategy:   p.strategy,
          label:      STRATEGY_META[p.strategy]?.label ?? p.strategy,
          emoji:      STRATEGY_META[p.strategy]?.emoji ?? '🎲',
          numbers:    Array.isArray(p.numbers) ? p.numbers : [],
          confidence: Number(p.confidence ?? 0.5),
        })));
      }

      // Step 3: fetch draw date separately
      const { data: draw } = await supabase
        .from('draws')
        .select('draw_no, draw_date')
        .eq('id', drawId)
        .maybeSingle();

      if (draw?.draw_date) setDrawDate(draw.draw_date);

    } catch (err) {
      console.error('loadFromSupabase exception:', err);
    } finally {
      setLoading(false); // ← ALWAYS runs
    }
  };

  /* ── Load strategy stats ── */
  const loadStats = async () => {
    try {
      const { data } = await supabase
        .from('strategy_stats')
        .select('strategy, avg_match, total_draws')
        .eq('user_id', user!.id);
      const stats: Record<string, number> = {};
      (data || []).forEach((s: any) => {
        if (s.total_draws > 0) stats[s.strategy] = Number(s.avg_match);
      });
      setAvgMatches(stats);
    } catch {}
  };

  /* ── Derived ── */
  const ranked = [...strategies].sort((a, b) =>
    (avgMatches[b.strategy] ?? -1) - (avgMatches[a.strategy] ?? -1)
  );
  // Build frequency map first
  const numFreq = new Map<number, number>();
  strategies.forEach(s => s.numbers.forEach(n => numFreq.set(n, (numFreq.get(n) || 0) + 1)));
  // Lucky Pool: only numbers in 2+ strategies, sorted by frequency desc then numerically asc
  const luckyPool = [...numFreq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const hasStats = Object.keys(avgMatches).length > 0;

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-black text-white">🎰 Predictions</h1>
        {drawDate && (
          <span className="text-yellow-400 text-sm">
            {new Date(drawDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      {hasStats && !loading && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-4 text-center">
          <p className="text-gray-400 text-xs">📊 Ranked by your historical avg match score — best first</p>
        </div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <div className="space-y-3 mt-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && strategies.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎰</div>
          <p className="text-white font-bold">No predictions yet</p>
          <p className="text-gray-400 text-sm mt-2">Predictions will appear here before each draw</p>
        </div>
      )}

      {/* Strategy cards */}
      {!loading && ranked.map((s, i) => (
        <div key={s.strategy} className={`bg-gradient-to-br ${STRATEGY_GRADIENTS[s.strategy]} rounded-2xl p-4 mb-3 border border-white/10`}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${i === 0 ? 'bg-yellow-400 text-[#0a0e2e]' : 'bg-white/10 text-white'}`}>
                #{i + 1}
              </span>
              <span className="text-xl">{s.emoji}</span>
              <span className="text-white font-bold">{s.label}</span>
              {i === 0 && <span>🏆</span>}
            </div>
            <div className="text-right">
              {avgMatches[s.strategy] !== undefined && (
                <div className="text-yellow-300 text-xs">avg {avgMatches[s.strategy].toFixed(1)}</div>
              )}
              <div className="text-white/60 text-xs">{(s.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>
          <div className="flex gap-1.5 justify-center">
            {s.numbers.map(n => (
              <span key={n} className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border-2
                ${i === 0 ? 'bg-yellow-400 border-yellow-300 text-[#0a0e2e]' : 'bg-[#0a0e2e]/60 border-white/20 text-white'}`}>
                {n}
              </span>
            ))}
          </div>
        </div>
      ))}

      {/* Lucky Pool */}
      {!loading && luckyPool.length > 0 && (
        <div className="mt-2 bg-gradient-to-br from-yellow-950 to-yellow-900 rounded-2xl p-4 border-2 border-yellow-500">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🍀</span>
            <div>
              <p className="text-yellow-400 font-bold text-lg">Lucky Pool</p>
              <p className="text-yellow-600 text-xs">Numbers appearing in 2+ strategies — sorted by frequency</p>
            </div>
            <span className="ml-auto bg-yellow-400 text-[#0a0e2e] font-black w-8 h-8 rounded-full flex items-center justify-center">{luckyPool.length}</span>
          </div>

          {/* Frequency-coded balls */}
          <div className="flex flex-wrap gap-2 justify-center">
            {luckyPool.map(([num, count]) => (
              <div key={num} className="flex flex-col items-center gap-1">
                <span className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm border-2
                  ${count >= 4
                    ? 'bg-pink-400 border-pink-300 text-white'
                    : count === 3
                    ? 'bg-[#e8a44a] border-[#c8793a] text-[#1a0a00]'
                    : 'bg-[#1a1a2e] border-[#c8793a] text-white'}`}>
                  {num}
                </span>
                <span className={`text-[11px] font-bold
                  ${count >= 4 ? 'text-pink-300' : count === 3 ? 'text-[#e8a44a]' : 'text-[#c8793a]'}`}>
                  ×{count}
                </span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 justify-center mt-3 text-[11px] text-yellow-700">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full bg-[#1a1a2e] border border-[#c8793a] inline-block" />
              ×2
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full bg-[#e8a44a] inline-block" />
              ×3
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full bg-pink-400 inline-block" />
              ×4+
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
