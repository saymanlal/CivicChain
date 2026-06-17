/**
 * report.service.js — CrowdPulse Unified Report Processing Service  (Phase 7)
 *
 * Orchestrates the full pipeline in a single call:
 *   1. Run Gemini Vision analysis  (ai.service.js)
 *   2. Upload image to IPFS        (ipfs.service.js)
 *   Both run in PARALLEL via Promise.allSettled for maximum speed.
 *
 * Even if the image is not a civic issue, the IPFS upload still happens
 * so the evidence CID is always returned — required for Phase 8 blockchain tx.
 */

import { analyzeImage } from './ai.service.js';
import { uploadToIPFS } from './ipfs.service.js';

/**
 * Process a report image end-to-end.
 *
 * @param {Buffer} buffer       - Raw image bytes (from multer memoryStorage)
 * @param {string} mimeType     - e.g. "image/jpeg"
 * @param {string} filename     - Original filename
 * @param {object} [meta]       - Optional metadata { reporter, location, ... }
 *
 * @returns {Promise<{
 *   analysis: { isCivicIssue, category, severity, confidence, reason },
 *   evidence: { cid, gatewayUrl, ipfsUrl, publicUrl },
 *   errors:   { ai: string|null, ipfs: string|null }
 * }>}
 */
export async function processReport(buffer, mimeType, filename, meta = {}) {
  // ── Run AI + IPFS in parallel ────────────────────────────────────────────────
  const [aiResult, ipfsResult] = await Promise.allSettled([
    analyzeImage(buffer, mimeType),
    uploadToIPFS(buffer, mimeType, filename, {
      source:    'CrowdPulse-report',
      reporter:  meta.reporter  || 'unknown',
      location:  meta.location  || 'unknown',
    }),
  ]);

  // ── Unpack AI result ─────────────────────────────────────────────────────────
  const analysis = aiResult.status === 'fulfilled'
    ? aiResult.value
    : {
        isCivicIssue: false,
        category:     'OTHER',
        severity:     'LOW',
        confidence:   0,
        reason:       `AI analysis failed: ${aiResult.reason?.message || 'unknown error'}`,
      };

  // ── Unpack IPFS result ───────────────────────────────────────────────────────
  const evidence = ipfsResult.status === 'fulfilled'
    ? ipfsResult.value
    : null;

  // ── Surface partial errors without crashing ──────────────────────────────────
  const errors = {
    ai:   aiResult.status   === 'rejected' ? (aiResult.reason?.message   || 'AI error')   : null,
    ipfs: ipfsResult.status === 'rejected' ? (ipfsResult.reason?.message || 'IPFS error') : null,
  };

  // If IPFS completely failed, throw so the controller can return a 500
  if (!evidence) {
    const err = new Error(errors.ipfs || 'IPFS upload failed');
    err.analysis = analysis;   // attach partial data for debugging
    throw err;
  }

  return { analysis, evidence, errors };
}
