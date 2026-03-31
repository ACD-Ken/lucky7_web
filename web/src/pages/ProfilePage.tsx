import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';

const ELEMENT_COLORS: Record<string, string> = {
  Wood: '#4ade80', Fire: '#f97316', Earth: '#fbbf24', Metal: '#94a3b8', Water: '#60a5fa',
};
const ELEMENT_EMOJIS: Record<string, string> = {
  Wood: '🌿', Fire: '🔥', Earth: '🪨', Metal: '⚗️', Water: '💧',
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, baziProfile, logout } = useUserStore();

  if (!user || !baziProfile) return null;

  const elem = baziProfile.supportElem;

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-white mb-6">👤 Profile</h1>

      {/* User */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-yellow-400 rounded-full flex items-center justify-center text-3xl font-black text-[#0a0e2e] mx-auto mb-3">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <p className="text-white font-bold text-xl">{user.name}</p>
        <p className="text-gray-400 text-sm">{user.email}</p>
        <p className="text-gray-500 text-sm">Born: {user.dob}{user.birthTime ? ` at ${user.birthTime}` : ''}</p>
      </div>

      {/* BaZi */}
      <div className="rounded-2xl p-5 mb-4 border-2 text-center" style={{ backgroundColor: '#0d1340', borderColor: ELEMENT_COLORS[elem] }}>
        <div className="text-4xl mb-2">{ELEMENT_EMOJIS[elem]}</div>
        <div className="text-xl font-bold" style={{ color: ELEMENT_COLORS[elem] }}>{elem}</div>
        <div className="text-gray-400 text-xs mb-4">Support Element</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Day Master', value: baziProfile.dayMaster },
            { label: 'Life Path', value: String(baziProfile.lifePath) },
            { label: 'Zodiac', value: baziProfile.lunarProfile?.zodiacAnimal || '—' },
          ].map(s => (
            <div key={s.label} className="bg-[#0a0e2e] rounded-xl p-3">
              <div className="text-yellow-400 font-bold">{s.value}</div>
              <div className="text-gray-600 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        {baziProfile.lunarProfile?.hourPillar && (
          <div className="mt-3 bg-[#0a0e2e] rounded-xl p-3 flex items-center justify-center gap-3">
            <span className="text-lg">⏰</span>
            <div>
              <div className="text-yellow-400 font-bold">
                {baziProfile.lunarProfile.hourPillar.heavenlyStem} {baziProfile.lunarProfile.hourPillar.earthlyBranch}
              </div>
              <div className="text-gray-600 text-xs">Hour Pillar 时柱</div>
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="bg-[#12194a] rounded-2xl overflow-hidden border border-yellow-500/10 mb-4">
        {[
          { emoji: '📈', label: 'Analytics', path: '/analytics' },
        ].map(item => (
          <button key={item.path} onClick={() => navigate(item.path)}
            className="w-full flex items-center gap-3 px-4 py-4 border-b border-white/5 hover:bg-white/5 transition-all">
            <span className="text-xl">{item.emoji}</span>
            <span className="text-white font-medium flex-1 text-left">{item.label}</span>
            <span className="text-gray-500 text-xl">›</span>
          </button>
        ))}
      </div>

      <button onClick={() => { if (window.confirm('Sign out?')) logout(); }}
        className="w-full bg-red-900/30 border border-red-800 text-red-400 font-bold py-4 rounded-2xl hover:bg-red-900/50 transition-all">
        Sign Out
      </button>
    </div>
  );
}
