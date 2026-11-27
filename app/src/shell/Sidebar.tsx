import { Icon } from './icons';
import { navigate, type Route } from '../store/route';
import { useAuth, useCan } from '../store/authStore';
import { useScan } from '../qr/scanStore';

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
  const labels = useCan('qr.labels');
  const nav = [...(tech ? NAV.map(n => (n.route === 'pm' ? { ...n, label: 'My tasks' } : n)) : NAV),
    ...(labels ? [{ route: 'labels' as Route, label: 'QR labels', icon: 'print' }] : [])];
  const openScanner = useScan(s => s.openScanner);
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
      <button type="button" className="nav-item nav-scan" onClick={openScanner}>
        <Icon name="qr" size={18} />
        <span>Scan QR</span>
      </button>
    </nav>
  );
}
