import { useState } from 'react';
import { useAuth, ROLE_LABEL, type Role } from '../store/authStore';
import '../styles/login.css';

const ACCOUNTS: Record<Role, string[]> = { supervisor: ['PS-01', 'PS-02'], engineer: ['EN-01', 'EN-02'], technician: ['MT-01', 'MT-02', 'MT-03', 'MT-04'] };
const HINT: Record<Role, string> = {
  supervisor: 'Full plant view. Approves PM findings, spare deployments and layout changes; grants temporary plant access.',
  engineer: 'Full plant view. Approves PM findings and spare deployments; layout edits go to the Plant Supervisor for approval.',
  technician: 'Your PM tasks and findings, troubleshooting, incidents, spares and Caster. Major records go for approval.',
};

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
          {(['supervisor', 'engineer', 'technician'] as Role[]).map(r => (
            <button key={r} type="button" role="tab" aria-selected={role === r} className={role === r ? 'active' : ''} onClick={() => pick(r)}>
              {r === 'supervisor' ? 'Supervisor' : ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <p className="login-hint">{HINT[role]}</p>
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
