/**
 * workflow.service.js — CrowdPulse Authority Workflow Engine  (Phase 13)
 *
 * Manages the complete report lifecycle:
 *   OPEN → VERIFIED → IN_PROGRESS → RESOLVED
 *
 * Dual-track approach:
 *   1. In-memory status store (+ JSON persistence) for reliable queries
 *   2. Best-effort CONTRACT_CALL to ReportRegistry for blockchain record
 *
 * Reward Logic:
 *   VERIFIED  → +5 points, +5 reputation
 *   RESOLVED  → +20 points, +15 reputation
 */

import crypto            from 'crypto';
import fs                from 'fs';
import path              from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { blockchainConfig, GAS_CONFIG } from '../config/blockchain.config.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const require    = createRequire(import.meta.url);
const elliptic   = require('elliptic');
const ec         = new elliptic.ec('secp256k1');

const LOG        = '[WORKFLOW]';
const STATUS_LOG = '[STATUS_CHANGE]';

// ─── Status Store (persisted to JSON) ─────────────────────────────────────────

const STATUS_PATH = path.join(__dirname, '..', 'data', 'workflow-status.json');
let statusStore   = {};   // reportId → { status, reporter, notes: [], updatedAt }

function loadStore() {
  try {
    const raw = fs.readFileSync(STATUS_PATH, 'utf8');
    statusStore = JSON.parse(raw);
    console.log(`${LOG} Loaded ${Object.keys(statusStore).length} report statuses from disk`);
  } catch {
    statusStore = {};
    console.log(`${LOG} No existing status store — starting fresh`);
  }
}

function saveStore() {
  try {
    const dir = path.dirname(STATUS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATUS_PATH, JSON.stringify(statusStore, null, 2), 'utf8');
  } catch (e) {
    console.error(`${LOG} Failed to save store:`, e.message);
  }
}

loadStore();

// ─── Transition Rules ─────────────────────────────────────────────────────────

const VALID_TRANSITIONS = {
  'OPEN':        ['VERIFIED'],
  'VERIFIED':    ['IN_PROGRESS'],
  'IN_PROGRESS': ['RESOLVED'],
  'RESOLVED':    [],   // terminal state
};

// Contract method mapping (for blockchain broadcast)
const CONTRACT_METHODS = {
  'VERIFIED':    'verifyReport',
  'RESOLVED':    'resolveReport',
  // IN_PROGRESS has no direct contract method — tracked in-memory only
};

// ─── Reward Rules per Status Change ───────────────────────────────────────────

const STATUS_REWARDS = {
  'VERIFIED':  { points: 5,  reputation: 5  },
  'RESOLVED':  { points: 20, reputation: 15 },
};

// ─── Blockchain Helpers ───────────────────────────────────────────────────────

function deriveAddress(publicKeyHex) {
  return crypto.createHash('sha256').update(publicKeyHex).digest('hex').slice(0, 40);
}

function hashTx({ type, timestamp, data, gasLimit, gasPrice, nonce }) {
  const payload = JSON.stringify({ type, timestamp, data, gasLimit, gasPrice, nonce });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function getDeployerKeyPair() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey || privateKey.length < 60) {
    throw new Error('DEPLOYER_PRIVATE_KEY is missing or invalid in .env');
  }
  return ec.keyFromPrivate(privateKey, 'hex');
}

