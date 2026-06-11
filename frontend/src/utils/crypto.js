/**
 * CrowdPulse Crypto — mirrors SAYMAN's wallet.js exactly
 * SHA-256 hash → secp256k1 sign → { r, s } DER signature
 * Address = sha256(publicKey).slice(0, 40)
 */

import Elliptic from 'elliptic';
const EC = Elliptic.ec;
const ec = new EC('secp256k1');

// ─── Address derivation ───────────────────────────────────────────────────────
async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function deriveAddress(publicKey) {
  const hash = await sha256Hex(publicKey);
  return hash.slice(0, 40);
}

// ─── Key generation ──────────────────────────────────────────────────────────
export async function generateWallet() {
  const keyPair = ec.genKeyPair();
  const privateKey = keyPair.getPrivate('hex');
  const publicKey = keyPair.getPublic('hex');
  const address = await deriveAddress(publicKey);
  return { privateKey, publicKey, address };
}

// ─── Import from private key ─────────────────────────────────────────────────
export async function importWallet(privateKey) {
  const keyPair = ec.keyFromPrivate(privateKey, 'hex');
  const publicKey = keyPair.getPublic('hex');
  const address = await deriveAddress(publicKey);
  return { privateKey, publicKey, address };
}

// ─── Sign a transaction (matches SAYMAN's Transaction.sign) ──────────────────
async function hashTx(tx) {
  const payload = JSON.stringify({
    id: tx.id,
    sender: tx.sender,
    recipient: tx.recipient,
    amount: tx.amount,
    nonce: tx.nonce,
    data: tx.data,
    timestamp: tx.timestamp,
    type: tx.type,
    gasLimit: tx.gasLimit,
    gasPrice: tx.gasPrice,
  });
  return sha256Hex(payload);
}

export async function signTransaction(tx, privateKey) {
  const keyPair = ec.keyFromPrivate(privateKey, 'hex');
  const hash = await hashTx(tx);
  const sig = keyPair.sign(hash);
  return {
    r: sig.r.toString('hex'),
    s: sig.s.toString('hex'),
  };
}

// ─── Build a contract-call transaction ───────────────────────────────────────
export function buildTx({ sender, contractAddress, method, args, nonce, gasLimit = 100000 }) {
  const id = crypto.randomUUID();
  return {
    id,
    type: 'CONTRACT_CALL',
    sender,
    recipient: contractAddress,
    amount: 0,
    nonce,
    gasLimit,
    gasPrice: 1,
    data: { method, args },
    timestamp: Date.now(),
    signature: null,
  };
}