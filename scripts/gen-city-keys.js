/**
 * gen-city-keys.js — Generate per-city AUTHORITY + MUNICIPAL_TEAM wallets.
 *
 * Output:
 *   city-keys.json                       — the credentials (address + privateKey) per city/role
 *   backend/data/roles.json              — address → role           (merged, ADMIN preserved)
 *   backend/data/user-departments.json   — address → { department, city }  (merged)
 *
 * Logging in with a city's private key then shows ONLY that city's issues
 * (authority/municipal report visibility is city-scoped — see department.controller.js).
 */
import fs   from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const elliptic  = require('elliptic');
const ec        = new elliptic.ec('secp256k1');

const ROOT          = path.join(__dirname, '..');
const CITIES_PATH   = path.join(ROOT, 'backend', 'data', 'cities.json');
const ROLES_PATH    = path.join(ROOT, 'backend', 'data', 'roles.json');
const DEPT_PATH     = path.join(ROOT, 'backend', 'data', 'user-departments.json');
const OUT_PATH      = path.join(ROOT, 'city-keys.json');

// Department label per role (visibility is city-wide; this is cosmetic).
const AUTHORITY_DEPT = 'URBAN_DEPARTMENT';
const MUNICIPAL_DEPT = 'GENERAL_DEPARTMENT';

function newWallet() {
  const kp         = ec.genKeyPair();
  const privateKey = kp.getPrivate('hex').padStart(64, '0');
  const publicKey  = kp.getPublic('hex');
  const address    = crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 40);
  return { address, privateKey, publicKey };
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

const cities = readJson(CITIES_PATH, []);
const roles  = readJson(ROLES_PATH, {});       // preserve existing (e.g. deployer ADMIN)
const depts  = readJson(DEPT_PATH, {});

const out = {};

for (const c of cities) {
  const authority = newWallet();
  const municipal = newWallet();

  out[c.code] = {
    city:     c.code,
    cityName: c.name,
    state:    c.state,
    authority: { role: 'AUTHORITY',       department: AUTHORITY_DEPT, ...authority },
    municipal: { role: 'MUNICIPAL_TEAM',  department: MUNICIPAL_DEPT, ...municipal },
  };

  // Seed RBAC roles
  roles[authority.address] = 'AUTHORITY';
  roles[municipal.address] = 'MUNICIPAL_TEAM';

  // Seed jurisdiction (department + city)
  depts[authority.address] = { department: AUTHORITY_DEPT, city: c.code };
  depts[municipal.address] = { department: MUNICIPAL_DEPT, city: c.code };
}

fs.writeFileSync(OUT_PATH,   JSON.stringify(out,   null, 2), 'utf8');
fs.writeFileSync(ROLES_PATH, JSON.stringify(roles, null, 2), 'utf8');
fs.writeFileSync(DEPT_PATH,  JSON.stringify(depts, null, 2), 'utf8');

console.log(`✅ Generated ${cities.length} cities × 2 roles = ${cities.length * 2} wallets`);
console.log(`   → ${OUT_PATH}`);
console.log(`   → ${ROLES_PATH} (${Object.keys(roles).length} roles)`);
console.log(`   → ${DEPT_PATH} (${Object.keys(depts).length} jurisdictions)`);
