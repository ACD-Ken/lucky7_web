import React from 'react';
import { NavLink } from 'react-router-dom';

const tabs = [
  { path: '/home', emoji: '🏠', label: 'Home' },
  { path: '/predictions', emoji: '🎰', label: 'Predict' },
  { path: '/history', emoji: '📋', label: 'History' },
  { path: '/profile', emoji: '👤', label: 'Profile' },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#12194a] border-t border-yellow-500/20 safe-bottom">
      <div className="flex justify-around items-center h-16 px-2">
        {tabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${
                isActive ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300'
              }`
            }
          >
            <span className="text-xl">{tab.emoji}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
