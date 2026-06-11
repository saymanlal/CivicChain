/**
 * crowdpulse/backend/index.js  — v2.0
 *
 * Fixes vs v1:
 *  - POST /api/reports now calls CONTRACT_CALL → ReportRegistry.createReport
 *    (previously tried /api/transactions which doesn't exist on SAYMAN)
 *  - Broadcast uses /api/broadcast (flat fields) — same format as deploy.js
 *  - Wallet signs transactions properly with secp256k1
 *  - GET /api/reports reads live contract state from /api/contracts/:addr
 *  - GET /api/events proxies /api/events from SAYMAN
 *  - GET /api/chain/tx/:txid — look up any tx by id across all blocks
 *  - GET /api/chain/block/:n — get block by index
 *  - Explorer endpoints so frontend can show block data
 *
 * Usage:
 *   SAYMAN_RPC=https://sayman.onrender.com \
 *   DEPLOYER_PRIVATE_KEY=78260da... \
 *   node index.js
 */

import express         from 'express';
import cors            from 'cors';
import crypto          from 'crypto';
import fs              from 'fs';
import path            from 'path';
import { createRequire }   from 'module';
import { fileURLToPath }   from 'url';

const require   = createRequire(import.meta.url);
const elliptic  = require('elliptic');
const ec        = new elliptic.ec('secp256k1');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── Config ───────────────────────────────────────────────────────────────────

const SAYMAN_RPC = process.env.SAYMAN_RPC || 'https://sayman.onrender.com';
const PORT       = process.env.PORT       || 3001;

// Wallet used to sign CONTRACT_CALL transactions on behalf of the backend
// (reports are submitted by the backend wallet; real app would use user wallet)
const DEFAULT_KEY  = crypto.createHash('sha256').update('crowdpulse-dev-deployer-2024').digest('hex');
const PRIVATE_KEY  = process.env.DEPLOYER_PRIVATE_KEY || DEFAULT_KEY;
let keyPair, publicKey, signerAddress;
try {
  keyPair       = ec.keyFromPrivate(PRIVATE_KEY);
  publicKey     = keyPair.getPublic('hex');
  signerAddress = crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 40);
  console.log(`🔑 Signer: ${signerAddress}`);
} catch (e) {
  console.error('Bad DEPLOYER_PRIVATE_KEY:', e.message);
  process.exit(1);
}

// ─── Load contracts ───────────────────────────────────────────────────────────

let CONTRACTS = {};
try {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deployed.json'), 'utf8')
  );
  CONTRACTS = manifest.contracts || {};
  console.log('📄 Contracts:', CONTRACTS);
} catch {
  console.warn('⚠  No deployed.json — set env vars or run deploy.js');
  CONTRACTS = {
    ReportRegistry:    process.env.REPORT_REGISTRY_ADDRESS    || '',
    ReputationManager: process.env.REPUTATION_MANAGER_ADDRESS || '',
    RewardManager:     process.env.REWARD_MANAGER_ADDRESS     || ''
  };
}

// ─── Nonce tracker ────────────────────────────────────────────────────────────
// Track nonce locally between calls so rapid submissions don't race
let _pendingNonce = null;
async function getNextNonce() {
  try {
    const d = await rpcGet(`/api/address/${signerAddress}`);
    const confirmed = d.nonce || 0;
    if (_pendingNonce === null || _pendingNonce < confirmed) {
      _pendingNonce = confirmed;
    }
    return _pendingNonce++;
  } catch {
    return _pendingNonce !== null ? _pendingNonce++ : 0;
  }
}

// ─── RPC helpers ──────────────────────────────────────────────────────────────

async function rpcGet(endpoint) {
  const res  = await fetch(`${SAYMAN_RPC}${endpoint}`);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data.error || data.message || `RPC GET ${res.status}: ${endpoint}`);
  return data;
}

