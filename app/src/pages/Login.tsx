import { useState } from 'react';
import { useAuth, type Role } from '../store/authStore';
import '../styles/login.css';

const ACCOUNTS: Record<Role, string[]> = { technician: ['MT-01', 'MT-02', 'MT-03', 'MT-04'], operator: ['OP-01', 'OP-02'] };

export function Login() {
  const login = useAuth(s => s.login);
  const [role, setRole] = useState<Role>('technician');
  const [username, setUsername] = useState(ACCOUNTS.technician[0]);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = (r: Role) => { setRole(r); setUsername(ACCOUNTS[r][0]); setErr(null); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await login(username, password); } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Sign-in failed'); } finally { setBusy(false); }
  };
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">GearCast</div>
        <p className="login-sub">Franklin Baker – Darong WWTP · Maintenance</p>
        <div className="login-roles" role="tablist" aria-label="Sign in as">
          {(['technician', 'operator'] as Role[]).map(r => (
            <button key={r} type="button" role="tab" aria-selected={role === r} className={role === r ? 'active' : ''} onClick={() => pick(r)}>
              {r === 'technician' ? 'Technician' : 'Operator'}
            </button>
          ))}
        </div>
        <p className="login-hint">{role === 'technician' ? 'Your assigned PM tasks, troubleshooting and spare readiness.' : 'Full plant view: dashboard, assets, PM, incidents, repair or replace, knowledge base and Caster.'}</p>
        <label>Account
          <select value={username} onChange={e => setUsername(e.target.value)}>
            {ACCOUNTS[role].map(a => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label>Password
          <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
        </label>
        {err && <p className="login-err" role="alert">{err}</p>}
        <button type="submit" className="btn primary" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
