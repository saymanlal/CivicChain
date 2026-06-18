/**
 * auth.controller.js — CrowdPulse Auth Controllers  (Phase 14A)
 *
 * GET  /api/auth/nonce/:address  →  { nonce, expiresAt }
 * POST /api/auth/login           →  { token, address, role }
 * GET  /api/auth/me              →  { address, role }
 */

import { generateNonce, verifyLogin } from '../services/auth.service.js';
import { getRole } from '../services/rbac.service.js';

/**
 * GET /api/auth/nonce/:address
 * Issues a one-time nonce for the wallet to sign.
 */
export function getNonceController(req, res) {
  try {
    const { address } = req.params;
    if (!address || address.length !== 40) {
      return res.status(400).json({ error: 'Invalid address. Must be 40-char hex.' });
    }
    const result = generateNonce(address.toLowerCase());
    return res.json(result);
  } catch (e) {
    console.error('[AUTH] getNonce error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

/**
 * POST /api/auth/login
 * Body: { address, publicKey, nonce, signature: { r, s } }
 * Returns: { token, address, role }
 */
export function loginController(req, res) {
  try {
    const { address, publicKey, nonce, signature } = req.body || {};

    if (!address || !publicKey || !nonce || !signature?.r || !signature?.s) {
      return res.status(400).json({
        error: 'Missing required fields: address, publicKey, nonce, signature.{r,s}',
      });
    }

    const result = verifyLogin({ address, publicKey, nonce, signature });
    return res.json(result);
  } catch (e) {
    console.error('[AUTH] login error:', e.message);
    return res.status(401).json({ error: e.message });
  }
}

/**
 * GET /api/auth/me
 * Requires: authenticate middleware
 * Returns the caller's address and role from the validated JWT.
 */
export function meController(req, res) {
  const { address, role } = req.user;
  // Refresh role from store (in case it was updated since token was issued)
  const currentRole = getRole(address);
  return res.json({ address, role: currentRole });
}
