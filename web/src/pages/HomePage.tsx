import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { supabase } from '../services/supabase';

/** Return next TOTO draw date (Mon/Thu) in Singapore time */
function getNextTotoDrawDate(): Date {
  // TOTO draws on Monday and Thursday 6:30 PM SGT (UTC+8)
  const now = new Date();
  const sgt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  const day = sgt.getDay(); // 0=Sun,1=Mon,...,4=Thu
  const hour = sgt.getHours();

  // days until next draw
  let daysUntil = 0;
  if      (day === 1 && hour < 18) daysUntil = 0; // Today Monday before 6pm
  else if (day === 4 && hour < 18) daysUntil = 0; // Today Thursday before 6pm
  else if (day < 1)  daysUntil = 1;               // Sunday → Monday
  else if (day === 1 || day === 2) daysUntil = 4 - day; // Mon/Tue → Thu
  else if (day === 3) daysUntil = 1;              // Wed → Thu
  else if (day === 4) daysUntil = 4;              // Thu after 6pm → Mon
  else daysUntil = 8 - day;                       // Fri/Sat → Mon

  const next = new Date(sgt);
  next.setDate(sgt.getDate() + daysUntil);
  next.setHours(18, 30, 0, 0);
  // Convert back from SGT to local
  const offsetDiff = 8 * 60 + next.getTimezoneOffset(); // SGT offset adjustment
  next.setMinutes(next.getMinutes() - offsetDiff);
  return next;
}

function CountdownTimer({ target }: { target: string }) {
  const [time, setTime] = useState({ d: 0, h: 0, m: 0, s: 0 });
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, new Date(target).getTime() - Date.now());
      setTime({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <div className="flex gap-2 justify-center items-center">
      {time.d > 0 && <><TimeUnit value={time.d} label="days" /><span className="text-yellow-400 text-2xl font-bold">:</span></>}
      <TimeUnit value={time.h} label="hrs" />
      <span className="text-yellow-400 text-2xl font-bold">:</span>
      <TimeUnit value={time.m} label="min" />
      <span className="text-yellow-400 text-2xl font-bold">:</span>
      <TimeUnit value={time.s} label="sec" />
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-yellow-400 text-3xl font-black tabular-nums">{String(value).padStart(2, '0')}</div>
      <div className="text-gray-500 text-xs uppercase">{label}</div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const [latestDraw,   setLatestDraw]   = useState<any>(null);
  const [nextDrawDate, setNextDrawDate] = useState<string>('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      // Load latest draw with results from Supabase
      const { data } = await supabase
        .from('draws')
        .select('id, draw_no, draw_date, win_nums, add_num')
        .not('win_nums', 'eq', '{}')
        .not('win_nums', 'is', null)
        .order('draw_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) setLatestDraw(data);
    } catch {}

    // Calculate next draw date client-side
    const next = getNextTotoDrawDate();
    setNextDrawDate(next.toISOString());
  };

  return (
    <div className="pb-20 safe-top pt-6 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-gray-500 text-sm">Singapore TOTO AI Companion</p>
        </div>
        <button onClick={() => navigate('/profile')} className="text-2xl">⚙️</button>
      </div>

      {/* Countdown */}
      {nextDrawDate && (
        <div className="bg-[#12194a] rounded-2xl p-5 mb-4 border border-yellow-500/20">
          <p className="text-gray-500 text-xs text-center uppercase tracking-wider mb-3">Next TOTO Draw in</p>
          <CountdownTimer target={nextDrawDate} />
        </div>
      )}

      {/* Latest draw */}
      {latestDraw?.win_nums?.length > 0 && (
        <div className="bg-[#12194a] rounded-2xl p-4 mb-4 border border-green-500/20">
          <p className="text-yellow-400 font-bold mb-3">
            Last Draw #{latestDraw.draw_no}
            {latestDraw.draw_date && (
              <span className="text-gray-500 font-normal text-sm ml-2">
                {new Date(latestDraw.draw_date).toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-1 items-center">
            {latestDraw.win_nums.map((n: number) => (
              <span key={n} className="w-9 h-9 rounded-full bg-green-700 border-2 border-green-500 flex items-center justify-center font-bold text-sm">{n}</span>
            ))}
            {latestDraw.add_num > 0 && (
              <>
                <span className="w-2" />
                <span className="w-9 h-9 rounded-full bg-blue-800 border-2 border-blue-600 flex items-center justify-center font-bold text-sm">{latestDraw.add_num}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { emoji: '🔮', label: 'All Strategies', path: '/predictions' },
          { emoji: '📋', label: 'History', path: '/history' },
          { emoji: '📈', label: 'Analytics', path: '/analytics' },
        ].map(a => (
          <button key={a.path} onClick={() => navigate(a.path)}
            className="bg-[#12194a] rounded-2xl p-5 flex flex-col items-center gap-2 border border-yellow-500/10 hover:border-yellow-500/30 transition-all">
            <span className="text-3xl">{a.emoji}</span>
            <span className="text-white font-semibold text-sm">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
