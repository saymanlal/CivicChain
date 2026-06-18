/**
 * auth.service.js — CrowdPulse Wallet Authentication  (Phase 14A)
 *
 * Challenge-response authentication using secp256k1 wallet keys.
 *
 * Flow:
 *   1. generateNonce(address)  →  { nonce, expiresAt }  (stored 5-min)
 *   2. verifyLogin({ address, publicKey, nonce, signature })
 *        → verifies sig, derives address from pubkey, issues JWT
 *   3. verifyToken(token)  →  decoded { address, role, iat, exp }
 */

import crypto        from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { getRole } from './rbac.service.js';

const require  = createRequire(import.meta.url);
const elliptic = require('elliptic');
const jwt      = require('jsonwebtoken');
const ec       = new elliptic.ec('secp256k1');

const LOG = '[AUTH]';

// ─── Nonce Store (in-memory, ephemeral by design) ─────────────────────────────
// address (lowercase) → { nonce: string, expiresAt: ms }
const nonceStore = new Map();
const NONCE_TTL  = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function deriveAddress(publicKeyHex) {
  return sha256(publicKeyHex).slice(0, 40);
}

function cleanExpiredNonces() {
  const now = Date.now();
  for (const [addr, entry] of nonceStore.entries()) {
    if (entry.expiresAt < now) nonceStore.delete(addr);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a one-time nonce for the given address.
 * @param {string} address  — lowercase hex wallet address
 * @returns {{ nonce: string, expiresAt: number }}
 */
export function generateNonce(address) {
  cleanExpiredNonces();
  const nonce     = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + NONCE_TTL;
  nonceStore.set(address.toLowerCase(), { nonce, expiresAt });
  console.log(`${LOG} Nonce generated for ${address.slice(0, 10)}…`);
  return { nonce, expiresAt };
}

/**
 * Verify a wallet login attempt.
 *
 * @param {object} params
 * @param {string} params.address   — claimed wallet address
 * @param {string} params.publicKey — full secp256k1 public key (hex, compressed or uncompressed)
 * @param {string} params.nonce     — nonce received from generateNonce
 * @param {{ r: string, s: string }} params.signature — secp256k1 signature of sha256("CrowdPulse:ADDRESS:NONCE")
 *
 * @returns {{ token: string, address: string, role: string }}
 * @throws {Error} on any verification failure
 */
export function verifyLogin({ address, publicKey, nonce, signature }) {
  const addrLower = address.toLowerCase();

  // ── 1. Check nonce ───────────────────────────────────────────────────────
  const stored = nonceStore.get(addrLower);
  if (!stored) {
    throw new Error('No pending nonce for this address. Request a new nonce first.');
  }
  if (stored.nonce !== nonce) {
    throw new Error('Nonce mismatch.');
  }
  if (Date.now() > stored.expiresAt) {
    nonceStore.delete(addrLower);
    throw new Error('Nonce expired. Request a new nonce.');
  }

  // ── 2. Delete nonce (one-time use) ───────────────────────────────────────
  nonceStore.delete(addrLower);

  // ── 3. Reconstruct the signed message hash ───────────────────────────────
  //    Message MUST match exactly what the frontend signed:
  //    sha256("CrowdPulse:" + address + ":" + nonce)
  const message = `CrowdPulse:${addrLower}:${nonce}`;
  const hash    = sha256(message);

  // ── 4. Verify elliptic signature ─────────────────────────────────────────
  try {
    const key   = ec.keyFromPublic(publicKey, 'hex');
    const valid = key.verify(hash, { r: signature.r, s: signature.s });
    if (!valid) throw new Error('Signature does not verify.');
  } catch (e) {
    throw new Error(`Signature verification failed: ${e.message}`);
  }

  // ── 5. Verify publicKey → address match ──────────────────────────────────
  const derivedAddress = deriveAddress(publicKey);
  if (derivedAddress !== addrLower) {
    throw new Error(
      `Public key does not match address. ` +
      `Derived: ${derivedAddress}, Claimed: ${addrLower}`
    );
  }

  // ── 6. Lookup role ────────────────────────────────────────────────────────
  const role = getRole(addrLower);

  // ── 7. Sign JWT ───────────────────────────────────────────────────────────
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured in environment.');

  const token = jwt.sign(
    { address: addrLower, role },
    secret,
    { expiresIn: '24h' }
  );

  console.log(`${LOG} ✅ Login verified for ${addrLower.slice(0, 10)}… | role: ${role}`);
  return { token, address: addrLower, role };
}

/**
 * Verify a JWT and return its decoded payload.
 * @throws if token is invalid or expired
 */
export function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured.');
  return jwt.verify(token, secret);
}
