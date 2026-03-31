import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../services/api';
import { useUserStore } from '../stores/userStore';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { setUser } = useUserStore();
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await loginUser({ email, dob });
      setUser(res.data.user);
      navigate('/home');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login failed. Check your email and date of birth.');
    } finally {
      setLoading(false);
    }
  };

  const dobValid = /^\d{4}\/\d{2}\/\d{2}$/.test(dob);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0e2e] via-[#0d1340] to-[#12194a] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 mb-8">
          <div className="text-7xl">🎰</div>
          <h1 className="text-4xl font-black text-yellow-400">Lucky7</h1>
          <p className="text-xl text-white font-bold">TOTO AI</p>
          <p className="text-gray-400 text-sm">BaZi-powered predictions for every Singapore TOTO draw</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-gray-400 text-xs uppercase tracking-widest mb-2 block">Email Address</label>
            <input
              type="email"
              className="w-full bg-[#12194a] border border-yellow-500/30 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs uppercase tracking-widest mb-2 block">Date of Birth</label>
            <input
              className="w-full bg-[#12194a] border border-yellow-500/30 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 text-center text-lg tracking-widest"
              placeholder="YYYY/MM/DD"
              value={dob}
              maxLength={10}
              onChange={e => {
                let v = e.target.value.replace(/[^0-9/]/g, '');
                if (v.length === 4 && !v.includes('/')) v += '/';
                if (v.length === 7 && v.lastIndexOf('/') < 5) v += '/';
                setDob(v.slice(0, 10));
              }}
              required
            />
            {dob && !dobValid && <p className="text-red-400 text-xs text-center mt-1">Format: YYYY/MM/DD</p>}
          </div>

          {error && <p className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email.includes('@') || !dobValid}
            className="w-full bg-yellow-400 text-[#0a0e2e] font-black py-4 rounded-2xl text-lg disabled:opacity-40 hover:bg-yellow-300 transition-all mt-2"
          >
            {loading ? '⏳ Signing in…' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
}