async function rpc(endpoint, method = 'GET', body = null, retries = 2) {
  const url = `${blockchainConfig.rpcUrl}${endpoint}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    body ? JSON.stringify(body) : undefined,
        signal:  ctrl.signal,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`SAYMAN non-JSON at ${url}: ${text.slice(0, 120)}`); }
      if (!res.ok) throw new Error(data.error || data.message || `RPC ${res.status}`);
      return data;
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function getNonce(address) {
  try {
    const data = await rpc(`/api/address/${address}`);
    return typeof data.nonce === 'number' ? data.nonce : 0;
  } catch {
    return 0;
  }
}

async function contractCall(contractAddress, method, args) {
  const keyPair   = getDeployerKeyPair();
  const publicKey = keyPair.getPublic('hex');
  const sender    = deriveAddress(publicKey);

  const nonce     = await getNonce(sender);
  const timestamp = Date.now();
  const type      = 'CONTRACT_CALL';
  const gasLimit  = GAS_CONFIG.CONTRACT_CALL_GAS_LIMIT;
  const gasPrice  = GAS_CONFIG.GAS_PRICE;

  const data = {
    from:     sender,
    contract: contractAddress,
    method,
    args,
    timestamp,
  };

  const txHash    = hashTx({ type, timestamp, data, gasLimit, gasPrice, nonce });
  const sig       = keyPair.sign(txHash);
  const signature = { r: sig.r.toString('hex'), s: sig.s.toString('hex') };

  const broadcastPayload = {
    type, timestamp, data, signature, publicKey, gasLimit, gasPrice, nonce,
  };

  return await rpc('/api/broadcast', 'POST', broadcastPayload);
}

function getDeployerAddress() {
  const keyPair = getDeployerKeyPair();
  return deriveAddress(keyPair.getPublic('hex'));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get current status of a report.
 * Returns from in-memory store or defaults to OPEN.
 */
export function getReportStatus(reportId) {
  return statusStore[reportId]?.status || 'OPEN';
}

/**
 * Register a report as OPEN (called when a new report is created).
 */
export function registerReport(reportId, reporter) {
  if (!statusStore[reportId]) {
    statusStore[reportId] = {
      status:    'OPEN',
      reporter:  reporter || getDeployerAddress(),
      notes:     [],
      updatedAt: Date.now(),
    };
    saveStore();
  }
}

/**
 * Transition a report to a new status.
 *
 * @param {string} reportId
 * @param {string} newStatus   VERIFIED | IN_PROGRESS | RESOLVED
 * @param {string} [note]      Optional note from authority
 *
 * @returns {{
 *   success:        boolean,
 *   reportId:       string,
 *   previousStatus: string,
 *   newStatus:      string,
 *   txHash?:        string,
 *   rewards?:       object,
 *   reputation?:    object,
 * }}
 */
export async function transitionStatus(reportId, newStatus, note = '') {
  // ── 1. Get current status ──────────────────────────────────────────────────
  const currentStatus = getReportStatus(reportId);
  const reporter      = statusStore[reportId]?.reporter || getDeployerAddress();

  console.log(`${STATUS_LOG} ─── Status Transition ───`);
  console.log(`${STATUS_LOG} Report:  ${reportId}`);
  console.log(`${STATUS_LOG} Current: ${currentStatus}`);
  console.log(`${STATUS_LOG} Target:  ${newStatus}`);

  // ── 2. Validate transition ─────────────────────────────────────────────────
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    console.log(`${STATUS_LOG} ❌ REJECTED — Invalid transition: ${currentStatus} → ${newStatus}`);
    console.log(`${STATUS_LOG} Allowed: ${allowed.join(', ') || 'none (terminal state)'}`);
    return {
      success: false,
      error:   `Invalid status transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`,
      reportId,
      previousStatus: currentStatus,
      newStatus:       currentStatus,
    };
  }

  // ── 3. Update in-memory store ──────────────────────────────────────────────
  const previousStatus = currentStatus;

  if (!statusStore[reportId]) {
    statusStore[reportId] = { status: 'OPEN', reporter, notes: [], updatedAt: Date.now() };
  }

  statusStore[reportId].status    = newStatus;
  statusStore[reportId].updatedAt = Date.now();
  if (note) {
    statusStore[reportId].notes.push({ note, status: newStatus, timestamp: Date.now() });
  }

  saveStore();

  console.log(`${STATUS_LOG} ✅ ${previousStatus} → ${newStatus}`);
  if (note) console.log(`${STATUS_LOG} Note: "${note}"`);

  // ── 4. Best-effort CONTRACT_CALL to ReportRegistry ─────────────────────────
  let txHash = null;
  const contractMethod = CONTRACT_METHODS[newStatus];
  const contractAddr   = blockchainConfig.contracts.ReportRegistry;

  if (contractMethod && contractAddr) {
    try {
      const result = await contractCall(contractAddr, contractMethod, {
        reportId,
        note: note || `Status changed to ${newStatus}`,
      });
      txHash = result.txId || result.id || null;
      console.log(`${LOG} ✅ On-chain ${contractMethod} broadcast:`, txHash || 'ok');
    } catch (e) {
      console.error(`${LOG} ⚠ On-chain ${contractMethod} failed (status still updated):`, e.message);
    }
  } else {
    console.log(`${LOG} IN_PROGRESS tracked in-memory only (no contract method)`);
  }

  // ── 5. Award rewards + reputation ──────────────────────────────────────────
  let rewards    = null;
  let reputation = null;
  const statusReward = STATUS_REWARDS[newStatus];

  if (statusReward) {
    rewards = { earned: statusReward.points, reason: `STATUS_${newStatus}` };
    reputation = { earned: statusReward.reputation };
    console.log(`${LOG} [REWARD_AWARDED] +${statusReward.points} points for ${newStatus}`);
    console.log(`${LOG} [REPUTATION_UPDATED] +${statusReward.reputation} reputation for ${newStatus}`);
  }

  // ── 6. Return result ───────────────────────────────────────────────────────
  console.log(`${STATUS_LOG} ═══════════════════════════════`);
  console.log(`${STATUS_LOG}  ${previousStatus} → ${newStatus} ✅`);
  console.log(`${STATUS_LOG}  txHash: ${txHash || 'in-memory only'}`);
  console.log(`${STATUS_LOG} ═══════════════════════════════`);

  return {
    success: true,
    reportId,
    previousStatus,
    newStatus,
    txHash,
    note: note || null,
    rewards:    rewards    || null,
    reputation: reputation || null,
  };
}
