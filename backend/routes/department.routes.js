/**
 * department.routes.js — CrowdPulse Department Routes  (Phase 14B)
 *
 * GET  /api/departments                →  list all departments + stats       (public)
 * GET  /api/departments/me             →  calling user's department          (authenticated)
 * GET  /api/departments/me/reports     →  dept-filtered reports              (authenticated)
 * GET  /api/departments/users          →  all user-dept assignments          (ADMIN)
 * POST /api/departments/assign-user    →  assign/reassign user to dept      (ADMIN)
 * GET  /api/departments/analytics      →  per-dept report counts             (public)
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import {
  listDepartmentsController,
  getMyDepartmentController,
  getMyReportsController,
  getUserDepartmentsController,
  assignUserController,
  deptAnalyticsController,
} from '../controllers/department.controller.js';

const router = Router();

// NOTE: specific paths like /me and /analytics must come before /:id-style routes
router.get('/analytics',    deptAnalyticsController);
router.get('/me',           authenticate, getMyDepartmentController);
router.get('/me/reports',   authenticate, getMyReportsController);
router.get('/users',        authenticate, requireRole('ADMIN'), getUserDepartmentsController);
router.post('/assign-user', authenticate, requireRole('ADMIN'), assignUserController);
router.get('/',             listDepartmentsController);

export default router;
