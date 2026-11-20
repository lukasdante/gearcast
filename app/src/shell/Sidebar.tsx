import { Icon } from './icons';
import { navigate, type Route } from '../store/route';
import { useAuth, TECH_ROUTES } from '../store/authStore';

const NAV: { route: Route; label: string; icon: string; soon?: boolean }[] = [
  { route: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { route: 'overview', label: 'Plant Overview', icon: 'plant' },
  { route: 'assets', label: 'Assets', icon: 'assets' },
  { route: 'pm', label: 'PM Monitoring', icon: 'pm' },
  { route: 'spares', label: 'Spare Readiness', icon: 'spares' },
  { route: 'troubleshoot', label: 'Troubleshoot', icon: 'wrench' },
  { route: 'incidents', label: 'Incidents', icon: 'incidents' },
  { route: 'rr', label: 'Repair / Replace', icon: 'cycle' },
  { route: 'knowledge', label: 'Knowledge base', icon: 'book' },
];

export function Sidebar({ route }: { route: Route }) {
  const tech = useAuth(s => s.user?.role === 'technician');
  const nav = tech ? NAV.filter(n => (TECH_ROUTES as readonly string[]).includes(n.route)).map(n => (n.route === 'pm' ? { ...n, label: 'My tasks' } : n)) : NAV;
  return (
    <nav className="sidebar" aria-label="Main">
      {nav.map(n => (
        <button key={n.route} type="button" className={`nav-item${route === n.route ? ' active' : ''}`}
          disabled={n.soon} onClick={() => navigate(n.route)} aria-current={route === n.route ? 'page' : undefined}>
          <Icon name={n.icon} size={18} />
          <span>{n.label}</span>
          {n.soon && <em className="soon">soon</em>}
        </button>
      ))}
    </nav>
  );
}
