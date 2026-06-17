/**
 * ipfs.controller.js — CrowdPulse IPFS Controller  (Phase 6)
 *
 * Receives the multer-parsed image file, delegates to the IPFS service,
 * and sends a clean JSON response.
 */

import { uploadToIPFS } from '../services/ipfs.service.js';

// Allowed MIME types (mirrors the AI controller for consistency)
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/ipfs/upload
 *
 * Expects:  multipart/form-data  with field  "image"
 * Optional: form field "category" or "reportId" for metadata tagging
 *
 * Returns:
 * {
 *   success:    true,
 *   cid:        "bafybeig...",
 *   gatewayUrl: "https://gateway.pinata.cloud/ipfs/bafybeig...",
 *   ipfsUrl:    "ipfs://bafybeig...",
 *   publicUrl:  "https://ipfs.io/ipfs/bafybeig...",
 *   filename:   "pothole.jpg",
 *   sizeKb:     248
 * }
 */
export async function uploadImageController(req, res) {
  try {
    // ── 1. File presence check ────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({
        error: 'No image uploaded. Send multipart/form-data with an "image" field.',
      });
    }

    const { buffer, mimetype, originalname, size } = req.file;

    // ── 2. MIME type validation ───────────────────────────────────────────────
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }

    // ── 3. Size validation ────────────────────────────────────────────────────
    if (size > MAX_SIZE_BYTES) {
      return res.status(400).json({
        error: `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`,
      });
    }

    // ── 4. Optional metadata from form fields ─────────────────────────────────
    const extraMeta = {};
    if (req.body?.category)  extraMeta.category  = req.body.category;
    if (req.body?.reportId)  extraMeta.reportId  = req.body.reportId;
    if (req.body?.reporter)  extraMeta.reporter  = req.body.reporter;

    // ── 5. Upload to IPFS via Pinata ─────────────────────────────────────────
    const result = await uploadToIPFS(buffer, mimetype, originalname, extraMeta);

    // ── 6. Respond ────────────────────────────────────────────────────────────
    return res.status(200).json({
      success:    true,
      cid:        result.cid,
      gatewayUrl: result.gatewayUrl,
      ipfsUrl:    result.ipfsUrl,
      publicUrl:  result.publicUrl,
      filename:   originalname,
      sizeKb:     Math.round(size / 1024),
    });

  } catch (err) {
    console.error('[IPFS Controller] Error:', err.message);

    // ── Pinata-specific error surfaces ────────────────────────────────────────
    if (err.message?.includes('PINATA_JWT')) {
      return res.status(500).json({
        error: 'Pinata JWT is not configured. Add PINATA_JWT to your .env file.',
      });
    }

    if (err.response?.status === 401) {
      return res.status(500).json({
        error: 'Pinata authentication failed. Check that your PINATA_JWT is valid.',
      });
    }

    if (err.response?.status === 429) {
      return res.status(429).json({
        error: 'Pinata rate limit exceeded. Please try again shortly.',
      });
    }

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({
        error: 'Upload timed out. The file may be too large or Pinata is slow.',
      });
    }

    return res.status(500).json({
      error: err.message || 'Failed to upload image to IPFS.',
    });
  }
}
