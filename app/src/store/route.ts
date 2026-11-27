/** Minimal hash routing: #/overview, #/assets, ... */
import { useSyncExternalStore } from 'react';

export type Route = 'dashboard' | 'overview' | 'assets' | 'pm' | 'spares' | 'incidents' | 'troubleshoot' | 'rr' | 'knowledge' | 'labels';
const ROUTES: Route[] = ['dashboard', 'overview', 'assets', 'pm', 'spares', 'incidents', 'troubleshoot', 'rr', 'knowledge', 'labels'];

const read = (): Route => {
  const r = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'dashboard';
};
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
export const useRoute = () => useSyncExternalStore(subscribe, read);
export const navigate = (r: Route) => { window.location.hash = '/' + r; };
