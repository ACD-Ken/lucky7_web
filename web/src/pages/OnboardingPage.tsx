import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser, loginUser } from '../services/api';
import { useUserStore } from '../stores/userStore';

type Step = 'splash' | 'name' | 'dob' | 'gender' | 'loading' | 'reveal';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { setUser } = useUserStore();
  const [step, setStep] = useState<Step>('splash');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [gender, setGender] = useState<'M' | 'F' | null>(null);
  const [baziProfile, setBaziProfile] = useState<any>(null);
  // Defer setUser until after the reveal screen so the router doesn't redirect early
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [error, setError] = useState('');

  const handleRegister = async (g: 'M' | 'F') => {
    setGender(g);
    setStep('loading');
    setError('');
    try {
      const res = await registerUser({ name, email, dob, birthTime, gender: g });
      const { user, baziProfile: profile, token } = res.data;
      setBaziProfile(profile || user.baziProfileJson);
      setPendingUser(user);
      setStep('reveal');
    } catch (err: any) {
      // Email already registered — verify DOB and log in instead
      if (err?.response?.status === 409) {
        try {
          const loginRes = await loginUser({ email, dob });
          const { user } = loginRes.data;
          setBaziProfile(user.baziProfileJson);
          setPendingUser(user);
          setStep('reveal');
        } catch {
          setError('Email already registered. Check your date of birth and try again.');
          setStep('gender');
        }
        return;
      }
      setError(err?.response?.data?.error || 'Unable to connect. Please check your connection and try again.');
      setStep('gender');
    }
  };

  const handleEnterApp = () => {
    // Commit user to store now — this triggers router redirect to /home
    setUser(pendingUser);
    navigate('/home');
  };

  const ELEMENT_COLORS: Record<string, string> = {
    Wood: '#4ade80', Fire: '#f97316', Earth: '#fbbf24', Metal: '#94a3b8', Water: '#60a5fa',
  };
  const ELEMENT_EMOJIS: Record<string, string> = {
    Wood: '🌿', Fire: '🔥', Earth: '🪨', Metal: '⚗️', Water: '💧',
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0e2e] via-[#0d1340] to-[#12194a] flex flex-col items-center justify-center p-6">
      {step === 'splash' && (
        <div className="text-center space-y-6 animate-fade-in">
          <div className="text-8xl">🎰</div>
          <h1 className="text-5xl font-black text-yellow-400">Lucky7</h1>
          <p className="text-2xl text-white font-bold">TOTO AI</p>
          <p className="text-gray-400 max-w-xs">BaZi-powered predictions for every Singapore TOTO draw</p>
          <button onClick={() => setStep('name')} className="w-full max-w-xs bg-yellow-400 text-[#0a0e2e] font-black py-4 rounded-2xl text-lg hover:bg-yellow-300 transition-all">
            Get Started →
          </button>
        </div>
      )}

      {step === 'name' && (
        <div className="w-full max-w-sm space-y-4">
          <h2 className="text-2xl font-bold text-white text-center">What's your name?</h2>
          <p className="text-gray-400 text-center text-sm">We'll personalise your BaZi predictions</p>
          <input className="w-full bg-[#12194a] border border-yellow-500/30 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
            placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
          <input className="w-full bg-[#12194a] border border-yellow-500/30 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
            placeholder="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <button onClick={() => setStep('dob')} disabled={!name.trim() || !email.includes('@')}
            className="w-full bg-yellow-400 text-[#0a0e2e] font-black py-4 rounded-2xl text-lg disabled:opacity-40 hover:bg-yellow-300 transition-all">
            Next →
          </button>
        </div>
      )}

      {step === 'dob' && (
        <div className="w-full max-w-sm space-y-4">
          <h2 className="text-2xl font-bold text-white text-center">Date & Time of Birth</h2>
          <p className="text-gray-400 text-center text-sm">Required for accurate BaZi Four Pillars calculation</p>
          <div>
            <label className="text-gray-400 text-xs uppercase tracking-widest mb-2 block">Date of Birth</label>
            <input className="w-full bg-[#12194a] border border-yellow-500/30 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 text-center text-lg tracking-widest"
              placeholder="YYYY/MM/DD" value={dob} maxLength={10}
              onChange={e => {
                let v = e.target.value.replace(/[^0-9/]/g, '');
                if (v.length === 4 && !v.includes('/')) v += '/';
                if (v.length === 7 && v.lastIndexOf('/') < 5) v += '/';
                setDob(v.slice(0, 10));
              }} />
            {dob && !/^\d{4}\/\d{2}\/\d{2}$/.test(dob) && <p className="text-red-400 text-sm text-center mt-1">Format: YYYY/MM/DD</p>}
          </div>
          <div>
            <label className="text-gray-400 text-xs uppercase tracking-widest mb-2 block">Time of Birth (24h)</label>
            <input
              type="time"
              className="w-full bg-[#12194a] border border-yellow-500/30 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-yellow-400 text-center text-lg"
              value={birthTime}
              onChange={e => setBirthTime(e.target.value)}
            />
            {!birthTime && <p className="text-yellow-500 text-xs text-center mt-1">⏰ Birth time is required for Hour Pillar (时柱) calculation</p>}
          </div>
          <button
            onClick={() => setStep('gender')}
            disabled={!/^\d{4}\/\d{2}\/\d{2}$/.test(dob) || !/^\d{2}:\d{2}$/.test(birthTime)}
            className="w-full bg-yellow-400 text-[#0a0e2e] font-black py-4 rounded-2xl text-lg disabled:opacity-40 hover:bg-yellow-300 transition-all">
            Next →
          </button>
        </div>
      )}

      {step === 'gender' && (
        <div className="w-full max-w-sm space-y-4 text-center">
          <h2 className="text-2xl font-bold text-white">Gender</h2>
          <p className="text-gray-400 text-sm">Affects BaZi element calculations</p>
          {error && <p className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">{error}</p>}
          <div className="flex gap-4 justify-center mt-4">
            {(['M', 'F'] as const).map(g => (
              <button key={g} onClick={() => handleRegister(g)}
                className={`w-36 h-28 bg-[#12194a] rounded-2xl flex flex-col items-center justify-center gap-2 border-2 hover:border-yellow-400 transition-all ${gender === g ? 'border-yellow-400' : 'border-transparent'}`}>
                <span className="text-4xl">{g === 'M' ? '♂' : '♀'}</span>
                <span className="text-white font-semibold">{g === 'M' ? 'Male' : 'Female'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'loading' && (
        <div className="text-center space-y-6">
          <div className="text-7xl animate-pulse">☯️</div>
          <h2 className="text-2xl font-bold text-white">Calculating your BaZi Profile…</h2>
          <p className="text-gray-400">Our AI is deriving your Day Master, Support Element, and Lunar Profile</p>
          <div className="flex justify-center"><div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
        </div>
      )}

      {step === 'reveal' && baziProfile && (
        <div className="w-full max-w-sm text-center space-y-6 animate-fade-in">
          <h2 className="text-2xl font-bold text-white">Your BaZi Profile ✨</h2>
          <div className="rounded-2xl p-6 border-2 border-opacity-50" style={{ backgroundColor: '#0d1340', borderColor: ELEMENT_COLORS[baziProfile.supportElem] }}>
            <div className="text-5xl mb-3">{ELEMENT_EMOJIS[baziProfile.supportElem] || '⭐'}</div>
            <div className="text-2xl font-bold" style={{ color: ELEMENT_COLORS[baziProfile.supportElem] }}>{baziProfile.supportElem}</div>
            <div className="text-gray-400 text-sm mt-1">Support Element</div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'Day Master', value: baziProfile.dayMaster },
                { label: 'Life Path', value: baziProfile.lifePath },
                { label: 'Zodiac', value: baziProfile.lunarProfile?.zodiacAnimal || '—' },
              ].map(stat => (
                <div key={stat.label} className="bg-[#12194a] rounded-xl p-3">
                  <div className="text-yellow-400 font-bold text-base">{stat.value}</div>
                  <div className="text-gray-500 text-xs mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={handleEnterApp} className="w-full bg-yellow-400 text-[#0a0e2e] font-black py-4 rounded-2xl text-lg hover:bg-yellow-300 transition-all">
            Let's Find My Lucky Numbers 🎰
          </button>
        </div>
      )}
    </div>
  );
}
