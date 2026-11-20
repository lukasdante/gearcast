/** Signed-in user (technician or operator). The session is an HttpOnly cookie set by /api/auth/login. */
import { create } from 'zustand';

export type Role = 'technician' | 'operator';
export interface User { username: string; role: Role; name: string }

interface AuthState {
  user: User | null;
  ready: boolean;
  load: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>()(set => ({
  user: null,
  ready: false,
  load: async () => {
    try {
      const r = await fetch('/api/auth/me');
      set({ user: r.ok ? (await r.json()).user : null, ready: true });
    } catch { set({ user: null, ready: true }); }
  },
  login: async (username, password) => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || 'Sign-in failed');
    set({ user: j.user });
  },
  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    set({ user: null });
  },
}));

if (typeof window !== 'undefined') window.addEventListener('gearcast:unauthorized', () => useAuth.setState({ user: null }));

/** Pages each role can open. Technicians: their assigned PM tasks, troubleshooting, spare readiness. */
export const TECH_ROUTES = ['pm', 'troubleshoot', 'spares'] as const;
