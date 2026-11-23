/** Role-based access (MVP Changes RBAC table). Shared by the Worker (enforcement) and the app (what to show).
 *  Plant Supervisor: full access, approves, grants temporary plant access. Engineer: full access, but layout edits
 *  need Supervisor approval. Technician: uses the tools, files findings/incidents; major records need approval. */

export type Role = 'supervisor' | 'engineer' | 'technician';
export const ROLES: Role[] = ['supervisor', 'engineer', 'technician'];
export const ROLE_LABEL: Record<Role, string> = { supervisor: 'Plant Supervisor', engineer: 'Engineer', technician: 'Technician' };

/** Old D1 rows and session cookies say 'operator' (renamed to Plant Supervisor). */
export function normRole(r: unknown): Role {
  if (r === 'technician' || r === 'engineer' || r === 'supervisor') return r;
  return r === 'operator' ? 'supervisor' : 'technician';
}

export type Perm =
  | 'kb.manage'          // upload / delete manuals (technicians: test retrieval and open files only)
  | 'incident.delete'
  | 'pm.assign'
  | 'approve'            // approve PM findings and major spare deployments
  | 'spare.add'          // add new spare parts
  | 'spare.deploy.major' // deploy pumps, motors and stored spare units without approval
  | 'rr.edit'            // what-if inputs on Repair / Replace (technicians: view only)
  | 'layout.edit'        // edit a plant layout (engineer: as a draft for approval)
  | 'layout.publish'     // save layout edits directly / approve an engineer's edits
  | 'plant.manage'       // create, rename, delete plant layouts
  | 'access.grant';      // temporary access to other plants (emergencies)

const GRANTS: Record<Role, Perm[]> = {
  supervisor: ['kb.manage', 'incident.delete', 'pm.assign', 'approve', 'spare.add', 'spare.deploy.major', 'rr.edit', 'layout.edit', 'layout.publish', 'plant.manage', 'access.grant'],
  engineer: ['kb.manage', 'incident.delete', 'pm.assign', 'approve', 'spare.add', 'spare.deploy.major', 'rr.edit', 'layout.edit'],
  technician: [],
};
export const can = (role: Role | null | undefined, p: Perm) => !!role && GRANTS[role].includes(p);

/** Endpoints a role may not call (403). Finer checks (e.g. which approvals a role may review) are in the handlers. */
export function blocked(role: Role, method: string, path: string): boolean {
  if (path.startsWith('/api/admin/')) return true;
  const need = (p: Perm) => !can(role, p);
  if ((path === '/api/knowledge/upload' || (method === 'DELETE' && path.startsWith('/api/knowledge/')))) return need('kb.manage');
  if (method === 'DELETE' && path.startsWith('/api/incidents/')) return need('incident.delete');
  if (method === 'PUT' && path === '/api/pm/assignments') return need('pm.assign');
  if (method === 'POST' && /^\/api\/approvals\/[^/]+\/review$/.test(path)) return need('approve') && need('layout.publish');
  if (path.startsWith('/api/plants/access') && method !== 'GET') return need('access.grant');
  if (path.startsWith('/api/plants') && method !== 'GET') return need('layout.publish') && need('plant.manage');
  return false;
}

/** Which roles may review an approval of this kind. */
export const REVIEWERS: Record<string, Role[]> = {
  pm_findings: ['supervisor', 'engineer'],
  spare_deploy: ['supervisor', 'engineer'],
  layout_change: ['supervisor'],
};

/** Spare categories a technician may deploy without approval ("accessories": valves, lubrication, consumables…). */
export const MAJOR_SPARE = (category: string | null | undefined, id = '') =>
  /^SP-/.test(id) || /^(pump|motor|screen)/i.test(String(category ?? ''));
