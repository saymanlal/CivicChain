import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Blocks, FileCode2, RefreshCw, Loader2, Boxes, ChevronDown, Cpu } from 'lucide-react';
import { api } from '../utils/api.js';
import { CountUp, CopyButton, LiveBadge } from '../components/ui.jsx';

const short = (h, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-6)}` : '—');
const blkNum = (b) => b.index ?? b.height ?? b.number ?? '?';

function BlockDetail({ block }) {
  const [raw, setRaw] = useState(false);
  const kv = [
    ['Height', String(blkNum(block))],
    ['Hash', block.hash || '—'],
    ['Prev Hash', block.previousHash || block.prevHash || '—'],
    ['Transactions', String(block.transactions?.length ?? 0)],
    ['Timestamp', block.timestamp ? new Date(block.timestamp).toLocaleString() : '—'],
    ['Validator', block.validator || block.proposer || '—'],
  ];
  return (
    <motion.div className="blk-detail" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="blk-detail-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="ct-ic" style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,154,58,.14)', color: 'var(--accent)' }}><Boxes size={17} /></div>
          <div>
            <div style={{ fontWeight: 700 }}>Block #{blkNum(block)}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--muted)' }}>{block.transactions?.length ?? 0} transactions</div>
          </div>
        </div>
        <button className="blk-raw-toggle" onClick={() => setRaw((v) => !v)}>
          <ChevronDown size={13} className={`chevron ${raw ? 'open' : ''}`} /> {raw ? 'Hide' : 'Raw'} JSON
        </button>
      </div>
      <div className="blk-kv">
        {kv.map(([k, v]) => (
          <div key={k} className="blk-kv-cell">
            <div className="k">{k}</div>
            <div className="vv">{v.length > 22 ? short(v, 12) : v}{(k === 'Hash' || k === 'Prev Hash') && v !== '—' && <CopyButton text={v} />}</div>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {raw && (
          <motion.pre className="blk-raw" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {JSON.stringify(block, null, 2)}
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ExplorerPage() {
  const [stats, setStats]         = useState(null);
  const [blocks, setBlocks]       = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]             = useState('blocks');
  const [selected, setSelected]   = useState(null);

  async function load(silent = false) {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [s, b, c] = await Promise.allSettled([api.stats(), api.blocks(16), api.contracts()]);
      if (s.status === 'fulfilled') setStats(s.value);
      if (b.status === 'fulfilled') { const arr = b.value.blocks || []; setBlocks(arr); setSelected(arr[0] || null); }
      if (c.status === 'fulfilled') setContracts(c.value.contracts || Object.values(c.value).filter((v) => typeof v === 'object') || []);
    } finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => { load(); }, []);

  const net = [
    { v: stats?.blocks ?? 0,      l: 'Block Height', mono: false },
    { v: stats?.validators ?? 0,  l: 'Validators',   mono: false },
    { v: stats?.totalStake ?? 0,  l: 'Total Stake',  mono: false },
    { v: stats?.mempool ?? 0,     l: 'Mempool',      mono: false },
    { v: stats?.chainId || '—',   l: 'Chain ID',     mono: true },
  ];

  return (
    <div className="page">
      <div className="cc-dash-head">
        <div>
          <div className="cc-dash-eyebrow">SAYMAN blockchain</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="cc-dash-title">Block Explorer</h1><LiveBadge />
          </div>
          <p className="cc-dash-sub">Inspect blocks and smart contracts on the public testnet.</p>
        </div>
        <button className="cc-refresh" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Syncing' : 'Refresh'}
        </button>
      </div>

      {/* Network strip */}
      <div className="net-strip">
        {net.map((n, i) => (
          <motion.div key={n.l} className="net-cell" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <span className={`v ${n.mono ? 'mono' : ''}`} style={{ color: n.mono ? 'var(--muted)' : 'var(--accent)' }}>
              {n.mono ? n.v : <CountUp value={n.v} />}
            </span>
            <span className="l">{n.l}</span>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="seg-tabs">
        {[['blocks', 'Blocks', Blocks], ['contracts', 'Contracts', FileCode2]].map(([key, label, Ic]) => (
          <button key={key} className={`seg-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {tab === key && <motion.span className="seg-tab-bg" layoutId="segbg" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
            <span><Ic size={13} /> {label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="center-loader"><Loader2 size={26} className="spin" /><p>Reading the chain…</p></div>
      ) : tab === 'blocks' ? (
        blocks.length === 0 ? <p className="muted">No blocks loaded — check chain connection.</p> : (
          <>
            {/* Visual chain */}
            <div className="chain-viz">
              {blocks.map((b, i) => (
                <div key={b.hash || i} className="chain-cube-wrap">
                  <motion.button
                    className={`chain-cube ${i === 0 ? 'head' : ''} ${selected && blkNum(selected) === blkNum(b) ? 'sel' : ''}`}
                    onClick={() => setSelected(b)}
                    initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 22 }}
                  >
                    {i === 0 && <motion.span className="pulse" animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} />}
                    <span className="num">#{blkNum(b)}</span>
                    <span className="txc">{b.transactions?.length ?? 0} tx</span>
                  </motion.button>
                  {i < blocks.length - 1 && <span className="chain-link" />}
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {selected && <BlockDetail key={blkNum(selected)} block={selected} />}
            </AnimatePresence>
          </>
        )
      ) : (
        contracts.length === 0 ? <p className="muted">No contracts found.</p> : (
          <div className="ctr-grid">
            {contracts.map((c, i) => (
              <motion.div key={i} className="ctr-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <div className="ct-top">
                  <div className="ct-ic"><Cpu size={18} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="ct-name">{c.name || 'Contract'}</div>
                    <div className="ct-ver">v{c.version || '1.0'}</div>
                  </div>
                </div>
                <div className="ct-addr">
                  <code>{c.address || c.id || '—'}</code>
                  {(c.address || c.id) && <CopyButton text={c.address || c.id} />}
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
