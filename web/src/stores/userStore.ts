import { create } from 'zustand';

interface BaziProfile {
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
    hourPillar?: {               // present when birthTime was provided
      heavenlyStem: string;
      earthlyBranch: string;
    };
  };
}

interface User {
  id: string;
  name: string;
  email: string;
  dob: string;
  birthTime?: string;           // "HH:MM" 24h format
  gender: string;
  baziProfileJson: BaziProfile | null;
}

interface UserStore {
  user: User | null;
  baziProfile: BaziProfile | null;
  isLoading: boolean;
  setUser: (user: User) => void;
  loadUser: () => void;
  logout: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  baziProfile: null,
  isLoading: true,

  setUser: (user) => {
    // Token is stored as httpOnly cookie (invisible to JS) — only persist profile
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, baziProfile: user.baziProfileJson, isLoading: false });
  },

  loadUser: () => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr) as User;
        set({ user, baziProfile: user.baziProfileJson, isLoading: false });
        return;
      }
    } catch {}
    // Single-user personal deployment — auto-load profile directly
    const profile: User = {
      id: 'b6d40129-19a6-448f-80a1-685a51c57a16',
      name: 'Ken Wong',
      email: 'ken@alsocando.com',
      dob: '1970/02/06',
      birthTime: '',
      gender: 'M',
      baziProfileJson: {
        lifePath: 8,
        dayMaster: 'Ding',
        supportElem: 'Wood',
        lunarProfile: {
          lunarDay: 21,
          lunarMonth: 12,
          heavenlyStem: 'Geng',
          zodiacAnimal: 'Dog',
          earthlyBranch: 'Xu',
        },
      },
    };
    localStorage.setItem('user', JSON.stringify(profile));
    set({ user: profile, baziProfile: profile.baziProfileJson, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('user');
    set({ user: null, baziProfile: null });
  },
}));
