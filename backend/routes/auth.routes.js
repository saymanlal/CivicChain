/**
 * auth.routes.js — CrowdPulse Auth Routes  (Phase 14A)
 *
 * GET  /api/auth/nonce/:address  →  { nonce, expiresAt }     (public)
 * POST /api/auth/login           →  { token, address, role } (public)
 * GET  /api/auth/me              →  { address, role }        (authenticated)
 */

import { Router } from 'express';
import { getNonceController, loginController, meController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/nonce/:address', getNonceController);
router.post('/login',         loginController);
router.get('/me',             authenticate, meController);

export default router;
