/**
 * rbac.routes.js — CrowdPulse RBAC Routes  (Phase 14A)
 *
 * GET  /api/rbac/role/:address  →  { address, role }           (authenticated)
 * GET  /api/rbac/roles          →  { roles: {...}, count }     (ADMIN only)
 * POST /api/rbac/assign         →  { success, address, role }  (ADMIN only)
 */

import { Router } from 'express';
import { getRoleController, getRolesController, assignRoleController } from '../controllers/rbac.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Anyone logged in can check a role (to validate their own role on load)
router.get('/role/:address', authenticate, getRoleController);

// Admin-only: list all roles
router.get('/roles', authenticate, requireRole('ADMIN'), getRolesController);

// Admin-only: assign a role
router.post('/assign', authenticate, requireRole('ADMIN'), assignRoleController);

export default router;