async function rpcPost(endpoint, body) {
  const res  = await fetch(`${SAYMAN_RPC}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data.error || data.message || `RPC POST ${res.status}: ${endpoint}`);
  return data;
}

// ─── Transaction signing ──────────────────────────────────────────────────────

function signTx(txFields) {
  const hash = crypto.createHash('sha256').update(JSON.stringify({
    type:      txFields.type,
    timestamp: txFields.timestamp,
    data:      txFields.data,
    gasLimit:  txFields.gasLimit,
    gasPrice:  txFields.gasPrice,
    nonce:     txFields.nonce
  })).digest('hex');
  return keyPair.sign(hash).toDER('hex');
}

// Broadcast a signed tx to SAYMAN /api/broadcast
async function broadcast(type, data, gasLimit = 90) {
  const nonce     = await getNextNonce();
  const timestamp = Date.now();
  const txFields  = { type, timestamp, data, gasLimit, gasPrice: 1, nonce };
  const signature = signTx(txFields);

  return rpcPost('/api/broadcast', {
    type, data, timestamp, signature, publicKey,
    gasLimit, gasPrice: 1, nonce
  });
}

// Call a contract method
async function contractCall(contractAddress, method, args) {
  return broadcast('CONTRACT_CALL', {
    from:            signerAddress,
    contractAddress,
    method,
    args
  }, 90);
}

// ─── AI mock verification ─────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  ROAD_DAMAGE:     ['pothole', 'road', 'crack', 'broken', 'damage', 'highway', 'street'],
  FLOOD:           ['flood', 'water', 'overflow', 'drain', 'rain', 'waterlogging'],
  FIRE:            ['fire', 'burn', 'smoke', 'flame', 'burning'],
  STREETLIGHT:     ['light', 'dark', 'lamp', 'street light', 'streetlight', 'bulb'],
  GARBAGE:         ['garbage', 'trash', 'waste', 'litter', 'dump', 'rubbish'],
  WATER_LEAK:      ['leak', 'pipe', 'water', 'supply', 'burst'],
  UNSAFE_BUILDING: ['building', 'wall', 'collapse', 'unsafe', 'crack', 'structure']
};

function mockAIVerify(description = '', category = '') {
  const text     = (description + ' ' + category).toLowerCase();
  let detected   = category || 'UNKNOWN';
  let confidence = 70 + Math.floor(Math.random() * 20);

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) {
      detected   = cat;
      confidence = 82 + Math.floor(Math.random() * 13);
      break;
    }
  }

  return { aiCategory: detected, confidence, isValid: confidence > 60, isDuplicate: false };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', signer: signerAddress, contracts: CONTRACTS, rpc: SAYMAN_RPC });
});

// Chain stats — proxied from SAYMAN
app.get('/api/stats', async (_req, res) => {
  try { res.json(await rpcGet('/api/stats')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Submit report → CONTRACT_CALL ReportRegistry.createReport ────────────────
app.post('/api/reports', async (req, res) => {
  try {
    const { category, location, severity, description, evidenceHash } = req.body;

    if (!category || !description?.trim()) {
      return res.status(400).json({ error: 'category and description required' });
    }
    if (!CONTRACTS.ReportRegistry) {
      return res.status(400).json({ error: 'ReportRegistry not deployed. Run deploy.js first.' });
    }

    const ai     = mockAIVerify(description, category);
    const reportId = crypto.randomUUID();
    const hash   = evidenceHash ||
      'sha256:' + crypto.createHash('sha256').update(description + Date.now()).digest('hex').substring(0, 32);

    const [lat, lng] = typeof location === 'string'
      ? location.split(',').map(s => parseFloat(s.trim()))
      : [location?.lat || 0, location?.lng || 0];

    // Call createReport on-chain
    const result = await contractCall(CONTRACTS.ReportRegistry, 'createReport', {
      id:           reportId,
      category,
      location:     { lat: lat || 0, lng: lng || 0 },
      severity:     severity || 'MEDIUM',
      evidenceHash: hash,
      description,
      aiCategory:   ai.aiCategory,
      confidence:   ai.confidence
    });

    // Also award points via RewardManager
    if (CONTRACTS.RewardManager) {
      contractCall(CONTRACTS.RewardManager, 'award', {
        user:   signerAddress,
        points: 10,
        reason: 'Report submitted'
      }).catch(() => {});
    }

    res.json({ success: true, reportId, txId: result.txId, ai });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Get reports from contract state ──────────────────────────────────────────
app.get('/api/reports', async (req, res) => {
  try {
    if (!CONTRACTS.ReportRegistry) return res.json({ reports: [] });

    const data    = await rpcGet(`/api/contracts/${CONTRACTS.ReportRegistry}`);
    let reports   = Object.values(data.state?.reports || {});

    const { category, status } = req.query;
    if (category) reports = reports.filter(r => r.category === category);
    if (status)   reports = reports.filter(r => r.status   === status);

    // Sort newest first
    reports.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ reports, total: reports.length });
  } catch (e) {
    res.status(500).json({ error: e.message, reports: [] });
  }
});

// ── Get single report ─────────────────────────────────────────────────────────
app.get('/api/reports/:id', async (req, res) => {
  try {
    const data    = await rpcGet(`/api/contracts/${CONTRACTS.ReportRegistry}`);
    const reports = data.state?.reports || {};
    const report  = reports[req.params.id];
    if (!report) return res.status(404).json({ error: 'Not found' });
    res.json({ report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update report status ──────────────────────────────────────────────────────
app.patch('/api/reports/:id/status', async (req, res) => {
  try {
    const { status, note } = req.body;
    const result = await contractCall(CONTRACTS.ReportRegistry, 'updateStatus', {
      id: req.params.id, status, note
    });
    res.json({ success: true, txId: result.txId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Reputation ────────────────────────────────────────────────────────────────
app.get('/api/reputation/:address', async (req, res) => {
  try {
    const data = await rpcGet(`/api/contracts/${CONTRACTS.ReputationManager}`);
    const rep  = (data.state?.reputation || {})[req.params.address] || 0;
    res.json({ address: req.params.address, reputation: rep });
  } catch (e) {
    res.status(500).json({ error: e.message, reputation: 0 });
  }
});

app.get('/api/reputation', async (_req, res) => {
  try {
    const data = await rpcGet(`/api/contracts/${CONTRACTS.ReputationManager}`);
    const rep  = data.state?.reputation || {};
    const leaderboard = Object.entries(rep)
      .map(([address, score]) => ({ address, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    res.json({ leaderboard });
  } catch (e) {
    res.status(500).json({ error: e.message, leaderboard: [] });
  }
});

// ── Events ────────────────────────────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const { contract, event, limit } = req.query;
    const qs = new URLSearchParams();
    if (contract) qs.set('contract', contract);
    if (event)    qs.set('event',    event);
    if (limit)    qs.set('limit',    limit);
    const data = await rpcGet(`/api/events${qs.toString() ? '?' + qs : ''}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message, events: [] });
  }
});

