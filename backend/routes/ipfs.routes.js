/**
 * ipfs.routes.js — CrowdPulse IPFS Routes  (Phase 6)
 *
 * Registers the POST /api/ipfs/upload endpoint.
 * Multer is configured with memoryStorage — no temp files on disk.
 */

import { Router } from 'express';
import multer      from 'multer';
import { uploadImageController } from '../controllers/ipfs.controller.js';

const router = Router();

// ─── Multer (in-memory, image-only, 10 MB cap) ────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
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
 * POST /api/ipfs/upload
 *
 * Upload an image to IPFS via Pinata.
 *
 * Body (multipart/form-data):
 *   image      File    required   The image to pin
 *   category   string  optional   Civic category tag stored in Pinata metadata
 *   reportId   string  optional   Report ID to associate with this evidence
 *   reporter   string  optional   Reporter wallet address
 *
 * Example curl:
 *   curl -X POST http://localhost:3001/api/ipfs/upload \
 *        -F "image=@pothole.jpg" \
 *        -F "category=ROAD_DAMAGE"
 */
router.post('/upload', upload.single('image'), uploadImageController);

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
