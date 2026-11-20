/** PM task assignments, shared through the API so technicians see what the operator assigned to them.
 * localStorage (gearcast.pm.assign.v1) stays the in-app cache read by the PM page and Caster's operations. */
export const AKEY = 'gearcast.pm.assign.v1';

const save = (m: Record<string, string>) => { try { localStorage.setItem(AKEY, JSON.stringify(m)); } catch { /* storage unavailable */ } };

export async function syncAssignments() {
  try {
    const r = await fetch('/api/pm/assignments');
    if (!r.ok) return;
    save((await r.json()).assignments || {});
    window.dispatchEvent(new Event('gearcast:pm-assign'));
  } catch { /* offline: keep the cache */ }
}

export async function pushAssignments(m: Record<string, string>) {
  save(m);
  await fetch('/api/pm/assignments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignments: m }) }).catch(() => {});
}
