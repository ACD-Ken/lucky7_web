import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/userStore';

const STRATEGIES = ['bazi', 'frequency', 'gap', 'numerology', 'lunar', 'hybrid'];

const matchColor = (c: number | null) => {
  if (c === null) return 'text-gray-600';
  if (c >= 4) return 'text-green-400 font-black';
  if (c === 3) return 'text-orange-400 font-bold';
  if (c >= 1) return 'text-gray-300';
  return 'text-gray-600';
};

export default function HistoryPage() {
  const { user } = useUserStore();
  const [draws,   setDraws]   = useState<any[]>([]);
  const [preds,   setPreds]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [user]);

  const loadData = async () => {
    try {
      // Fetch draws that have results (win_nums is not empty)
      const { data: drawData } = await supabase
        .from('draws')
        .select('id, draw_no, draw_date, win_nums, add_num')
        .not('win_nums', 'eq', '{}')
        .not('win_nums', 'is', null)
        .order('draw_date', { ascending: false })
        .limit(20);

      setDraws(drawData || []);

      // Fetch user predictions with match scores
      if (user) {
        const { data: predData } = await supabase
          .from('predictions')
          .select('id, draw_id, strategy, matches(match_count, has_additional)')
          .eq('user_id', user.id);
        setPreds(predData || []);
      }
    } catch (err) {
      console.error('History load error:', err);
    }
    setLoading(false);
  };

  // Look up match count for a given draw + strategy
  const getMatch = (drawId: number, strategy: string) => {
    const p = preds.find(x => x.draw_id === drawId && x.strategy === strategy);
    return p?.matches?.[0]?.match_count ?? null;
  };

  if (loading) return (
    <div className="flex justify-center items-center h-screen">
      <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-white mb-2">📋 Draw History</h1>
      <p className="text-gray-500 text-sm mb-4">Last {draws.length} draws with your match scores</p>

      {draws.map(draw => (
        <div key={draw.id} className="bg-[#12194a] rounded-2xl p-4 mb-3 border border-yellow-500/10">
          <div className="flex justify-between mb-3">
            <span className="text-yellow-400 font-bold">Draw #{draw.draw_no}</span>
            <span className="text-gray-500 text-sm">
              {draw.draw_date
                ? new Date(draw.draw_date).toLocaleDateString('en-SG', { weekday: 'short', month: 'short', day: 'numeric' })
                : '—'}
            </span>
          </div>

          {draw.win_nums?.length > 0 ? (
            <>
              {/* Winning number balls */}
              <div className="flex gap-1 flex-wrap mb-3">
                {draw.win_nums.map((n: number) => (
                  <span key={n} className="w-8 h-8 rounded-full bg-green-700 border border-green-500 flex items-center justify-center text-xs font-bold">{n}</span>
                ))}
                {draw.add_num > 0 && (
                  <>
                    <span className="w-2" />
                    <span className="w-8 h-8 rounded-full bg-blue-800 border border-blue-600 flex items-center justify-center text-xs font-bold">{draw.add_num}</span>
                  </>
                )}
              </div>

              {/* Match scores per strategy */}
              {user && (
                <div className="flex justify-between border-t border-white/5 pt-2">
                  {STRATEGIES.map(s => {
                    const mc = getMatch(draw.id, s);
                    return (
                      <div key={s} className="text-center flex-1">
                        <div className={`text-lg ${matchColor(mc)}`}>{mc ?? '—'}</div>
                        <div className="text-gray-600 text-[9px] uppercase">{s.slice(0, 3)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 italic text-sm">Results pending…</p>
          )}
        </div>
      ))}

      {draws.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-white font-bold text-lg">No draw history yet</p>
          <p className="text-gray-400 text-sm mt-2">Results appear here after each TOTO draw</p>
        </div>
      )}
    </div>
  );
}
