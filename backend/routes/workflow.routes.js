/**
 * workflow.routes.js — CrowdPulse Workflow Routes  (Phase 14A)
 *
 * POST /api/workflow/:reportId/verify   → OPEN → VERIFIED      (AUTHORITY | ADMIN)
 * POST /api/workflow/:reportId/start    → VERIFIED → IN_PROGRESS (MUNICIPAL_TEAM | ADMIN)
 * POST /api/workflow/:reportId/resolve  → IN_PROGRESS → RESOLVED (MUNICIPAL_TEAM | ADMIN)
 *
 * All endpoints require: Authorization: Bearer <JWT>
 */

import { Router } from 'express';
import {
  verifyController,
  startController,
  resolveController,
} from '../controllers/workflow.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

router.post(
  '/:reportId/verify',
  authenticate,
  requireRole('AUTHORITY', 'ADMIN'),
  verifyController
);

router.post(
  '/:reportId/start',
  authenticate,
  requireRole('MUNICIPAL_TEAM', 'ADMIN'),
  startController
);

router.post(
  '/:reportId/resolve',
  authenticate,
  requireRole('MUNICIPAL_TEAM', 'ADMIN'),
  resolveController
);

export default router;
