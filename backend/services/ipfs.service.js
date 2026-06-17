/**
 * ipfs.service.js — CrowdPulse IPFS Storage Service  (Phase 6)
 *
 * Uploads an image buffer to Pinata (IPFS pinning service) and returns
 * the content identifier (CID) plus a public gateway URL.
 *
 * Auth: Pinata JWT  →  PINATA_JWT env var
 * API:  https://api.pinata.cloud/pinning/pinFileToIPFS
 */

import axios      from 'axios';
import FormData   from 'form-data';

// ─── Constants ────────────────────────────────────────────────────────────────

const PINATA_API_URL   = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_GATEWAY   = 'https://gateway.pinata.cloud/ipfs';
const PUBLIC_GATEWAY   = 'https://ipfs.io/ipfs';          // fallback public gateway

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getJwt() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt || jwt === 'paste_your_pinata_jwt_here') {
    throw new Error('PINATA_JWT is not configured. Add it to your .env file.');
  }
  return jwt;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Upload an image buffer to Pinata / IPFS.
 *
 * @param {Buffer}  buffer       - Raw image bytes (from multer memoryStorage)
 * @param {string}  mimeType     - e.g. "image/jpeg"
 * @param {string}  filename     - Original filename (used as IPFS pin name)
 * @param {object}  [metadata]   - Optional key/value pairs stored as Pinata metadata
 *
 * @returns {Promise<{ cid: string, gatewayUrl: string, ipfsUrl: string }>}
 */
export async function uploadToIPFS(buffer, mimeType, filename, metadata = {}) {
  const jwt = getJwt();

  // Build multipart body
  const form = new FormData();

  // Append file buffer with correct MIME type and filename
  form.append('file', buffer, {
    filename:    filename || 'upload',
    contentType: mimeType,
  });

  // Pinata metadata — stored alongside the pin, queryable via Pinata dashboard
  const pinataMetadata = JSON.stringify({
    name:      filename || 'CrowdPulse Upload',
    keyvalues: {
      source:    'CrowdPulse',
      uploadedAt: new Date().toISOString(),
      ...metadata,
    },
  });
  form.append('pinataMetadata', pinataMetadata);

  // Pinata options — cidVersion 1 gives a more modern base32 CID
  const pinataOptions = JSON.stringify({ cidVersion: 1 });
  form.append('pinataOptions', pinataOptions);

  // POST to Pinata
  const response = await axios.post(PINATA_API_URL, form, {
    maxBodyLength: Infinity,   // allow large files
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...form.getHeaders(),
    },
    timeout: 60_000,           // 60-second timeout
  });

  const cid = response.data?.IpfsHash;
  if (!cid) {
    throw new Error(`Pinata returned unexpected response: ${JSON.stringify(response.data)}`);
  }

  return {
    cid,
    gatewayUrl: `${PINATA_GATEWAY}/${cid}`,
    ipfsUrl:    `ipfs://${cid}`,
    publicUrl:  `${PUBLIC_GATEWAY}/${cid}`,
  };
}
