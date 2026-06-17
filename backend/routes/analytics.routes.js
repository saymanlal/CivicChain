/**
 * analytics.routes.js — CrowdPulse Analytics Routes  (Phase 12)
 *
 * GET /api/analytics/overview
 * GET /api/analytics/categories
 * GET /api/analytics/severity
 * GET /api/analytics/top-reporters
 * GET /api/analytics/hotspots
 * GET /api/analytics/trends
 * GET /api/analytics/insights
 */

import { Router } from 'express';
import {
  overviewController,
  categoriesController,
  severityController,
  topReportersController,
  hotspotsController,
  trendsController,
  insightsController,
} from '../controllers/analytics.controller.js';

const router = Router();

router.get('/overview',       overviewController);
router.get('/categories',     categoriesController);
router.get('/severity',       severityController);
router.get('/top-reporters',  topReportersController);
router.get('/hotspots',       hotspotsController);
router.get('/trends',         trendsController);
router.get('/insights',       insightsController);

export default router;
