/**
 * crowdpulse/scripts/deploy.js
 *
 * Deploys all CrowdPulse contracts to SAYMAN testnet or mainnet.
 *
 * Usage:
 *   node scripts/deploy.js --network testnet
 *   node scripts/deploy.js --network mainnet
 *   node scripts/deploy.js --network local
 *
 * Requires env vars:
 *   DEPLOYER_PRIVATE_KEY   — hex private key of deployer wallet
 *   SAYMAN_RPC_URL         — optional override (default: see NETWORKS below)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import elliptic from 'elliptic';
import crypto   from 'crypto';

const EC = elliptic.ec;
const ec = new EC('secp256k1');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Network config ──────────────────────────────────────────────────────────

const NETWORKS = {
  local:   'http://localhost:10000',
  testnet: 'https://sayman-public-testnet-1.onrender.com',
  mainnet: 'https://mainnet.sayman.io'
};

// ─── Parse CLI args ───────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const netFlag = args.indexOf('--network');
const network = netFlag !== -1 ? args[netFlag + 1] : 'local';
const RPC_URL = process.env.SAYMAN_RPC_URL || NETWORKS[network];

if (!RPC_URL) {
  console.error(`Unknown network: ${network}. Use local | testnet | mainnet`);
  process.exit(1);
}

// ─── Wallet from env ──────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ||
  // Dev fallback — never use in production
  crypto.createHash('sha256').update('crowdpulse-dev-deployer').digest('hex');

const keyPair    = ec.keyFromPrivate(PRIVATE_KEY);
const publicKey  = keyPair.getPublic('hex');
const address    = crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 40);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function rpcPost(endpoint, body) {
  const res  = await fetch(`${RPC_URL}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

async function rpcGet(endpoint) {
  const res  = await fetch(`${RPC_URL}${endpoint}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

function signTx(tx) {
  const str  = JSON.stringify({
    type:      tx.type,
    timestamp: tx.timestamp,
    data:      tx.data,
    gasLimit:  tx.gasLimit,
    gasPrice:  tx.gasPrice,
    nonce:     tx.nonce
  });
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return keyPair.sign(hash).toDER('hex');
}

async function getNonce() {
  try {
    const data = await rpcGet(`/api/account/${address}`);
    return data.nonce || 0;
  } catch {
    return 0;
  }
}

async function deployContract(name, version, code, nonce) {
  const tx = {
    id:        crypto.randomUUID(),
    type:      'CONTRACT_DEPLOY',
    timestamp: Date.now(),
    nonce,
    gasLimit:  200000,
    gasPrice:  1,
    data: {
      from: address,
      name,
      version,
      abi:  [],
      code
    },
    gasUsed: 0
  };

  tx.signature = signTx(tx);

  const result = await rpcPost('/api/transactions', {
    transaction: tx,
    publicKey
  });

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║  CrowdPulse Contract Deployer v1.0   ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`Network:   ${network}`);
  console.log(`RPC:       ${RPC_URL}`);
  console.log(`Deployer:  ${address}`);
  console.log('');

  // Check balance
  try {
    const account = await rpcGet(`/api/account/${address}`);
    console.log(`Balance:   ${account.balance || 0} SAYM`);
    console.log('');
  } catch {
    console.log('⚠ Could not fetch balance — continuing anyway\n');
  }

  const contractsDir = path.join(__dirname, '..', 'contracts');
  const contracts = [
    { file: 'ReportRegistry.js',   name: 'ReportRegistry',   version: '1.0.0' },
    { file: 'ReputationManager.js', name: 'ReputationManager', version: '1.0.0' },
    { file: 'RewardManager.js',    name: 'RewardManager',    version: '1.0.0' }
  ];

  const deployed = {};
  let nonce = await getNonce();

  for (const c of contracts) {
    const codePath = path.join(contractsDir, c.file);

    if (!fs.existsSync(codePath)) {
      console.error(`❌ Contract file not found: ${codePath}`);
      continue;
    }

    const code = fs.readFileSync(codePath, 'utf8');

    process.stdout.write(`Deploying ${c.name}...`);

    try {
      const result = await deployContract(c.name, c.version, code, nonce);

      // Wait for block to be mined (simple poll)
      await new Promise(r => setTimeout(r, 4000));

      // Try to get the contract address from explorer
      let contractAddress = result.contractAddress || null;

      if (!contractAddress) {
        // Compute expected address (matches ContractEngine.generateContractAddress)
        const ts   = result.timestamp || Date.now();
        contractAddress = crypto.createHash('sha256')
          .update(address + ts.toString())
          .digest('hex')
          .substring(0, 40);
      }

      deployed[c.name] = contractAddress;
      nonce++;

      console.log(` ✅ ${contractAddress}`);
    } catch (err) {
      console.log(` ❌ Failed: ${err.message}`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  Deployment Summary');
  console.log('═══════════════════════════════════════');

  Object.entries(deployed).forEach(([name, addr]) => {
    console.log(`  ${name.padEnd(22)} ${addr}`);
  });

  // Save deployment manifest
  const manifestPath = path.join(__dirname, '..', 'deployed.json');
  const manifest = {
    network,
    rpcUrl:    RPC_URL,
    deployer:  address,
    deployedAt: new Date().toISOString(),
    contracts: deployed
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('');
  console.log(`📄 Manifest saved → crowdpulse/deployed.json`);
  console.log('');
  console.log('  Next:');
  console.log('  1. Copy deployed.json addresses to crowdpulse/frontend/config.js');
  console.log('  2. cd crowdpulse/backend && node index.js');
  console.log('  3. Open crowdpulse/frontend/index.html');
  console.log('');
}

main().catch(err => {
  console.error('Deployment failed:', err.message);
  process.exit(1);
});