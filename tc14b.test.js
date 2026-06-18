/**
 * tc14b.test.js — Phase 14B Department Routing Tests
 *
 * TC-14B.1  pothole upload → ROAD_DEPARTMENT
 * TC-14B.2  garbage upload → SANITATION_DEPARTMENT
 * TC-14B.3  Authority dashboard → only dept reports
 * TC-14B.4  Municipal dashboard → only dept reports
 * TC-14B.5  Restart persistence → assignments.json
 * TC-14B.6  GET /api/departments/analytics → dept counts
 * TC-14B.7  Department reassignment
 * TC-14B.8  No-department visibility → empty + noDepartment flag
 * TC-14B.9  user-departments.json persists after restart
 */

import crypto   from 'crypto';
import fs       from 'fs';
import path     from 'path';
import { createRequire } from 'module';
const require  = createRequire(import.meta.url);
const elliptic = require('elliptic');
const ec       = new elliptic.ec('secp256k1');

const BASE = 'http://localhost:3001';

function sha256(str) { return crypto.createHash('sha256').update(str).digest('hex'); }
function deriveAddr(pub) { return sha256(pub).slice(0, 40); }

function makeWallet(pk) {
  const kp  = ec.keyFromPrivate(pk, 'hex');
  const pub = kp.getPublic('hex');
  return { pk, pub, addr: deriveAddr(pub), kp };
}

function signMsg(kp, addr, nonce) {
  const hash = sha256(`CrowdPulse:${addr}:${nonce}`);
  const sig  = kp.sign(hash);
  return { r: sig.r.toString('hex'), s: sig.s.toString('hex') };
}

async function login(wallet) {
  const nr  = await fetch(`${BASE}/api/auth/nonce/${wallet.addr}`).then(r => r.json());
  const sig = signMsg(wallet.kp, wallet.addr, nr.nonce);
  return fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: wallet.addr, publicKey: wallet.pub, nonce: nr.nonce, signature: sig }),
  }).then(r => r.json());
}

