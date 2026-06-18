/**
 * assignment.routes.js — CrowdPulse Assignment Routes  (Phase 14B)
 *
 * GET  /api/assignments                →  list all assignments              (ADMIN)
 * GET  /api/assignments/:reportId      →  single assignment                  (authenticated)
 * POST /api/assignments/assign         →  manual dept override               (ADMIN)
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import {
  listAssignmentsController,
  getAssignmentController,
  manualAssignController,
} from '../controllers/department.controller.js';

const router = Router();

router.post('/assign',     authenticate, requireRole('ADMIN'), manualAssignController);
router.get('/',            authenticate, requireRole('ADMIN'), listAssignmentsController);
router.get('/:reportId',   authenticate, getAssignmentController);

export default router;
