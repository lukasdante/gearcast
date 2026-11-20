// Creates the GearCast login accounts (technicians MT-01..MT-04, operators OP-01..OP-02).
// Writes plain credentials to ../.accounts (git-ignored) and the D1 insert SQL to .wrangler/accounts.sql.
//   node scripts/make_accounts.mjs            # new random passwords
//   node scripts/make_accounts.mjs --reuse    # re-hash the passwords already in ../.accounts
// Then: npx wrangler d1 execute gearcast-db --file .wrangler/accounts.sql [--remote]
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ITER = 10000;
const ACCOUNTS = [
  ['MT-01', 'technician', 'Maintenance technician MT-01'], ['MT-02', 'technician', 'Maintenance technician MT-02'],
  ['MT-03', 'technician', 'Maintenance technician MT-03'], ['MT-04', 'technician', 'Maintenance technician MT-04'],
  ['OP-01', 'operator', 'Operator OP-01'], ['OP-02', 'operator', 'Operator OP-02'],
];
const file = new URL('../../.accounts', import.meta.url);
const old = {};
if (process.argv.includes('--reuse') && existsSync(file))
  for (const l of readFileSync(file, 'utf8').split('\n')) { const m = /^(\S+)\s+\S+\s+(\S+)/.exec(l); if (m && !l.startsWith('#')) old[m[1]] = m[2]; }
const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const pw = () => [...randomBytes(14)].map(b => alphabet[b % alphabet.length]).join('');
const lines = ['# GearCast accounts (keep private; not committed). username  role  password', ''];
const sql = [];
for (const [u, role, name] of ACCOUNTS) {
  const p = old[u] || pw();
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(p, Buffer.from(salt, 'hex'), ITER, 32, 'sha256').toString('hex');
  lines.push(`${u.padEnd(6)}  ${role.padEnd(10)}  ${p}`);
  sql.push(`INSERT INTO users (username, role, name, salt, hash, iterations) VALUES ('${u}', '${role}', '${name}', '${salt}', '${hash}', ${ITER}) ON CONFLICT(username) DO UPDATE SET role = excluded.role, name = excluded.name, salt = excluded.salt, hash = excluded.hash, iterations = excluded.iterations;`);
}
writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
mkdirSync(new URL('../.wrangler/', import.meta.url), { recursive: true });
writeFileSync(new URL('../.wrangler/accounts.sql', import.meta.url), sql.join('\n') + '\n');
console.log(`wrote .accounts (${ACCOUNTS.length} accounts) and worker/.wrangler/accounts.sql`);
