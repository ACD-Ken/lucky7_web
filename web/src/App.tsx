import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import PredictionsPage from './pages/PredictionsPage';
import HistoryPage from './pages/HistoryPage';
import ProfilePage from './pages/ProfilePage';
import AnalyticsPage from './pages/AnalyticsPage';
import { useUserStore } from './stores/userStore';

export default function App() {
  const { isLoading, loadUser } = useUserStore();
  const location = useLocation();

  useEffect(() => { loadUser(); }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0e2e]">
        <div className="text-6xl mb-4">🎰</div>
        <div className="text-white text-2xl font-bold">Lucky7 TOTO AI</div>
        <div className="text-gray-400 mt-2">Loading…</div>
      </div>
    );
  }

  const showNav = !['/', '/onboarding'].includes(location.pathname);

  return (
    <div className="min-h-screen bg-[#0a0e2e] text-white">
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/predictions" element={<PredictionsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      {showNav && <BottomNav />}
    </div>
  );
}
