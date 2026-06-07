import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User } from '@/types';

const KEYS = {
  user: 'bchat_current_user',
  onboarded: 'bchat_is_onboarded',
};

async function persistUser(user: User): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.user, JSON.stringify(user));
  } catch (e) {
    console.error('[AuthStore] Failed to persist user:', e);
  }
}

async function persistOnboarded(value: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.onboarded, value ? 'true' : 'false');
  } catch (e) {
    console.error('[AuthStore] Failed to persist onboarded flag:', e);
  }
}

interface AuthState {
  currentUser: User | null;
  isOnboarded: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setCurrentUser: (user: User) => void;
  updateCurrentUser: (updates: Partial<User>) => void;
  setOnboarded: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isOnboarded: false,
  isLoading: false,
  isHydrated: false,

  hydrate: async () => {
    try {
      const [userRaw, onboardedRaw] = await Promise.all([
        SecureStore.getItemAsync(KEYS.user),
        SecureStore.getItemAsync(KEYS.onboarded),
      ]);
      const currentUser = userRaw ? (JSON.parse(userRaw) as User) : null;
      const isOnboarded = onboardedRaw === 'true';
      set({ currentUser, isOnboarded, isHydrated: true });
    } catch (e) {
      console.error('[AuthStore] Hydration failed:', e);
      set({ isHydrated: true });
    }
  },

  setCurrentUser: (user) => {
    set({ currentUser: user });
    persistUser(user);
  },

  updateCurrentUser: (updates) => {
    const current = get().currentUser;
    if (!current) return;
    const updated = { ...current, ...updates };
    set({ currentUser: updated });
    persistUser(updated);
  },

  setOnboarded: (value) => {
    set({ isOnboarded: value });
    persistOnboarded(value);
  },

  setLoading: (value) => set({ isLoading: value }),

  logout: async () => {
    set({ currentUser: null, isOnboarded: false });
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.user),
      SecureStore.deleteItemAsync(KEYS.onboarded),
    ]).catch((e) => console.error('[AuthStore] Failed to clear store on logout:', e));
  },
}));