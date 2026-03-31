import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/userStore';

const EMOJIS: Record<string, string> = {
  bazi: '☯', frequency: '📊', gap: '⭐', numerology: '🔢', lunar: '🌙',
  iching: '☰', deterministic: '🎯', hybrid: '🔮',
};

const LABELS: Record<string, string> = {
  bazi: 'BaZi', frequency: 'Frequency', gap: 'Gap', numerology: 'Numerology', lunar: 'Lunar',
  iching: 'I-Ching', deterministic: 'Seed', hybrid: 'Hybrid',
};

interface StatRow {
  strategy:    string;
  avgMatch:    number;
  maxMatch:    number;
  totalDraws:  number;
}

export default function AnalyticsPage() {
  const { user } = useUserStore();
  const [stats, setStats]     = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from('strategy_stats')
        .select('strategy, avg_match, max_match, total_draws')
        .eq('user_id', user!.id)
        .order('avg_match', { ascending: false });

      if (error) throw error;

      setStats(
        (data || []).map((r: any) => ({
          strategy:   r.strategy,
          avgMatch:   Number(r.avg_match),
          maxMatch:   Number(r.max_match),
          totalDraws: Number(r.total_draws),
        }))
      );
    } catch (err) {
      console.error('Analytics load error:', err);
    }
    setLoading(false);
  };

  const chartData = stats
    .filter(s => s.totalDraws > 0)
    .map(s => ({
      name:     EMOJIS[s.strategy] || s.strategy.slice(0, 3),
      avg:      parseFloat(s.avgMatch.toFixed(2)),
      strategy: s.strategy,
    }));

  const best  = stats[0];
  const worst = stats[stats.length - 1];

  if (loading) return (
    <div className="flex justify-center items-center h-screen">
      <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-white mb-2">📈 Analytics</h1>
      <p className="text-gray-500 text-sm mb-4">Your strategy performance</p>

      {/* Best / worst summary */}
      {best && (
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-[#12194a] rounded-2xl p-4 border border-yellow-500/20 text-center">
            <div className="text-xs text-gray-400 mb-1">🏆 Best Strategy</div>
            <div className="text-yellow-400 font-bold text-lg">
              {EMOJIS[best.strategy]} {LABELS[best.strategy] ?? best.strategy}
            </div>
            <div className="text-white text-sm">avg {best.avgMatch.toFixed(2)} matches</div>
          </div>
          {worst && worst.strategy !== best.strategy && (
            <div className="flex-1 bg-[#12194a] rounded-2xl p-4 border border-white/5 text-center">
              <div className="text-xs text-gray-400 mb-1">📉 Needs Work</div>
              <div className="text-gray-300 font-bold text-lg">
                {EMOJIS[worst.strategy]} {LABELS[worst.strategy] ?? worst.strategy}
              </div>
              <div className="text-gray-400 text-sm">avg {worst.avgMatch.toFixed(2)} matches</div>
            </div>
          )}
        </div>
      )}

      {/* Bar chart */}
      {chartData.length > 0 ? (
        <div className="bg-[#12194a] rounded-2xl p-4 mb-4">
          <p className="text-yellow-400 font-bold mb-3">Avg Matches per Strategy</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d6b" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#12194a', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 8 }}
                labelStyle={{ color: '#f5c518' }}
                itemStyle={{ color: '#fff' }}
                formatter={(v: any) => [`${v} avg matches`, 'Avg']}
              />
              <Bar dataKey="avg" fill="#f5c518" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📊</div>
          <p className="text-white font-bold">No match data yet</p>
          <p className="text-gray-400 text-sm mt-2">Generate predictions and score draws to see analytics</p>
        </div>
      )}

      {/* Strategy breakdown list */}
      <div className="bg-[#12194a] rounded-2xl p-4 mb-4 border border-yellow-500/10">
        <p className="text-yellow-400 font-bold mb-3">Strategy Breakdown</p>
        {stats.map(s => (
          <div key={s.strategy} className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
            <span className="text-xl">{EMOJIS[s.strategy]}</span>
            <div className="flex-1">
              <div className="text-white font-medium text-sm">{LABELS[s.strategy] ?? s.strategy}</div>
              <div className="text-gray-500 text-xs">{s.totalDraws} draws</div>
            </div>
            <div className="text-right">
              <div className="text-yellow-400 font-bold">{s.avgMatch.toFixed(2)}</div>
              <div className="text-gray-500 text-xs">max {s.maxMatch}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Insight (static for now) */}
      {best && (
        <div className="bg-[#12194a] rounded-2xl p-4 border border-yellow-500/20">
          <p className="text-yellow-400 font-bold mb-3">🤖 Performance Insight</p>
          <div className="bg-yellow-400/10 rounded-xl p-3 mb-3 text-center">
            <span className="text-yellow-400 font-bold">
              {EMOJIS[best.strategy]} Best: {LABELS[best.strategy] ?? best.strategy}
            </span>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">
            Based on {best.totalDraws} historical draws, the <strong className="text-yellow-400">{best.strategy}</strong> strategy
            leads with an average of <strong className="text-yellow-400">{best.avgMatch.toFixed(2)}</strong> matches per draw
            (max {best.maxMatch}).
          </p>
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-yellow-400 text-sm font-bold mb-2">Recommendations</p>
            <p className="text-gray-300 text-sm leading-relaxed">
              • Prioritise the <strong className="text-yellow-400">{best.strategy}</strong> strategy for your next prediction
            </p>
            {stats.length > 1 && (
              <p className="text-gray-300 text-sm leading-relaxed">
                • Consider combining {best.strategy} with{' '}
                <strong className="text-yellow-400">{stats[1]?.strategy}</strong> (avg {stats[1]?.avgMatch.toFixed(2)})
              </p>
            )}
            <p className="text-gray-300 text-sm leading-relaxed">
              • Keep generating predictions to improve accuracy over time
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
