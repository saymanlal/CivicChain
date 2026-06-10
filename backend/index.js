/**
 * crowdpulse/backend/index.js
 *
 * CrowdPulse backend — bridges the frontend to SAYMAN RPC.
 * Provides a clean REST API with CORS, caching, and AI mock verification.
 *
 * Usage:
 *   SAYMAN_RPC=http://localhost:10000 node index.js
 *   — or —
 *   SAYMAN_RPC=https://sayman-public-testnet-1.onrender.com node index.js
 */

import express from 'express';
import cors    from 'cors';
import crypto  from 'crypto';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const SAYMAN_RPC = process.env.SAYMAN_RPC || 'http://localhost:10000';
const PORT       = process.env.PORT || 3001;

// Load deployed contract addresses
let CONTRACTS = {};
try {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deployed.json'), 'utf8')
  );
  CONTRACTS = manifest.contracts || {};
  console.log('📄 Loaded deployed.json:', CONTRACTS);
} catch {
  console.warn('⚠ No deployed.json found. Run scripts/deploy.js first.');
  // Dev fallback addresses — replace after deployment
  CONTRACTS = {
    ReportRegistry:    process.env.REPORT_REGISTRY_ADDRESS    || '',
    ReputationManager: process.env.REPUTATION_MANAGER_ADDRESS || '',
    RewardManager:     process.env.REWARD_MANAGER_ADDRESS     || ''
  };
}

// ─── RPC helper ───────────────────────────────────────────────────────────────

async function rpc(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(`${SAYMAN_RPC}${endpoint}`, opts);
  const data = await res.json();

  if (!res.ok) throw new Error(data.error || data.message || `RPC ${res.status}`);
  return data;
}

// ─── AI mock verification ─────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  ROAD_DAMAGE:     ['pothole', 'road', 'crack', 'broken', 'damage'],
  FLOOD:           ['flood', 'water', 'overflow', 'drain', 'rain'],
  FIRE:            ['fire', 'burn', 'smoke', 'flame'],
  STREETLIGHT:     ['light', 'dark', 'lamp', 'street light'],
  GARBAGE:         ['garbage', 'trash', 'waste', 'litter', 'dump'],
  WATER_LEAK:      ['leak', 'pipe', 'water', 'supply'],
  UNSAFE_BUILDING: ['building', 'wall', 'collapse', 'unsafe', 'crack']
};

function mockAIVerify(description = '', category = '') {
  const text  = (description + ' ' + category).toLowerCase();
  let detected = category || 'UNKNOWN';
  let confidence = 70 + Math.floor(Math.random() * 25); // 70–94%

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) {
      detected   = cat;
      confidence = 85 + Math.floor(Math.random() * 10);
      break;
    }
  }

  return {
    aiCategory:  detected,
    confidence,
    isValid:     confidence > 60,
    isDuplicate: false
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', contracts: CONTRACTS, rpc: SAYMAN_RPC });
});

// Network stats
app.get('/api/stats', async (_req, res) => {
  try {
    const stats = await rpc('/api/stats');
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit a report
app.post('/api/reports', async (req, res) => {
  try {
    const { category, location, severity, description, evidenceHash, transaction, publicKey } = req.body;

    // Run mock AI verification
    const aiResult = mockAIVerify(description, category);

    // Forward signed transaction to SAYMAN
    const result = await rpc('/api/transactions', 'POST', { transaction, publicKey });

    res.json({
      success: true,
      txId:    transaction.id,
      ai:      aiResult,
      result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all reports (reads from contract state)
app.get('/api/reports', async (req, res) => {
  try {
    const { category, status } = req.query;

    if (!CONTRACTS.ReportRegistry) {
      return res.json({ reports: [] });
    }

    // Read from contract state via SAYMAN RPC
    const data = await rpc(`/api/contracts/${CONTRACTS.ReportRegistry}/state`);
    let reports = Object.values(data.state?.reports || {});

    if (category) reports = reports.filter(r => r.category === category);
    if (status)   reports = reports.filter(r => r.status   === status);

    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message, reports: [] });
  }
});

// Get single report
app.get('/api/reports/:id', async (req, res) => {
  try {
    const data = await rpc(`/api/contracts/${CONTRACTS.ReportRegistry}/state`);
    const reports = data.state?.reports || {};
    const report  = reports[req.params.id];

    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get reputation
app.get('/api/reputation/:address', async (req, res) => {
  try {
    const data = await rpc(`/api/contracts/${CONTRACTS.ReputationManager}/state`);
    const rep   = (data.state?.reputation || {})[req.params.address] || 0;
    res.json({ address: req.params.address, reputation: rep });
  } catch (err) {
    res.status(500).json({ error: err.message, reputation: 0 });
  }
});

// Get events
app.get('/api/events', async (req, res) => {
  try {
    const { contract, event, limit } = req.query;
    const params = new URLSearchParams();
    if (contract) params.set('contract', contract);
    if (event)    params.set('event',    event);
    if (limit)    params.set('limit',    limit);

    const qs   = params.toString();
    const data = await rpc(`/api/events${qs ? '?' + qs : ''}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message, events: [] });
  }
});

// Contract registry
app.get('/api/contracts', async (_req, res) => {
  try {
    const data = await rpc('/api/contracts');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message, contracts: [] });
  }
});

// AI verify (standalone endpoint — call before submitting)
app.post('/api/ai/verify', (req, res) => {
  const { description, category } = req.body;
  res.json(mockAIVerify(description, category));
});

// Proxy all other /api/* to SAYMAN RPC
app.use('/rpc', async (req, res) => {
  try {
    const data = await rpc(req.url, req.method, req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   CrowdPulse Backend  v1.0           ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`API:    http://localhost:${PORT}`);
  console.log(`SAYMAN: ${SAYMAN_RPC}`);
  console.log('');
});