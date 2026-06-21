/**
 * report.controller.js — CrowdPulse Report Controller  (Phase 7 + Phase 8 + 14C)
 *
 * Phase 7:  processReportController  → POST /api/report/process
 * Phase 8:  createReportController   → POST /api/report/create
 * Phase 14C: city + address required in createReportController
 */

import { processReport, createFullReport, prepareReport, finalizeReport } from '../services/report.service.js';
import { isValidCity, getCityName }        from '../services/jurisdiction.service.js';

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
 * POST /api/report/process
 *
 * Body (multipart/form-data):
 *   image      File    required   The civic evidence image
 *   reporter   string  optional   Wallet address of the reporter
 *   location   string  optional   Location string / GPS coords
 *
 * Returns:
 * {
 *   success:  true,
 *   filename: "pothole.jpg",
 *   sizeKb:   248,
 *   analysis: {
 *     isCivicIssue: true,
 *     category:     "ROAD_DAMAGE",
 *     severity:     "HIGH",
 *     confidence:   96,
 *     reason:       "Visible pothole detected."
 *   },
 *   evidence: {
 *     cid:        "bafybeig...",
 *     gatewayUrl: "https://gateway.pinata.cloud/ipfs/bafybeig...",
 *     ipfsUrl:    "ipfs://bafybeig...",
 *     publicUrl:  "https://ipfs.io/ipfs/bafybeig..."
 *   },
 *   warnings: { ai: null, ipfs: null }   // populated if a service had a non-fatal issue
 * }
 */
export async function processReportController(req, res) {
  try {
    // ── 1. File check ──────────────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({
        error: 'No image uploaded. Send multipart/form-data with an "image" field.',
      });
    }

    const { buffer, mimetype, originalname, size } = req.file;

    // ── 2. MIME validation ─────────────────────────────────────────────────────
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }

    // ── 3. Size validation ─────────────────────────────────────────────────────
    if (size > MAX_SIZE_BYTES) {
      return res.status(400).json({
        error: `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`,
      });
    }

    // ── 4. Optional metadata from form fields ──────────────────────────────────
    const meta = {
      reporter: req.body?.reporter || null,
      location: req.body?.location || null,
    };

    // ── 5. Run unified pipeline (AI + IPFS in parallel) ───────────────────────
    const { analysis, evidence, errors } = await processReport(
      buffer, mimetype, originalname, meta
    );

    // ── 6. Respond ─────────────────────────────────────────────────────────────
    return res.status(200).json({
      success:  true,
      filename: originalname,
      sizeKb:   Math.round(size / 1024),
      analysis,
      evidence,
      // Only include warnings object if at least one service had a partial error
      ...(errors.ai || errors.ipfs ? { warnings: errors } : {}),
    });

  } catch (err) {
    console.error('[Report Controller] Pipeline error:', err.message);

    // ── Map known error types ──────────────────────────────────────────────────
    if (err.message?.includes('PINATA_JWT') || err.message?.includes('GEMINI_API_KEY')) {
      return res.status(500).json({
        error: 'Service not configured. Check GEMINI_API_KEY and PINATA_JWT in .env',
        ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
      });
    }

    if (err.response?.status === 401) {
      return res.status(500).json({ error: 'API authentication failed. Check your API keys.' });
    }

    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded on an upstream service. Try again shortly.' });
    }

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({ error: 'Pipeline timed out. Try a smaller image.' });
    }

    return res.status(500).json({
      error: err.message || 'Report processing pipeline failed.',
      ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
    });
  }
}

// ─── Phase 8 — POST /api/report/create ────────────────────────────────────────

/**
 * POST /api/report/create
 *
 * Full pipeline: Gemini Vision → IPFS → ReportRegistry.createReport() on SAYMAN.
 *
 * Body (multipart/form-data):
 *   image        File    required
 *   reporter     string  optional   Reporter wallet address
 *   location     string  optional   Location / GPS string
 *   description  string  optional   Custom description (falls back to AI reason)
 *
 * Returns:
 * {
 *   success:    true,
 *   reportId:   "RP-1718601234",
 *   filename:   "pothole.jpg",
 *   sizeKb:     248,
 *   analysis:   { isCivicIssue, category, severity, confidence, reason },
 *   evidence:   { cid, gatewayUrl, ipfsUrl, publicUrl },
 *   blockchain: { txHash, blockNumber, contractAddress, sender }
 * }
 */
