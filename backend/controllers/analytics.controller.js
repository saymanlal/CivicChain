/**
 * analytics.controller.js — CrowdPulse Analytics Controller  (Phase 12)
 *
 * GET /api/analytics/overview
 * GET /api/analytics/categories
 * GET /api/analytics/severity
 * GET /api/analytics/top-reporters
 * GET /api/analytics/hotspots
 * GET /api/analytics/trends
 * GET /api/analytics/insights
 *
 * Data source: local /api/reports endpoint (block-scanned cache)
 * Augmented with: reward + reputation in-memory stores
 */

import {
  getOverview,
  getCategoryDistribution,
  getSeverityDistribution,
  getTopReporters,
  getHotspots,
  getTrends,
  generateInsights,
} from '../services/analytics.service.js';

const PORT      = process.env.PORT       || 3001;
const SAYMAN_RPC = process.env.SAYMAN_RPC || 'https://sayman.up.railway.app';

/**
 * Fetch all REPORT_CREATE transactions from the deployer's address on SAYMAN.
 * This returns complete data immediately — no incremental scanning needed.
 * Falls back to the local /api/reports cache if RPC is unavailable.
 */
async function fetchReports() {
  try {
    // Primary: get from local cache first
    const localRes  = await fetch(`http://localhost:${PORT}/api/reports?pageSize=500`);
    const localData = await localRes.json();
    const cached    = localData.reports || [];

    if (cached.length > 0) return cached;

    // Fallback: scan deployer address transactions directly from SAYMAN RPC
    const deployedRes = await fetch(`http://localhost:${PORT}/health`);
    const health      = await deployedRes.json();

    // Get deployer address from deployed.json (loaded via config)
    const addrRes = await fetch(`${SAYMAN_RPC}/api/address/${health.contracts?.deployer || '750f00e7bdaee4ae0c1cc64191b4eb9f072a51ae'}`);
    const addrData = await addrRes.json();
    const txs = addrData.transactions || [];

    // Extract REPORT_CREATE transactions
    const reports = txs
      .filter(tx => tx.type === 'REPORT_CREATE' && tx.data)
      .map(tx => ({
        id:          tx.id,
        reporter:    tx.data.from,
        category:    tx.data.category   || 'OTHER',
        description: tx.data.description || '',
        location:    tx.data.location   || '',
        severity:    tx.data.severity   || 'MEDIUM',
        status:      'OPEN',
        createdAt:   tx.timestamp,
        blockIndex:  tx.blockIndex ?? 0,
        txId:        tx.id,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    console.log(`[ANALYTICS] Fetched ${reports.length} reports from SAYMAN RPC (cache was empty)`);
    return reports;
  } catch (e) {
    console.error('[ANALYTICS] Failed to fetch reports:', e.message);
    return [];
  }
}

/**
 * Fetch reward/reputation maps for top-reporters augmentation.
 */
async function fetchProfileData(addresses) {
  const pointsMap     = {};
  const reputationMap = {};

  for (const addr of addresses) {
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`http://localhost:${PORT}/api/profile/${addr}/points`),
        fetch(`http://localhost:${PORT}/api/profile/${addr}/reputation`),
      ]);
      const pData = await pRes.json();
      const rData = await rRes.json();
      pointsMap[addr]     = pData.points     || 0;
      reputationMap[addr] = rData.score       || 0;
    } catch {
      // Best-effort — continue without profile data
    }
  }

  return { pointsMap, reputationMap };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function overviewController(_req, res) {
  try {
    const reports = await fetchReports();
    return res.json(getOverview(reports));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function categoriesController(_req, res) {
  try {
    const reports = await fetchReports();
    return res.json(getCategoryDistribution(reports));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function severityController(_req, res) {
  try {
    const reports = await fetchReports();
    return res.json(getSeverityDistribution(reports));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function topReportersController(_req, res) {
  try {
    const reports   = await fetchReports();

    // Collect unique reporter addresses
    const addresses = [...new Set(reports.map(r => r.reporter).filter(Boolean))];

    // Augment with profile data
    const { pointsMap, reputationMap } = await fetchProfileData(addresses);

    return res.json(getTopReporters(reports, pointsMap, reputationMap));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function hotspotsController(_req, res) {
  try {
    const reports = await fetchReports();
    return res.json(getHotspots(reports));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function trendsController(_req, res) {
  try {
    const reports = await fetchReports();
    return res.json(getTrends(reports));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function insightsController(_req, res) {
  try {
    const reports = await fetchReports();
    return res.json(generateInsights(reports));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
