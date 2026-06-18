/**
 * auth.middleware.js — CrowdPulse Auth & RBAC Middleware  (Phase 14A)
 *
 * authenticate    → verifies JWT from Authorization: Bearer <token>
 *                   attaches decoded { address, role } to req.user
 *
 * requireRole     → factory that returns a middleware checking req.user.role
 */

import { verifyToken } from '../services/auth.service.js';

/**
 * Verify the Bearer JWT token. Attaches req.user = { address, role }.
 * Returns 401 if missing or invalid.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Connect your wallet and sign in.',
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Empty token.' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = { address: decoded.address, role: decoded.role };
    next();
  } catch (e) {
    return res.status(401).json({
      error: 'Invalid or expired session. Please reconnect your wallet.',
      detail: e.message,
    });
  }
}

/**
 * Role guard — must be used AFTER authenticate().
 *
 * Usage:
 *   router.post('/verify', authenticate, requireRole('AUTHORITY', 'ADMIN'), controller)
 *
 * @param {...string} allowedRoles
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden. You do not have permission to perform this action.',
        required: allowedRoles,
        actual:   req.user.role,
      });
    }
    next();
  };
}
