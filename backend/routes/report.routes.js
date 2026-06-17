/**
 * report.routes.js — CrowdPulse Unified Report Routes  (Phase 7)
 *
 * POST /api/report/process — full AI + IPFS pipeline in one call.
 */

import { Router } from 'express';
import multer      from 'multer';
import { processReportController } from '../controllers/report.controller.js';

const router = Router();

// ─── Multer (in-memory, 10 MB, images only) ───────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files:    1,
  },
  fileFilter(_req, file, cb) {
    if (/^image\//i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type "${file.mimetype}". Only images are accepted.`));
    }
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/report/process
 *
 * Unified endpoint: analyze image with Gemini Vision + upload to IPFS.
 * Both operations run in parallel; result is a single combined JSON.
 *
 * Body (multipart/form-data):
 *   image      File    required
 *   reporter   string  optional   Reporter wallet address
 *   location   string  optional   Location / GPS string
 *
 * Example:
 *   curl -X POST http://localhost:3001/api/report/process \
 *        -F "image=@pothole.jpg" \
 *        -F "reporter=0xabc123" \
 *        -F "location=MG Road, Bangalore"
 */
router.post('/process', upload.single('image'), processReportController);

// ─── Multer error handler ─────────────────────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum allowed size is 10 MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  _next();
});

export default router;
