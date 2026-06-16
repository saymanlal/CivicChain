/**
 * ai.routes.js — CrowdPulse AI Routes
 *
 * Mounts multer middleware for image upload and registers the
 * POST /api/ai/analyze endpoint.
 */

import { Router }   from 'express';
import multer        from 'multer';
import { analyzeImageController } from '../controllers/ai.controller.js';

const router = Router();

// ─── Multer configuration ─────────────────────────────────────────────────────
// Store files in memory (Buffer) — no disk writes needed
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB hard limit at the middleware level
    files: 1,                    // Only one file per request
  },
  fileFilter(_req, file, cb) {
    const allowed = /image\/(jpeg|jpg|png|webp|gif|heic|heif)/i;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only image files are accepted.`));
    }
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/ai/analyze
 *
 * Accepts a multipart/form-data upload with a single field "image".
 * Returns civic issue classification from Gemini Vision.
 *
 * Example curl:
 *   curl -X POST http://localhost:3001/api/ai/analyze \
 *        -F "image=@/path/to/pothole.jpg"
 */
router.post('/analyze', upload.single('image'), analyzeImageController);

// ─── Multer error handler ─────────────────────────────────────────────────────
// Must be defined after routes on the same router
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  _next();
});

export default router;
