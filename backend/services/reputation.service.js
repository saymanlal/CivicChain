/**
 * reputation.service.js — CrowdPulse Reputation Service  (Phase 10)
 *
 * Awards reputation after successful report creation.
 *
 * Dual-track approach:
 *   1. In-memory store for fast queries (same pattern as existing index.js)
 *   2. On-chain CONTRACT_CALL to ReputationManager for permanent blockchain record
 *
 * Reputation Rules:
 *   VALID_REPORT      → +5 reputation  (always)
 *   HIGH_CONFIDENCE   → +5 reputation  (confidence > 90)
 *
 * Badge Definitions (derived from total reward points):
 *   First Report      → points >= 10
 *   Active Citizen    → points >= 50
 *   Veteran Reporter  → points >= 100
 *   Elite Guardian    → points >= 200
 */

import crypto            from 'crypto';
import { createRequire } from 'module';
import { blockchainConfig, GAS_CONFIG } from '../config/blockchain.config.js';
import { getReportsForAddress } from './reportCache.js';

const require  = createRequire(import.meta.url);
const elliptic = require('elliptic');
const ec       = new elliptic.ec('secp256k1');

const LOG = '[REPUTATION_UPDATED]';

// ─── Reputation Rules ─────────────────────────────────────────────────────────

const REPUTATION_RULES = [
  {
    name:       'VALID_REPORT',
    points:     5,
    condition:  () => true,   // always awarded for a valid report
  },
];

// ─── Reputation Levels ────────────────────────────────────────────────────────

const LEVELS = [
  { label: 'NEW',       min: 0   },
  { label: 'RISING',    min: 10  },
  { label: 'VERIFIED',  min: 50  },
  { label: 'ELITE',     min: 100 },
  { label: 'CHAMPION',  min: 200 },
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

function getLevel(score) {
  const level = [...LEVELS].reverse().find(l => score >= l.min) || LEVELS[0];
  return level.label;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculate and award reputation for a report based on analysis results.
 *
 * @param {string} senderAddress  The reporter's blockchain address
 * @param {object} analysis       AI analysis result { confidence, severity, ... }
 * @returns {{ earned: number }}
 */
export async function increaseForReport(senderAddress, analysis) {
  let totalReputation = 0;
  const reasons       = [];

  // Evaluate each reputation rule
  for (const rule of REPUTATION_RULES) {
    if (rule.condition(analysis)) {
      totalReputation += rule.points;
      reasons.push(rule.name);
      console.log(`${LOG} ✓ ${rule.name}: +${rule.points} reputation`);
    }
  }

  if (totalReputation === 0) {
    console.log(`${LOG} No reputation awarded`);
    return { earned: 0 };
  }

  console.log(`${LOG} Calculated: ${totalReputation} reputation for [${reasons.join(', ')}]`);

  // ── Broadcast to ReputationManager on-chain (best-effort) ──────────────────
  const contractAddr = blockchainConfig.contracts.ReputationManager;
  if (contractAddr) {
    try {
      const result = await contractCall(contractAddr, 'award', {
        address: senderAddress,
        points:  totalReputation,
        reason:  reasons.join(','),
      });
      console.log(`${LOG} ✅ On-chain award broadcast:`, result.txId || result.id || 'ok');
    } catch (e) {
      console.error(`${LOG} ⚠ On-chain award failed:`, e.message);
    }
  }

  return { earned: totalReputation };
}

/**
 * Get reputation score and level for an address.
 *
 * @param {string} address
 * @returns {{ score: number, level: string }}
 */
export async function getReputation(address) {
  const reports = getReportsForAddress(address);
  let score = 0;
  for (const r of reports) {
    // VALID_REPORT = +5
    score += 5;
    
    // VERIFIED = +5
    if (r.status === 'VERIFIED' || r.status === 'IN_PROGRESS' || r.status === 'RESOLVED') {
      score += 5;
    }
    
    // RESOLVED = +15
    if (r.status === 'RESOLVED') {
      score += 15;
    }
  }
  const level = getLevel(score);
  return { score, level };
}

/**
 * Derive badges for an address based on their total reward points.
 *
 * @param {string} address
 * @returns {Array<{ name: string }>}
 */
export async function getBadges(address) {
  const reports = getReportsForAddress(address);
  const repData = await getReputation(address);
  const repScore = repData.score;
  const count = reports.length;

  const badges = [];
  if (count >= 1) {
    badges.push({ name: 'First Report' });
  }
  if (count >= 5) {
    badges.push({ name: 'Rising Contributor' });
  }
  if (repScore >= 50) {
    badges.push({ name: 'Trusted Reporter' });
  }

  return badges;
}
