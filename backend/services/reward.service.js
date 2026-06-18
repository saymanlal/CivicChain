/**
 * reward.service.js — CrowdPulse Reward Service  (Phase 10)
 *
 * Awards points after successful report creation.
 *
 * Dual-track approach:
 *   1. In-memory store for fast queries (same pattern as existing index.js)
 *   2. On-chain CONTRACT_CALL to RewardManager for permanent blockchain record
 *
 * Reward Rules:
 *   REPORT_CREATED   → +10 points  (always)
 *   HIGH_CONFIDENCE   → +5  points  (confidence > 90)
 *   HIGH_SEVERITY     → +5  points  (severity === 'HIGH')
 */

import crypto            from 'crypto';
import { createRequire } from 'module';
import { blockchainConfig, GAS_CONFIG } from '../config/blockchain.config.js';
import { getReportsForAddress } from './reportCache.js';

const require  = createRequire(import.meta.url);
const elliptic = require('elliptic');
const ec       = new elliptic.ec('secp256k1');

const LOG = '[REWARD_AWARDED]';

// ─── Reward Rules ─────────────────────────────────────────────────────────────

const REWARD_RULES = [
  {
    name:      'REPORT_CREATED',
    points:    10,
    condition: () => true,   // always awarded for a valid report
  },
  {
    name:      'HIGH_SEVERITY',
    points:    5,
    condition: (analysis) => analysis.severity === 'HIGH',
  },
];

// ─── Blockchain Helpers (same pattern as blockchain.service.js) ───────────────

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

/**
 * Send a CONTRACT_CALL transaction to a deployed contract.
 */
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
    type,
    timestamp,
    data,
    signature,
    publicKey,
    gasLimit,
    gasPrice,
    nonce,
  };

  const result = await rpc('/api/broadcast', 'POST', broadcastPayload);
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculate and award points for a report based on analysis results.
 *
 * @param {string} senderAddress  The reporter's blockchain address
 * @param {object} analysis       AI analysis result { confidence, severity, ... }
 * @returns {{ earned: number, reason: string[] }}
 */
export async function awardForReport(senderAddress, analysis) {
  let totalPoints = 0;
  const reasons   = [];

  // Evaluate each reward rule
  for (const rule of REWARD_RULES) {
    if (rule.condition(analysis)) {
      totalPoints += rule.points;
      reasons.push(rule.name);
      console.log(`${LOG} ✓ ${rule.name}: +${rule.points} points`);
    }
  }

  if (totalPoints === 0) {
    console.log(`${LOG} No points awarded`);
    return { earned: 0, reason: [] };
  }

  console.log(`${LOG} Calculated: ${totalPoints} points for [${reasons.join(', ')}]`);

  // ── Broadcast to RewardManager on-chain (best-effort) ──────────────────────
  const contractAddr = blockchainConfig.contracts.RewardManager;
  if (contractAddr) {
    try {
      const result = await contractCall(contractAddr, 'addPoints', {
        address: senderAddress,
        points:  totalPoints,
        reason:  reasons.join(','),
      });
      console.log(`${LOG} ✅ On-chain addPoints broadcast:`, result.txId || result.id || 'ok');
    } catch (e) {
      console.error(`${LOG} ⚠ On-chain addPoints failed:`, e.message);
    }
  }

  return { earned: totalPoints, reason: reasons };
}

/**
 * Get points for an address.
 *
 * @param {string} address
 * @returns {{ points: number }}
 */
export async function getPoints(address) {
  const reports = getReportsForAddress(address);
  let points = 0;
  for (const r of reports) {
    // REPORT_CREATED = +10
    points += 10;
    
    // HIGH_SEVERITY = +5
    if (r.severity === 'HIGH') {
      points += 5;
    }
    
    // VERIFIED = +5
    if (r.status === 'VERIFIED' || r.status === 'IN_PROGRESS' || r.status === 'RESOLVED') {
      points += 5;
    }
    
    // RESOLVED = +20
    if (r.status === 'RESOLVED') {
      points += 20;
    }
  }
  return { points };
}
