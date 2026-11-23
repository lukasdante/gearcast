# MVP Changes — roles (Supervisor / Engineer / Technician) + feature changes

Source: `~/Downloads/MVP Changes.docx` (RBAC table + change list) and the Mechanical Leadman user story.
Decisions (2026-11-23): accounts PS-01/02 (were OP-01/02, same passwords) + EN-01/02 + MT-01..04; all four
scope groups in; chat photo → automatic incident report; the feature video is done by the team (not here).

Constraint: don't break what exists. Legacy `operator` role in D1 rows / live session cookies is read as
`supervisor`; existing endpoints keep their shapes (fields are only added).

## 1. Roles + RBAC
- `worker/src/rbac.ts` (shared by worker and app): `Role = 'supervisor' | 'engineer' | 'technician'`,
  `normRole()` (operator → supervisor), route access, `can(role, perm)`, server `blocked(role, method, path)`.
- Technician gets more than today (per table): dashboard, plant overview (view, no edit), assets, PM, spares,
  troubleshoot, incidents, repair/replace (view only), knowledge (test retrieval + open files only), Caster.
- Server-enforced: knowledge upload/delete, incident delete, PM assignment, approvals review, plant access
  grants, layout publish. Client hides the same controls.
- Accounts script: PS/EN/MT; SQL also deletes old OP-xx rows. Login with 3 tabs; TopBar label; Caster prompt.

## 2. Quick fixes
- Repair/Replace: replacement options = brand/model from Equipment_Register + matching suppliers
  (OEM by manufacturer, alternatives by supplier_type) with lead time and contact.
- Incident Field 3: selectable range 1w / 2w / 1m / 6m / 1y (default stays 6 weeks); failure date marked.
- Incident report: Photo 1 beside the summary (app draft view, PDF, DOCX).
- Knowledge base: retrieved/indexed files open (`GET /api/knowledge/docs/{id}/file`, built-in manuals too).
- Technician story (identify problem → repair actions + materials): Troubleshoot shows the asset's
  maintenance history and the materials needed (parts, stock, location, supplier) next to the steps.

## 3. Approvals (PM findings + major spare deployment)
- D1 `approvals` (kind, status, payload, file, created_by/reviewed_by). Kinds: `pm_findings`,
  `spare_deploy`, `layout_change`.
- PM: technician records findings (tablet form) or uploads a scanned job sheet → pending; Supervisor or
  Engineer approves → the PM counts as done (last-done date moves). Approval queue on PM page.
- Spares: technician deploys accessories (valves, lubrication, consumables) directly; pumps/motors and
  stored spare units go to approval. Technicians can't add new spare parts.

## 4. Layout approval + plant access
- Plant layouts move to D1 (`plants`), still cached in the browser. Supervisor edits publish directly,
  Engineer edits become a `layout_change` approval for the Supervisor, Technician can't edit.
- `plant_access` (username, plant, expires_at): users see only their plants; Supervisor grants temporary
  access (emergency) with an expiry. Default plant assigned to everyone.

## 5. Chat photo → incident report
- Caster input gets "attach photo"; `create_incident` puts the attached photo in the report as Photo 1.

## 6. Three pump areas (6 centrifugal transfer pumps)
- P-301A/B (W03→W04), P-401A/B (W06→W07), P-501A/B (W07→W08), duty/standby pairs, layout positions.
  Placeholder data (basis "Assumed – pending raw data") from a single overlay file until Anthony's update.

## 7. Verify, then deploy (together)
- `npm run typecheck`, app build, local `wrangler dev` smoke per role; then D1 migration + accounts on remote,
  `npm run deploy`.