// ── Contract registry ─────────────────────────────────────────────────────────
app.get('/api/contracts', async (_req, res) => {
  try { res.json(await rpcGet('/api/contracts')); }
  catch (e) { res.status(500).json({ error: e.message, contracts: [] }); }
});

// ── Block explorer endpoints ──────────────────────────────────────────────────

// Get block by index
app.get('/api/chain/block/:n', async (req, res) => {
  try { res.json(await rpcGet(`/api/blocks/${req.params.n}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Get latest N blocks
app.get('/api/chain/blocks', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const stats = await rpcGet('/api/stats');
    const total = stats.blocks || 0;
    const blocks = [];
    for (let i = Math.max(0, total - limit); i < total; i++) {
      try { blocks.push(await rpcGet(`/api/blocks/${i}`)); } catch {}
    }
    res.json({ blocks: blocks.reverse(), total });
  } catch (e) {
    res.status(500).json({ error: e.message, blocks: [] });
  }
});

// Look up tx across chain
app.get('/api/chain/tx/:txId', async (req, res) => {
  try { res.json(await rpcGet(`/api/transactions/${req.params.txId}`)); }
  catch (e) { res.status(404).json({ error: 'Transaction not found' }); }
});

// Address info
app.get('/api/chain/address/:addr', async (req, res) => {
  try { res.json(await rpcGet(`/api/address/${req.params.addr}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AI verify standalone ──────────────────────────────────────────────────────
app.post('/api/ai/verify', (req, res) => {
  res.json(mockAIVerify(req.body.description, req.body.category));
});

// ── Signer info ───────────────────────────────────────────────────────────────
app.get('/api/signer', (_req, res) => {
  res.json({ address: signerAddress, publicKey });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   CrowdPulse Backend  v2.0           ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  API    : http://localhost:${PORT}`);
  console.log(`  SAYMAN : ${SAYMAN_RPC}`);
  console.log(`  Signer : ${signerAddress}`);
  console.log('');
  console.log('  Endpoints:');
  console.log('  POST /api/reports          — submit report to chain');
  console.log('  GET  /api/reports          — read from contract state');
  console.log('  GET  /api/events           — contract events');
  console.log('  GET  /api/chain/blocks     — latest blocks');
  console.log('  GET  /api/chain/tx/:txId   — lookup any tx');
  console.log('');
});