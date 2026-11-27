# GearCast on Cloudflare

One Worker serves the built app (`app/dist`, SPA fallback) and the API under `/api/*`, at
https://gearcast.engrlouis.dev. It is a port of the Python backend (`backend/`, still the reference
implementation) with the same paths and the same JSON and SSE shapes.

## Architecture

| Piece | Where |
|---|---|
| API router, auth | `src/index.ts`, `src/auth.ts` |
| Plant data + date shift + status logic | `src/data.ts`, `src/time.ts` (bundled JSON from `src/generated/`) |
| Tools, costs, RR model | `src/tools.ts`, `src/costs.ts`, `src/rr.ts` |
| Troubleshooter, incidents | `src/troubleshoot.ts`, `src/incidents.ts` |
| Caster chat (DeepSeek streaming tool loop, SSE) | `src/chat.ts`, `src/llm.ts` |
| Knowledge base (BM25 + bge-small dense, RRF) | `src/rag.ts`, `src/uploads.ts` |
| Incident form fill (.docx) and PDF layout | `src/doc/` (shared with the app) |
| Python-compatible number/string formatting | `src/py.ts` |

- **Data**: `scripts/build_data.py` reads `ref/prototype_data_extracted.json` with the backend's own code. It keeps
  only the tables the backend uses, stores the readings in columns, and builds the RAG corpus with `rag.py`'s chunkers
  plus precomputed BM25 postings. Values are stored unshifted. The Worker shifts dates at request time from today's
  date in Asia/Manila (same rule as `data.py`, including ISO dates inside long text).
- **Dense retrieval**: Workers AI `@cf/baai/bge-small-en-v1.5` with CLS pooling, like fastembed.
  - The vectors are kept in Vectorize `gearcast-kb` (384 dims, cosine, metadata `source_type`/`source_id`).
  - They are also kept as an exact copy: R2 `index/builtin-v4-423.f32` for built-in chunks, D1 for uploads.
  - The backend fuses the dense rank of every candidate chunk, which Vectorize's topK ≤ 100 cannot return. Search
    therefore scores all candidates exactly against the copy (about 160k multiply-adds).
- **Storage**:
  - D1 `gearcast-db`: incidents, upload docs and chunks, users, PM assignments.
  - R2 `gearcast-files`: incident PDFs, uploaded files, built-in vectors.
- **Incident PDFs** are rendered in the browser with the same `src/doc` code:
  - Rendering takes about 400–600 ms of CPU, more than the free plan's 10 ms per request.
  - After submitting, the app fetches `GET /api/incidents/{id}/pdf-source`, renders the PDF and uploads it with
    `PUT /api/incidents/{id}/pdf`. Downloads then serve the stored file.
  - `GET /pdf` returns 409 while no file exists, and the app then renders it.
  - `?render=server` (and `POST /api/incidents/render`) still render in the Worker, for local dev or a paid plan.
- **Login**: plant supervisors PS-01..02 (formerly operators OP-01..02), engineers EN-01..02, technicians MT-01..04.
  - Passwords are stored as PBKDF2 hashes in D1; the session is an HMAC-signed cookie.
  - Roles and permissions: `src/rbac.ts` (`blocked()` is enforced for every `/api/*` call; finer checks in
    `approvals.ts` / `plants.ts`). Technicians use every page; they cannot index or delete documents, delete
    incidents, assign PM, approve, publish layouts or grant plant access, and their PM findings and major spare
    deployments wait for a Plant Supervisor or Engineer.

## Resources and secrets

- D1 `gearcast-db`, R2 `gearcast-files`, Vectorize `gearcast-kb`, Workers AI binding `AI`.
- Secrets: `DEEPSEEK_API_KEY`, `ADMIN_TOKEN` (for the seed endpoint) and `AUTH_SECRET` (signs session cookies).
- Local dev reads `.dev.vars`, which is git-ignored and contains `DEV_MODE=1`, the three secrets and the DeepSeek key.

## Setup, seed, deploy

```bash
npm install
npm run build:data                                   # only when the dataset or rag.py chunking changes
npx wrangler d1 execute gearcast-db --remote --file schema.sql
node scripts/make_accounts.mjs                       # writes ../.accounts (git-ignored) + .wrangler/accounts.sql
npx wrangler d1 execute gearcast-db --remote --file .wrangler/accounts.sql
grep '^DEEPSEEK_API_KEY=' ../backend/.env | cut -d= -f2- | npx wrangler secret put DEEPSEEK_API_KEY
openssl rand -hex 32 | npx wrangler secret put AUTH_SECRET
openssl rand -hex 16 | npx wrangler secret put ADMIN_TOKEN    # keep a copy for seeding
npm run deploy                                       # vite build + wrangler deploy (custom domain)
# seed the built-in vectors (Workers AI → R2 + Vectorize), with a Plant Supervisor or Engineer session cookie:
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" -b "gc_session=…" https://gearcast.engrlouis.dev/api/admin/seed
# pre-render the historical incident PDFs:
npx esbuild scripts/seed_pdfs.ts --bundle --platform=node --format=esm --outfile=.wrangler/seed_pdfs.mjs
node .wrangler/seed_pdfs.mjs https://gearcast.engrlouis.dev
```

For local dev, use the same commands with `--local`, then `npx wrangler dev` (port 8787). The Vite dev server
proxies `/api` to it.

## Parity and eval

Run both with the Python backend on :8000 and `wrangler dev` on :8787, after seeding locally:

```bash
node test/parity.mjs     # diffs tools, rr, incidents, knowledge search, troubleshoot tree, draft (no LLM)
node test/eval.mjs       # troubleshoot retrieval eval (120 phrases): top-1 / top-3 symptom, first procedure
```

`DEV_MODE=1` (local only) makes the Worker accept `x-gearcast-as-of`, so it uses the Python server's clock, and
`?no_llm=1` on drafts. Draft parity is checked against `incidents.build_draft(use_llm=False)`.
