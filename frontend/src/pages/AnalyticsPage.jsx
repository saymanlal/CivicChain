import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, TrendingUp, TrendingDown, MapPin, Award, Lightbulb, CheckCircle2,
  AlertCircle, Loader2, Zap, CalendarDays, Flame, RefreshCw,
} from 'lucide-react';
import { api } from '../utils/api.js';
import { CountUp, Donut, LiveBadge } from '../components/ui.jsx';

const CAT_COLOR = {
  ROAD_DAMAGE: '#f97316', FLOOD: '#3b82f6', FIRE: '#ef4444', STREETLIGHT: '#eab308',
  GARBAGE: '#84cc16', WATER_LEAK: '#06b6d4', UNSAFE_BUILDING: '#a855f7', OTHER: '#8a8f98',
};
const SEV_COLOR = { LOW: '#19c37d', MEDIUM: '#FF9A3A', HIGH: '#ef4444', CRITICAL: '#a855f7' };
const MEDALS = ['🥇', '🥈', '🥉'];
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

function Section({ children, delay = 0, className = '' }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay }}>
      {children}
    </motion.div>
  );
}

export default function AnalyticsPage() {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview]     = useState(null);
  const [categories, setCategories] = useState({});
  const [severity, setSeverity]     = useState({});
  const [topReporters, setTop]      = useState([]);
  const [hotspots, setHotspots]     = useState([]);
  const [trends, setTrends]         = useState(null);
  const [insights, setInsights]     = useState([]);

  async function load(silent = false) {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [o, c, s, t, h, tr, i] = await Promise.allSettled([
        api.analyticsOverview(), api.analyticsCategories(), api.analyticsSeverity(),
        api.analyticsTopReporters(), api.analyticsHotspots(), api.analyticsTrends(), api.analyticsInsights(),
      ]);
      if (o.status === 'fulfilled')  setOverview(o.value);
      if (c.status === 'fulfilled')  setCategories(c.value || {});
      if (s.status === 'fulfilled')  setSeverity(s.value || {});
      if (t.status === 'fulfilled')  setTop(t.value || []);
      if (h.status === 'fulfilled')  setHotspots(h.value || []);
      if (tr.status === 'fulfilled') setTrends(tr.value);
      if (i.status === 'fulfilled')  setInsights(i.value?.insights || []);
    } finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="center-loader"><Loader2 size={30} className="spin" /><p>Crunching civic intelligence…</p></div>;
  }

  const total = overview?.totalReports || 0;
  const catEntries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(...Object.values(categories), 1);
  const sevSegments = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].filter((k) => severity[k]).map((k) => ({ label: k, value: severity[k], color: SEV_COLOR[k] }));
  const sevTotal = Object.values(severity).reduce((a, b) => a + b, 0);
  const maxHot = Math.max(...hotspots.map((h) => h.reports), 1);

  const kpis = [
    { v: overview?.totalReports ?? 0,    l: 'Total Reports',   c: '#FF9A3A', ic: BarChart3, pct: false },
    { v: overview?.openReports ?? 0,     l: 'Open Issues',     c: '#3b82f6', ic: AlertCircle, pct: false },
    { v: overview?.verifiedReports ?? 0, l: 'Verified',        c: '#a855f7', ic: Zap, pct: false },
    { v: overview?.resolvedReports ?? 0, l: 'Resolved',        c: '#19c37d', ic: CheckCircle2, pct: false },
    { v: overview?.resolutionRate ?? 0,  l: 'Resolution Rate', c: '#06b6d4', ic: (overview?.resolutionRate ?? 0) >= 50 ? TrendingUp : TrendingDown, pct: true },
  ];

  return (
    <div className="page">
      <div className="cc-dash-head">
        <div>
          <div className="cc-dash-eyebrow">Civic intelligence</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="cc-dash-title">Analytics</h1><LiveBadge label="REAL-TIME" />
          </div>
          <p className="cc-dash-sub">On-chain insights across categories, severity, hotspots & contributors.</p>
        </div>
        <button className="cc-refresh" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Syncing' : 'Refresh'}
        </button>
      </div>

      {/* KPI hero */}
      <div className="an-hero">
        <div className="an-kpis">
          {kpis.map((k, i) => {
            const Ic = k.ic;
            return (
              <motion.div key={k.l} className="an-kpi" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                <div className="ic" style={{ background: k.c + '22', color: k.c }}><Ic size={18} /></div>
                <span className="v" style={{ color: k.c }}><CountUp value={k.v} suffix={k.pct ? '%' : ''} /></span>
                <span className="l">{k.l}</span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <Section className="an-card" delay={0.05} >
          <div className="an-card-head"><Lightbulb size={16} style={{ color: 'var(--accent)' }} /><h3>AI Insights</h3></div>
          <div className="insight-rail">
            {insights.map((ins, i) => (
              <motion.div key={i} className="insight-chip" initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                <span className="dot" /><p>{ins}</p>
              </motion.div>
            ))}
          </div>
        </Section>
      )}

      <div style={{ height: 20 }} />

      {/* Categories + Severity */}
      <div className="an-grid">
        <Section className="an-card">
          <div className="an-card-head"><BarChart3 size={16} style={{ color: 'var(--accent)' }} /><h3>Issues by Category</h3><span className="badge">{total} total</span></div>
          {catEntries.length === 0 ? <p className="muted">No category data yet.</p> : catEntries.map(([cat, count], i) => {
            const color = CAT_COLOR[cat] || CAT_COLOR.OTHER;
            const pct = Math.round((count / total) * 100) || 0;
            return (
              <div key={cat} className="hbar">
                <div className="hbar-top">
                  <span className="hbar-name"><span className="sw" style={{ background: color }} />{cat.replace(/_/g, ' ')}</span>
                  <span className="hbar-val">{count} · {pct}%</span>
                </div>
                <div className="hbar-track">
                  <motion.div className="hbar-fill" style={{ background: color }} initial={{ width: 0 }} whileInView={{ width: `${(count / maxCat) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.1 + i * 0.07, ease: [0.16, 1, 0.3, 1] }} />
                </div>
              </div>
            );
          })}
        </Section>

        <Section className="an-card" delay={0.08}>
          <div className="an-card-head"><Zap size={16} style={{ color: 'var(--accent)' }} /><h3>Severity Mix</h3></div>
          {sevTotal === 0 ? <p className="muted">No severity data.</p> : (
            <div className="donut-block">
              <Donut segments={sevSegments} size={168} stroke={20} center={<><span className="donut-center-v"><CountUp value={sevTotal} /></span><span className="donut-center-l">reports</span></>} />
              <div className="legend">
                {sevSegments.map((s) => (
                  <div key={s.label} className="legend-row">
                    <span className="sw" style={{ background: s.color }} />
                    <span className="nm">{s.label}</span>
                    <span className="vl" style={{ color: s.color }}>{s.value} · {Math.round((s.value / sevTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Trends + Hotspots */}
      <div className="an-grid thirds">
        <Section className="an-card">
          <div className="an-card-head"><CalendarDays size={16} style={{ color: '#3b82f6' }} /><h3>Submission Trends</h3></div>
          <div className="trend-3">
            {[['Today', trends?.today], ['This Week', trends?.week], ['This Month', trends?.month]].map(([l, v]) => (
              <div key={l} className="trend-cell"><div className="v"><CountUp value={v ?? 0} /></div><div className="l">{l}</div></div>
            ))}
          </div>
        </Section>

        <Section className="an-card" delay={0.08}>
          <div className="an-card-head"><Flame size={16} style={{ color: '#ef4444' }} /><h3>Civic Hotspots</h3></div>
          {hotspots.length === 0 ? <p className="muted">No hotspot data.</p> : hotspots.slice(0, 6).map((h, i) => (
            <div key={i} className="hot-row">
              <span className="hot-rank">{i + 1}</span>
              <span className="hot-name">{h.location}</span>
              <div className="hot-track"><motion.div className="hot-fill" initial={{ width: 0 }} whileInView={{ width: `${(h.reports / maxHot) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.06 }} /></div>
              <span className="hot-cnt">{h.reports}</span>
            </div>
          ))}
        </Section>
      </div>

      {/* Leaderboard */}
      <Section className="an-card" delay={0.05}>
        <div className="an-card-head"><Award size={16} style={{ color: 'var(--accent)' }} /><h3>Top Contributors</h3></div>
        {topReporters.length === 0 ? <p className="muted">No contributors yet.</p> : (
          <>
            {topReporters.length >= 3 && (
              <div className="podium">
                {[1, 0, 2].map((idx, pos) => {
                  const r = topReporters[idx];
                  return (
                    <motion.div key={idx} className={`podium-col p${idx + 1}`} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: pos * 0.1 }} style={{ paddingTop: idx === 0 ? '1.5rem' : '1rem' }}>
                      <div className="podium-medal">{MEDALS[idx]}</div>
                      <code className="podium-addr">{short(r.address)}</code>
                      <div className={`podium-score ${idx === 0 ? 'gold' : ''}`}><CountUp value={r.points ?? r.reputation ?? 0} /></div>
                      <span style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.08em' }}>POINTS</span>
                    </motion.div>
                  );
                })}
              </div>
            )}
            <div className="lb-list">
              {topReporters.map((r, i) => (
                <motion.div key={r.address} className="lb-item" initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}>
                  <span className="lb-num">#{i + 1}</span>
                  <code className="lb-who">{short(r.address)}</code>
                  <span className="lb-rep" title="reputation">★ {r.reputation ?? 0}</span>
                  <span className="lb-pts" title="points">◆ {r.points ?? 0}</span>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
