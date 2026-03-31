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
    set({ isLoading: false });
  },

  logout: () => {
    // Tell the backend to clear the httpOnly cookie, then wipe local state.
    // Fire-and-forget — clear locally even if the request fails.
    import('../services/api').then(({ logoutUser }) => logoutUser().catch(() => {}));
    localStorage.removeItem('user');
    set({ user: null, baziProfile: null });
  },
}));
