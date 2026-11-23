CREATE TABLE IF NOT EXISTS incidents (report_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, rec TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS docs (doc_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, meta TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS upload_chunks (id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, seq INTEGER NOT NULL, chunk TEXT NOT NULL, tf TEXT NOT NULL, dl INTEGER NOT NULL, vec TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS upload_chunks_doc ON upload_chunks (doc_id);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, iterations INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, k TEXT NOT NULL, n REAL NOT NULL DEFAULT 0, PRIMARY KEY (day, k));
-- approvals: PM findings, major spare deployments, engineer layout edits (src/approvals.ts)
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL, payload TEXT NOT NULL,
  file_type TEXT, file_name TEXT, file_bytes INTEGER, created_by TEXT NOT NULL, created_role TEXT NOT NULL, created_at TEXT NOT NULL,
  reviewed_by TEXT, reviewed_at TEXT, review_note TEXT);
CREATE INDEX IF NOT EXISTS approvals_kind ON approvals (kind, status);
-- plant layouts shared between users, and who may open which plant (src/plants.ts)
CREATE TABLE IF NOT EXISTS plants (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, name TEXT NOT NULL, doc TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plant_access (username TEXT NOT NULL, plant_id TEXT NOT NULL, expires_at TEXT, granted_by TEXT NOT NULL, granted_at TEXT NOT NULL, reason TEXT,
  PRIMARY KEY (username, plant_id));