export async function createReportController(req, res) {
  try {
    // ── 1. File check ──────────────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({
        error: 'No image uploaded. Send multipart/form-data with an "image" field.',
      });
    }

    const { buffer, mimetype, originalname, size } = req.file;

    // ── 2. MIME validation ─────────────────────────────────────────────────────
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }

    // ── 3. Size validation ─────────────────────────────────────────────────────
    if (size > MAX_SIZE_BYTES) {
      return res.status(400).json({
        error: `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`,
      });
    }

    // ── 4. Metadata from form fields ───────────────────────────────────────────
    const rawCity    = (req.body?.city    || '').trim().toUpperCase();
    const rawAddress = (req.body?.address || '').trim();

    // Phase 14C: city is required
    if (!rawCity) {
      return res.status(400).json({ error: 'city is required. Select a city from the list.' });
    }
    if (!isValidCity(rawCity)) {
      return res.status(400).json({ error: `Invalid city: "${rawCity}". Use one of the supported cities.` });
    }

    // Build structured location for blockchain tx + report cache
    const locationObj = {
      address: rawAddress || 'Unknown location',
      city:    rawCity,
    };

    const meta = {
      reporter:    req.body?.reporter    || null,
      location:    locationObj,              // Phase 14C: { address, city } object
      description: req.body?.description || null,
    };

    // ── 5. Full pipeline: AI → Fraud Gate → IPFS → Blockchain ────────────────
    const result = await createFullReport(buffer, mimetype, originalname, meta);

    // ── 6. Fraud gate blocked? ────────────────────────────────────────────────
    if (result.blocked) {
      return res.status(403).json({
        success:    false,
        blocked:    true,
        reportId:   result.reportId,
        fraudScore: result.fraudScore,
        riskLevel:  result.riskLevel,
        reason:     result.reason,
        analysis:   result.analysis,
      });
    }

    // ── 6.5. Duplicate detected? (Phase 11) ──────────────────────────────────
    if (result.duplicate) {
      return res.status(409).json({
        success:          false,
        duplicate:        true,
        reportId:         result.reportId,
        similarity:       result.similarity,
        existingReportId: result.existingReportId,
        reason:           result.reason,
      });
    }

    // ── 7. Success — report created on chain ──────────────────────────────────
    return res.status(200).json({
      success:    true,
      reportId:   result.reportId,
      filename:   originalname,
      sizeKb:     Math.round(size / 1024),
      fraudScore: result.fraud?.fraudScore ?? 0,
      riskLevel:  result.fraud?.riskLevel  ?? 'LOW',
      analysis:   result.analysis,
      evidence:   result.evidence,
      blockchain: result.blockchain,
      rewards:    result.rewards    || null,
      reputation: result.reputation || null,
      city:       rawCity,                   // Phase 14C
      cityName:   getCityName(rawCity),      // Phase 14C
      address:    rawAddress || null,        // Phase 14C
    });

  } catch (err) {
    console.error('[Report/Create] Pipeline error:', err.message);

    if (err.message?.includes('PINATA_JWT') || err.message?.includes('GEMINI_API_KEY')) {
      return res.status(500).json({
        error: 'Service not configured. Check GEMINI_API_KEY and PINATA_JWT in .env',
        ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
      });
    }

    if (err.message?.includes('DEPLOYER_PRIVATE_KEY')) {
      return res.status(500).json({
        error: 'Blockchain signer not configured. Check DEPLOYER_PRIVATE_KEY in .env',
        ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
      });
    }

    if (err.message?.includes('ReportRegistry contract address')) {
      return res.status(500).json({
        error: 'Contracts not deployed. Run: npm run deploy:testnet',
      });
    }

    if (err.response?.status === 401) {
      return res.status(500).json({ error: 'Upstream API authentication failed.' });
    }

    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' });
    }

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({ error: 'Pipeline timed out. Try a smaller image.' });
    }

    return res.status(500).json({
      error: err.message || 'Report creation pipeline failed.',
      ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
    });
  }
}

