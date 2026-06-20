import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Clock, CheckCircle2, AlertCircle, Loader2, Search, Shield, Play, CheckSquare,
  Construction, Waves, Flame, Lightbulb, Trash2, Droplets, Building2, HelpCircle, Inbox, RefreshCw,
} from 'lucide-react';
import { api } from '../utils/api.js';
import { CountUp, LiveBadge } from '../components/ui.jsx';

const CATS = {
  ROAD_DAMAGE:     { color: '#f97316', icon: Construction, label: 'Road Damage' },
  FLOOD:           { color: '#3b82f6', icon: Waves,        label: 'Flood' },
  FIRE:            { color: '#ef4444', icon: Flame,        label: 'Fire' },
  STREETLIGHT:     { color: '#eab308', icon: Lightbulb,    label: 'Streetlight' },
  GARBAGE:         { color: '#84cc16', icon: Trash2,       label: 'Garbage' },
  WATER_LEAK:      { color: '#06b6d4', icon: Droplets,     label: 'Water Leak' },
  UNSAFE_BUILDING: { color: '#a855f7', icon: Building2,    label: 'Unsafe Building' },
  OTHER:           { color: '#8a8f98', icon: HelpCircle,   label: 'Other' },
};
const SEV = { LOW: { n: 1, c: '#19c37d' }, MEDIUM: { n: 2, c: '#FF9A3A' }, HIGH: { n: 3, c: '#ef4444' }, CRITICAL: { n: 4, c: '#a855f7' } };
const STATUS = {
  OPEN:        { c: '#FF9A3A', icon: AlertCircle,  label: 'OPEN' },
  VERIFIED:    { c: '#3b82f6', icon: Shield,       label: 'VERIFIED' },
  IN_PROGRESS: { c: '#a855f7', icon: Play,         label: 'IN PROGRESS' },
  RESOLVED:    { c: '#19c37d', icon: CheckCircle2, label: 'RESOLVED' },
};