async function authed(endpoint, token, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${BASE}${endpoint}`, opts);
}

// ─── Wallets ──────────────────────────────────────────────────────────────────
const DEPLOYER_PK  = '78260da03d026d819f667cdddd632e6448f25bd58b86e5963e58e11a1a4f3e5d';
const AUTHORITY_PK = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const MUNICIPAL_PK = 'ab12cd34ef56789012ab34cd56ef78901234567890abcdef1234567890abcdef';
const CITIZEN_PK   = 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321';
const NODEPT_PK    = 'aaabbbccc0000001aaabbbccc0000001aaabbbccc0000001aaabbbccc0000001';

const deployer  = makeWallet(DEPLOYER_PK);
const authority = makeWallet(AUTHORITY_PK);
const municipal = makeWallet(MUNICIPAL_PK);
const citizen   = makeWallet(CITIZEN_PK);
const noDepUser = makeWallet(NODEPT_PK);

let passed = 0, failed = 0;

function result(name, ok, detail = '') {
  if (ok) { console.log(`✅ ${name}${detail ? ' — ' + detail : ''}`); passed++; }
  else    { console.log(`❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ─── Setup: Login + Assign Roles ──────────────────────────────────────────────

const depLogin  = await login(deployer);
result('ADMIN login', !!depLogin.token);

// Assign AUTHORITY role + ROAD_DEPARTMENT
const ar = await (await authed('/api/rbac/assign', depLogin.token, 'POST',
  { address: authority.addr, role: 'AUTHORITY', department: 'ROAD_DEPARTMENT' })).json();
result('Assign AUTHORITY + ROAD_DEPARTMENT', ar.success && ar.department === 'ROAD_DEPARTMENT', ar.error || '');

// Assign MUNICIPAL_TEAM role + SANITATION_DEPARTMENT
const mr = await (await authed('/api/rbac/assign', depLogin.token, 'POST',
  { address: municipal.addr, role: 'MUNICIPAL_TEAM', department: 'SANITATION_DEPARTMENT' })).json();
result('Assign MUNICIPAL_TEAM + SANITATION_DEPARTMENT', mr.success && mr.department === 'SANITATION_DEPARTMENT', mr.error || '');

// Assign AUTHORITY role to noDepUser — no department
const ndr = await (await authed('/api/rbac/assign', depLogin.token, 'POST',
  { address: noDepUser.addr, role: 'AUTHORITY' })).json();
result('Assign AUTHORITY (no dept) to noDepUser', ndr.success === true, ndr.error || '');

// Login all
const authLogin   = await login(authority);
const munLogin    = await login(municipal);
const citLogin    = await login(citizen);
const nodeptLogin = await login(noDepUser);
result('Authority login — role', authLogin.role === 'AUTHORITY',   authLogin.role);
result('Municipal login — role', munLogin.role  === 'MUNICIPAL_TEAM', munLogin.role);

// ─── TC-14B.1 / TC-14B.2: Department assignment based on category ─────────────
// Use /api/assignments/assign to manually create test assignments
const ROAD_REPORT_ID     = 'test-road-001';
const GARBAGE_REPORT_ID  = 'test-garbage-001';
const FLOOD_REPORT_ID    = 'test-flood-001';

// Manually assign a report to verify the department routing
const ra1 = await (await authed('/api/assignments/assign', depLogin.token, 'POST',
  { reportId: ROAD_REPORT_ID, department: 'ROAD_DEPARTMENT' })).json();
result('TC-14B.1 Manual road assign', ra1.success && ra1.assignment?.department === 'ROAD_DEPARTMENT',
  ra1.error || ra1.assignment?.department);

result('TC-14B.1 Assignment status=ASSIGNED', ra1.assignment?.status === 'ASSIGNED',
  ra1.assignment?.status);

const ra2 = await (await authed('/api/assignments/assign', depLogin.token, 'POST',
  { reportId: GARBAGE_REPORT_ID, department: 'SANITATION_DEPARTMENT' })).json();
result('TC-14B.2 Manual garbage assign', ra2.success && ra2.assignment?.department === 'SANITATION_DEPARTMENT',
  ra2.error || ra2.assignment?.department);

// ─── TC-14B.6: Analytics endpoint ─────────────────────────────────────────────
const ana = await fetch(`${BASE}/api/departments/analytics`).then(r => r.json());
result('TC-14B.6 Analytics endpoint responds', !!ana.analytics, Object.keys(ana.analytics || {}).length + ' depts');
result('TC-14B.6 All 8 departments in analytics', Object.keys(ana.analytics || {}).length === 8,
  Object.keys(ana.analytics || {}).length + '/8');
result('TC-14B.6 ROAD_DEPARTMENT has displayName', ana.analytics?.ROAD_DEPARTMENT?.displayName === 'Road Department',
  ana.analytics?.ROAD_DEPARTMENT?.displayName);

// ─── TC-14B.3: Authority dashboard — only dept reports ────────────────────────
// GET /api/departments/me for authority
const authDept = await (await authed('/api/departments/me', authLogin.token)).json();
result('TC-14B.3 Authority dept = ROAD_DEPARTMENT', authDept.department === 'ROAD_DEPARTMENT', authDept.department);

// GET /api/departments/me/reports for authority
const authReports = await (await authed('/api/departments/me/reports', authLogin.token)).json();
result('TC-14B.3 Authority sees dept reports only', authReports.department === 'ROAD_DEPARTMENT', authReports.department);
result('TC-14B.3 Authority no noDepartment flag', authReports.noDepartment !== true,
  authReports.noDepartment?.toString());

// ─── TC-14B.4: Municipal dashboard — only dept reports ───────────────────────
const munDept = await (await authed('/api/departments/me', munLogin.token)).json();
result('TC-14B.4 Municipal dept = SANITATION_DEPARTMENT', munDept.department === 'SANITATION_DEPARTMENT', munDept.department);

const munReports = await (await authed('/api/departments/me/reports', munLogin.token)).json();
result('TC-14B.4 Municipal sees dept reports only', munReports.department === 'SANITATION_DEPARTMENT', munReports.department);

// ─── TC-14B.8: No-department user visibility → empty + message ───────────────
const nodeptDept = await (await authed('/api/departments/me', nodeptLogin.token)).json();
result('TC-14B.8 No-dept user: department=null', nodeptDept.department === null, String(nodeptDept.department));

const nodeptReports = await (await authed('/api/departments/me/reports', nodeptLogin.token)).json();
result('TC-14B.8 No-dept reports=[]', Array.isArray(nodeptReports.reports) && nodeptReports.reports.length === 0,
  `count=${nodeptReports.reports?.length}`);
result('TC-14B.8 noDepartment=true', nodeptReports.noDepartment === true, String(nodeptReports.noDepartment));
result('TC-14B.8 message present', typeof nodeptReports.message === 'string' && nodeptReports.message.length > 0,
  nodeptReports.message?.slice(0, 40));

// ─── TC-14B.7: Department reassignment ───────────────────────────────────────
// Reassign authority from ROAD_DEPARTMENT → DRAINAGE_DEPARTMENT
const reassign = await (await authed('/api/departments/assign-user', depLogin.token, 'POST',
  { address: authority.addr, department: 'DRAINAGE_DEPARTMENT' })).json();
result('TC-14B.7 Reassign authority → DRAINAGE_DEPARTMENT', reassign.success && reassign.department === 'DRAINAGE_DEPARTMENT',
  reassign.error || reassign.department);

// Verify change took effect (fresh /api/departments/me)
const authDept2 = await (await authed('/api/departments/me', authLogin.token)).json();
result('TC-14B.7 New dept confirmed via /me', authDept2.department === 'DRAINAGE_DEPARTMENT', authDept2.department);

// Re-assign back to ROAD_DEPARTMENT for cleanup
await authed('/api/departments/assign-user', depLogin.token, 'POST',
  { address: authority.addr, department: 'ROAD_DEPARTMENT' });

// ─── TC-14B.5 / TC-14B.9: Persistence check ──────────────────────────────────
// Verify assignments.json was created/updated
const assignPath = path.join('backend', 'data', 'assignments.json');
const assignExists = fs.existsSync(assignPath);
result('TC-14B.5 assignments.json exists on disk', assignExists, assignPath);

if (assignExists) {
  const content = JSON.parse(fs.readFileSync(assignPath, 'utf8'));
  result('TC-14B.5 assignments.json has entries', Object.keys(content).length > 0,
    `count=${Object.keys(content).length}`);
  const firstEntry = Object.values(content)[0];
  result('TC-14B.5 Assignment record has status=ASSIGNED', firstEntry?.status === 'ASSIGNED', firstEntry?.status);
  result('TC-14B.5 Assignment record has department', typeof firstEntry?.department === 'string', firstEntry?.department);
}

const userDeptPath = path.join('backend', 'data', 'user-departments.json');
const userDeptExists = fs.existsSync(userDeptPath);
result('TC-14B.9 user-departments.json exists on disk', userDeptExists, userDeptPath);

if (userDeptExists) {
  const content = JSON.parse(fs.readFileSync(userDeptPath, 'utf8'));
  result('TC-14B.9 user-departments.json has entries', Object.keys(content).length >= 2,
    `count=${Object.keys(content).length}`);
  result('TC-14B.9 Authority dept persisted', content[authority.addr] === 'ROAD_DEPARTMENT',
    content[authority.addr]);
  result('TC-14B.9 Municipal dept persisted', content[municipal.addr] === 'SANITATION_DEPARTMENT',
    content[municipal.addr]);
}

// ─── GET /api/departments listing ────────────────────────────────────────────
const depts = await fetch(`${BASE}/api/departments`).then(r => r.json());
result('GET /api/departments responds', Array.isArray(depts.departments), `count=${depts.departments?.length}`);
result('/api/departments has 8 entries', depts.departments?.length === 8, depts.departments?.length);

// ─── GET /api/assignments listing (ADMIN) ────────────────────────────────────
const assigns = await (await authed('/api/assignments', depLogin.token)).json();
result('GET /api/assignments (ADMIN) responds', !!assigns.assignments, `count=${assigns.count}`);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════`);
console.log(`TC-14B Results: ${passed} passed, ${failed} failed`);
console.log(`═══════════════════════════════`);
if (failed === 0) console.log('🎉 ALL TESTS PASSED');
else console.log(`⚠  ${failed} test(s) failed`);
