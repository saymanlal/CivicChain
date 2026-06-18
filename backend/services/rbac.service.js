/**
 * rbac.service.js — CrowdPulse Role-Based Access Control  (Phase 14A)
 *
 * Manages address → role mappings, persisted to backend/data/roles.json.
 * On first startup, auto-seeds the deployer address as ADMIN.
 *
 * Valid roles: CITIZEN | AUTHORITY | MUNICIPAL_TEAM | ADMIN
 */

import fs            from 'fs';
import path          from 'path';
import crypto        from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const require    = createRequire(import.meta.url);
const elliptic   = require('elliptic');
const ec         = new elliptic.ec('secp256k1');

const LOG         = '[RBAC]';
const ROLES_PATH  = path.join(__dirname, '..', 'data', 'roles.json');

export const VALID_ROLES = ['CITIZEN', 'AUTHORITY', 'MUNICIPAL_TEAM', 'ADMIN'];
const DEFAULT_ROLE = 'CITIZEN';

// ─── Role Store ──────────────────────────────────────────────────────────────

let roleStore = {}; // address (lowercase) → role

function loadStore() {
  try {
    if (fs.existsSync(ROLES_PATH)) {
      roleStore = JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'));
      console.log(`${LOG} Loaded ${Object.keys(roleStore).length} role assignments from disk`);
    }
  } catch (e) {
    console.warn(`${LOG} Failed to load roles.json:`, e.message);
    roleStore = {};
  }
}

function saveStore() {
  try {
    const dir = path.dirname(ROLES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ROLES_PATH, JSON.stringify(roleStore, null, 2), 'utf8');
  } catch (e) {
    console.error(`${LOG} Failed to save roles.json:`, e.message);
  }
}

// ─── Deployer Seed ───────────────────────────────────────────────────────────

function deriveDeployerAddress() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk || pk.length < 60) return null;
  try {
    const kp        = ec.keyFromPrivate(pk, 'hex');
    const publicKey = kp.getPublic('hex');
    return crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 40);
  } catch {
    return null;
  }
}

function seedDeployer() {
  const deployer = deriveDeployerAddress();
  if (!deployer) {
    console.warn(`${LOG} Could not derive deployer address — ADMIN auto-seed skipped`);
    return;
  }
  if (!roleStore[deployer]) {
    roleStore[deployer] = 'ADMIN';
    saveStore();
    console.log(`${LOG} Auto-seeded deployer ${deployer} as ADMIN`);
  } else {
    console.log(`${LOG} Deployer ${deployer} already has role: ${roleStore[deployer]}`);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the role for an address. Returns 'CITIZEN' if unassigned.
 */
export function getRole(address) {
  if (!address) return DEFAULT_ROLE;
  return roleStore[address.toLowerCase()] || DEFAULT_ROLE;
}

/**
 * Assign a role to an address.
 */
export function setRole(address, role) {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(', ')}`);
  }
  roleStore[address.toLowerCase()] = role;
  saveStore();
  console.log(`${LOG} Assigned role ${role} to ${address}`);
}

/**
 * Get all role assignments.
 */
export function getAllRoles() {
  return { ...roleStore };
}

// ─── Init ────────────────────────────────────────────────────────────────────

loadStore();
seedDeployer();