const ago = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function StatusLine({ status }) {
  const cfg = STATUS[status] || STATUS.OPEN;
  const Icon = cfg.icon;
  return (
    <span className="statusline" style={{ color: cfg.c, borderColor: cfg.c + '55', background: cfg.c + '14' }}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

function WorkflowActions({ report, onAction }) {
  const [loading, setLoading] = useState(null);
  const [msg, setMsg] = useState(null);
  const status = report.status || 'OPEN';
  const id = report.id || report.txId;

  async function act(action, label) {
    setLoading(label); setMsg(null);
    try {
      let r;
      if (action === 'verify')  r = await api.workflowVerify(id, 'Verified via dashboard');
      if (action === 'start')   r = await api.workflowStart(id, 'Work started via dashboard');
      if (action === 'resolve') r = await api.workflowResolve(id, 'Resolved via dashboard');
      setMsg({ type: 'success', text: `→ ${r.newStatus}` });
      onAction?.(id, r.newStatus);
    } catch (e) {
      setMsg({ type: 'error', text: e.message?.slice(0, 50) || 'Failed' });
    } finally { setLoading(null); }
  }

  const actions = [];
  if (status === 'OPEN')        actions.push({ key: 'verify',  label: 'Verify',  icon: <Shield size={12} /> });
  if (status === 'VERIFIED')    actions.push({ key: 'start',   label: 'Start',   icon: <Play size={12} /> });
  if (status === 'IN_PROGRESS') actions.push({ key: 'resolve', label: 'Resolve', icon: <CheckSquare size={12} /> });
  if (actions.length === 0 && !msg) return null;

  return (
    <div className="wf-actions">
      {actions.map((a) => (
        <button key={a.key} className="wf-btn" onClick={() => act(a.key, a.label)} disabled={!!loading}>
          {loading === a.label ? <Loader2 size={12} className="spin" /> : a.icon}{a.label}
        </button>
      ))}
      <AnimatePresence>
        {msg && <motion.span className={`wf-msg ${msg.type}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>{msg.text}</motion.span>}
      </AnimatePresence>
    </div>
  );
}

function ReportCard({ report, index, onStatusChange }) {
  const cat = CATS[report.category] || CATS.OTHER;
  const Icon = cat.icon;
  const sev = SEV[report.severity] || SEV.MEDIUM;
  const [status, setStatus] = useState(report.status || 'OPEN');

  return (
    <motion.div
      layout
      className="fcard"
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), type: 'spring', stiffness: 260, damping: 24 }}
      whileHover={{ y: -5 }}
      style={{ '--accent-c': cat.color }}
    >
      <div className="fcard-glow" style={{ background: cat.color }} />
      <div className="fcard-top">
        <span className="fcard-cat" style={{ color: cat.color, background: cat.color + '1e' }}>
          <Icon size={13} /> {cat.label}
        </span>
        <StatusLine status={status} />
      </div>

      <p className="fcard-desc">{report.description || 'AI-detected civic issue'}</p>

      <div className="sev-meter">
        <div className="bars">
          {[1, 2, 3, 4].map((i) => (
            <i key={i} style={{ background: i <= sev.n ? sev.c : 'rgba(255,255,255,.1)', boxShadow: i <= sev.n ? `0 0 8px ${sev.c}88` : 'none' }} />
          ))}
        </div>
        <span className="label" style={{ color: sev.c }}>{report.severity || 'MEDIUM'}</span>
      </div>

      <div className="fcard-meta">
        <span><MapPin size={11} /> {report.location || 'Unknown'}</span>
        <span><Clock size={11} /> {ago(report.createdAt)}</span>
        <span className="mono">{report.reporter?.slice(0, 8)}…</span>
      </div>

      <WorkflowActions report={{ ...report, status }} onAction={(id, s) => { setStatus(s); onStatusChange?.(id, s); }} />
      <div className="fcard-accent" style={{ background: `linear-gradient(90deg, ${cat.color}, ${sev.c})` }} />
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="fcard skel">
      <div className="fcard-top"><span className="cc-skel" style={{ width: 110, height: 24, borderRadius: 8 }} /><span className="cc-skel" style={{ width: 80, height: 22, borderRadius: 20 }} /></div>
      <span className="cc-skel" style={{ width: '100%', height: 14, marginBottom: 8 }} />
      <span className="cc-skel" style={{ width: '70%', height: 14, marginBottom: 16 }} />
      <span className="cc-skel" style={{ width: 120, height: 10, marginBottom: 14 }} />
      <span className="cc-skel" style={{ width: '60%', height: 10 }} />
    </div>
  );
}

export default function FeedPage() {
  const [reports, setReports]   = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]     = useState('ALL');
  const [query, setQuery]       = useState('');

  async function load(silent = false) {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [r, o] = await Promise.allSettled([api.reports(), api.analyticsOverview()]);
      if (r.status === 'fulfilled') setReports(r.value.reports || []);
      if (o.status === 'fulfilled') setOverview(o.value);
    } finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { const id = setInterval(() => load(true), 15_000); return () => clearInterval(id); }, []);

  const counts = useMemo(() => {
    const c = {};
    reports.forEach((r) => { c[r.category] = (c[r.category] || 0) + 1; });
    return c;
  }, [reports]);

  const filtered = useMemo(() => {
    let list = filter === 'ALL' ? reports : reports.filter((r) => r.category === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((r) => (r.description || '').toLowerCase().includes(q) || (r.location || '').toLowerCase().includes(q) || (r.reporter || '').toLowerCase().includes(q));
    }
    return list;
  }, [reports, filter, query]);

  const stats = [
    ['Total',    overview?.totalReports ?? reports.length, 'var(--accent)', false],
    ['Open',     overview?.openReports ?? 0, '#FF9A3A', false],
    ['Verified', overview?.verifiedReports ?? 0, '#3b82f6', false],
    ['Resolved', overview?.resolvedReports ?? 0, '#19c37d', false],
    ['Rate',     overview?.resolutionRate ?? 0, '#06b6d4', true],
  ];

  return (
    <div className="page">
      <div className="cc-dash-head">
        <div>
          <div className="cc-dash-eyebrow">Real-time civic stream</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="cc-dash-title">Live Feed</h1>
            <LiveBadge />
          </div>
          <p className="cc-dash-sub">Every report below is an immutable block on the SAYMAN chain.</p>
        </div>
        <button className="cc-refresh" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Syncing' : 'Refresh'}
        </button>
      </div>

      {/* Animated stats */}
      <div className="feed-statgrid">
        {stats.map(([label, val, clr, pct], i) => (
          <motion.div key={label} className="feed-stat" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <span className="v" style={{ color: clr }}><CountUp value={val} suffix={pct ? '%' : ''} /></span>
            <span className="l">{label}</span>
            <span className="spark" style={{ background: clr }} />
          </motion.div>
        ))}
      </div>

      {/* Toolbar: search + count */}
      <div className="feed-toolbar">
        <div className="feed-search">
          <Search size={15} />
          <input placeholder="Search reports, locations, reporters…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--muted)' }}>
          {filtered.length} {filtered.length === 1 ? 'report' : 'reports'}
        </span>
      </div>

      {/* Category chips with counts */}
      <div className="chip-row">
        <button className={`chip ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
          All <span className="cnt">{reports.length}</span>
        </button>
        {Object.entries(CATS).map(([key, cfg]) => (
          <button key={key} className={`chip ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}
            style={filter === key ? { background: cfg.color, borderColor: cfg.color } : {}}>
            <span className="dot" style={{ background: cfg.color }} /> {cfg.label} <span className="cnt">{counts[key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="feed-grid">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <motion.div className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Inbox size={42} />
          <p>{query || filter !== 'ALL' ? 'No reports match your filters.' : 'No reports yet — be the first to forge a block.'}</p>
        </motion.div>
      ) : (
        <motion.div layout className="feed-grid">
          <AnimatePresence>
            {filtered.map((r, i) => (
              <ReportCard key={r.id || r.txId || i} report={r} index={i} onStatusChange={() => load(true)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
