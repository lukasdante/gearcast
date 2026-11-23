/** Signed-in user (plant supervisor, engineer or technician). The session is an HttpOnly cookie set by /api/auth/login. */
import { create } from 'zustand';
import { can, normRole, type Perm, type Role } from '../../../worker/src/rbac';

export type { Role, Perm };
export { ROLE_LABEL } from '../../../worker/src/rbac';
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
      const u = r.ok ? (await r.json()).user : null;
      set({ user: u ? { ...u, role: normRole(u.role) } : null, ready: true });
    } catch { set({ user: null, ready: true }); }
  },
  login: async (username, password) => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || 'Sign-in failed');
    set({ user: { ...j.user, role: normRole(j.user.role) } });
  },
  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    set({ user: null });
  },
}));

if (typeof window !== 'undefined') window.addEventListener('gearcast:unauthorized', () => useAuth.setState({ user: null }));

/** Does the signed-in user have this permission (rbac.ts)? */
export const useCan = (p: Perm) => useAuth(s => can(s.user?.role, p));
export const canNow = (p: Perm) => can(useAuth.getState().user?.role, p);
