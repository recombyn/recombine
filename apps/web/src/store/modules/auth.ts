import { createSlice } from '@reduxjs/toolkit';
import { setToken as persistToken } from '@/utils/token';

const STORAGE_KEY = 'resume-scene-auth-v1';

export type AuthUser = {
  email: string;
  name: string;
  provider: 'email' | 'google';
  avatar?: string | null;
  id?: string;
};

function loadAuth(): { user: AuthUser | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null };
    const parsed = JSON.parse(raw);
    return { user: parsed?.user ?? null };
  } catch {
    return { user: null };
  }
}

function persist(user: AuthUser | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
}

const initialState = loadAuth();

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action) {
      state.user = action.payload;
      persist(state.user);
    },
    setSession(state, action) {
      const { user, token } = action.payload as { user: AuthUser; token?: string | null };
      state.user = user;
      persist(user);
      if (token !== undefined) persistToken(token);
    },
    logout(state) {
      state.user = null;
      persist(null);
      persistToken(null);
    },
  },
});

export const { setUser, setSession, logout } = authSlice.actions;
export default authSlice.reducer;