// ─── Phase 16 — User-signed report flow ───────────────────────────────────────

/**
 * POST /api/report/prepare
 *
 * Runs AI → fraud → duplicate → IPFS WITHOUT writing to the chain, and returns
 * everything the client needs to build, sign and broadcast the REPORT_CREATE
 * transaction from the reporter's OWN wallet (so the reporter pays the gas).
 *
 * Body (multipart/form-data): image (required), city (required), address.
 */
export async function prepareReportController(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded. Send multipart/form-data with an "image" field.' });
    }

    const { buffer, mimetype, originalname, size } = req.file;

    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({ error: `Unsupported file type: ${mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` });
    }
    if (size > MAX_SIZE_BYTES) {
      return res.status(400).json({ error: `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.` });
    }

    const rawCity    = (req.body?.city    || '').trim().toUpperCase();
    const rawAddress = (req.body?.address || '').trim();

    if (!rawCity) {
      return res.status(400).json({ error: 'city is required. Select a city from the list.' });
    }
    if (!isValidCity(rawCity)) {
      return res.status(400).json({ error: `Invalid city: "${rawCity}". Use one of the supported cities.` });
    }

    const locationObj = { address: rawAddress || 'Unknown location', city: rawCity };

    const meta = {
      reporter:    req.body?.reporter    || null,
      location:    locationObj,
      description: req.body?.description || null,
    };

    const result = await prepareReport(buffer, mimetype, originalname, meta);

    if (result.blocked) {
      return res.status(403).json({
        success:    false,
        blocked:    true,
        reportId:   result.reportId,
        fraudScore: result.fraudScore,
        riskLevel:  result.riskLevel,
        reason:     result.reason,
        analysis:   result.analysis,
      });
    }

    if (result.duplicate) {
      return res.status(409).json({
        success:          false,
        duplicate:        true,
        reportId:         result.reportId,
        similarity:       result.similarity,
        existingReportId: result.existingReportId,
        reason:           result.reason,
      });
    }

    return res.status(200).json({
      success:     true,
      reportId:    result.reportId,
      filename:    originalname,
      sizeKb:      Math.round(size / 1024),
      fraudScore:  result.fraud?.fraudScore ?? 0,
      riskLevel:   result.fraud?.riskLevel  ?? 'LOW',
      analysis:    result.analysis,
      evidence:    result.evidence,
      description: result.description,
      location:    result.location,           // { address, city }
      dupHash:     result.dupHash,
      city:        rawCity,
      cityName:    getCityName(rawCity),
      address:     rawAddress || null,
    });

  } catch (err) {
    console.error('[Report/Prepare] Pipeline error:', err.message);

    if (err.message?.includes('PINATA_JWT') || err.message?.includes('GEMINI_API_KEY')) {
      return res.status(500).json({
        error: 'Service not configured. Check GEMINI_API_KEY and PINATA_JWT in .env',
        ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
      });
    }
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({ error: 'Pipeline timed out. Try a smaller image.' });
    }

    return res.status(500).json({
      error: err.message || 'Report preparation pipeline failed.',
      ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
    });
  }
}

/**
 * POST /api/report/finalize
 *
 * Called after the client has broadcast the user-signed REPORT_CREATE tx.
 * Registers the duplicate hash and awards rewards/reputation to the reporter.
 *
 * Body (application/json):
 *   { reportId, sender, txHash, blockNumber?, analysis, dupHash? }
 */
export async function finalizeReportController(req, res) {
  try {
    const { reportId, sender, txHash, blockNumber, analysis, dupHash } = req.body || {};

    if (!reportId || !sender || !txHash) {
      return res.status(400).json({ error: 'reportId, sender and txHash are required.' });
    }

    const { rewards, reputation } = await finalizeReport({ reportId, sender, analysis, dupHash });

    return res.status(200).json({
      success:    true,
      reportId,
      blockchain: { txHash, blockNumber: blockNumber ?? null, sender },
      rewards,
      reputation,
    });

  } catch (err) {
    console.error('[Report/Finalize] error:', err.message);
    return res.status(500).json({ error: err.message || 'Report finalization failed.' });
  }
}
