/**
 * ai.controller.js — CrowdPulse AI Controller
 *
 * Handles the incoming multipart/form-data request, delegates to the
 * AI service, and returns a structured JSON response.
 */

import { analyzeImage } from '../services/ai.service.js';

// Allowed MIME types for uploaded images
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

/**
 * POST /api/ai/analyze
 *
 * Expects: multipart/form-data with a field named "image".
 * Returns: JSON with isCivicIssue, category, severity, confidence, reason.
 */
export async function analyzeImageController(req, res) {
  try {
    // multer attaches the file to req.file
    if (!req.file) {
      return res.status(400).json({
        error: 'No image uploaded. Send a multipart/form-data request with an "image" field.',
      });
    }

    const { buffer, mimetype, originalname, size } = req.file;

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({
        error: `Unsupported image type: ${mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }

    // Validate size (max 10 MB)
    const MAX_BYTES = 10 * 1024 * 1024;
    if (size > MAX_BYTES) {
      return res.status(400).json({
        error: `Image too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum allowed: 10 MB.`,
      });
    }

    // Call Gemini Vision service
    const analysis = await analyzeImage(buffer, mimetype);

    return res.json({
      success: true,
      filename: originalname,
      sizeKb: Math.round(size / 1024),
      ...analysis,
    });
  } catch (err) {
    console.error('[AI Controller] Error:', err.message);

    // Surface friendly messages for common API errors
    if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('GEMINI_API_KEY')) {
      return res.status(500).json({ error: 'Gemini API key is missing or invalid. Check GEMINI_API_KEY in .env' });
    }

    if (err.message?.includes('SAFETY')) {
      return res.status(422).json({ error: 'Image was blocked by Gemini safety filters.' });
    }

    return res.status(500).json({ error: err.message || 'Internal server error during image analysis.' });
  }
}
