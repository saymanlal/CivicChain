import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '..', 'data', 'report-cache.json');
const STATUS_PATH = path.join(__dirname, '..', 'data', 'workflow-status.json');

let cache = { reports: [], lastBlock: 0, updatedAt: 0 };

export function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = fs.readFileSync(CACHE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      cache = {
        reports: parsed.reports || [],
        lastBlock: parsed.lastBlock || 0,
        updatedAt: parsed.updatedAt || 0,
      };
      console.log(`[reportCache] Loaded ${cache.reports.length} reports from disk (lastBlock: ${cache.lastBlock})`);
    }
  } catch (e) {
    console.warn(`[reportCache] Failed to load cache from disk:`, e.message);
  }
}

export function saveCache() {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error(`[reportCache] Failed to save cache to disk:`, e.message);
  }
}

export function getCache() {
  return cache;
}

export function setCache(reports, lastBlock, updatedAt) {
  cache.reports = reports;
  cache.lastBlock = lastBlock;
  cache.updatedAt = updatedAt;
  saveCache();
}

export function invalidateCache() {
  cache.updatedAt = 0;
  saveCache();
}

export function getReports() {
  let statusStore = {};
  try {
    if (fs.existsSync(STATUS_PATH)) {
      statusStore = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
    }
  } catch (e) {
    // ignore
  }

  return (cache.reports || []).map(r => {
    const statusEntry = statusStore[r.id] || statusStore[r.txId];
    return {
      ...r,
      status: statusEntry?.status || 'OPEN',
    };
  });
}

export function getReportsForAddress(address) {
  if (!address) return [];
  const normalized = address.toLowerCase();
  return getReports().filter(r => r.reporter && r.reporter.toLowerCase() === normalized);
}

// Initialise on load
loadCache();
