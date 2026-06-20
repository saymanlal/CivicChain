import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Cpu, CheckCircle2, AlertCircle, Loader2, UploadCloud, Image as ImageIcon, X,
  ShieldCheck, Coins, Star, MapPin, Building2, Boxes, Sparkles, ExternalLink,
} from 'lucide-react';
import { api } from '../utils/api.js';
import { CountUp } from '../components/ui.jsx';

const STEPS = [
  { key: 'upload', label: 'Uploading',   desc: 'Securing your evidence',        icon: UploadCloud },
  { key: 'ai',     label: 'AI Analysis', desc: 'Gemini Vision classification',  icon: Cpu },
  { key: 'fraud',  label: 'Fraud Check', desc: 'Duplicate & tamper detection',  icon: ShieldCheck },
  { key: 'ipfs',   label: 'IPFS Upload', desc: 'Pinning to permanent storage',  icon: ImageIcon },
  { key: 'chain',  label: 'Blockchain',  desc: 'Forging the immutable block',   icon: Boxes },
  { key: 'reward', label: 'Rewards',     desc: 'Minting points & reputation',   icon: Coins },
];

const CONFETTI = ['#FF9A3A', '#19c37d', '#3b82f6', '#f4f1ea', '#a855f7'];

function Pipeline({ current, status }) {
  return (
    <div className="pipe">
      {STEPS.map((s, i) => {
        const done = status === 'success' || i < current;
        const active = status === 'loading' && i === current;
        const Icon = s.icon;
        return (
          <div key={s.key} className={`pipe-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
            <div className="pipe-rail">
              <motion.div className="pipe-node" animate={active ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={{ repeat: active ? Infinity : 0, duration: 1.1 }}>
                {done ? <CheckCircle2 size={16} /> : active ? <Loader2 size={15} className="spin" /> : <Icon size={15} />}
              </motion.div>
              {i < STEPS.length - 1 && <span className="pipe-line" />}
            </div>
            <div className="pipe-info">
              <div className="t">{s.label}</div>
              <div className="d">{s.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SubmitPage() {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [location, setLocation] = useState('');
  const [city, setCity]         = useState('');
  const [cities, setCities]     = useState([]);
  const [status, setStatus]     = useState(null);
  const [step, setStep]         = useState(0);
  const [result, setResult]     = useState(null);
  const [errMsg, setErrMsg]     = useState('');
  const [drag, setDrag]         = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { api.cities().then((d) => setCities(d.cities || [])).catch(() => {}); }, []);

  function setImage(f) {
    if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f)); setStatus(null); setResult(null);
  }
  function clearFile() {
    setFile(null); setPreview(null); setStatus(null); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit() {
    if (!file) return;
    if (!city) { setErrMsg('Please select a city.'); setStatus('error'); return; }
    setStatus('loading'); setErrMsg(''); setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2600);
    try {
      const data = await api.submitReport(file, city, location);
      clearInterval(timer); setStep(STEPS.length);
      if (data.duplicate) { setStatus('duplicate'); setErrMsg(data.reason || 'This image has already been reported.'); setResult(data); return; }
      setResult(data); setStatus('success');
    } catch (e) {
      clearInterval(timer); setErrMsg(e.message || 'Report submission failed'); setStatus('error');
    }
  }

  const canSubmit = file && city && status !== 'loading';

  return (
    <div className="page">
      <div className="cc-dash-head">
        <div>
          <div className="cc-dash-eyebrow">Proof of report</div>
          <h1 className="cc-dash-title">Submit a Civic Report</h1>
          <p className="cc-dash-sub">One image. Six automated steps. One immutable block.</p>
        </div>
      </div>

      <div className="submit-wrap">
        {/* ── Left: form ── */}
        <motion.div className="submit-main" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          {/* Dropzone / preview */}
          <div className="field">
            <label>Civic Issue Image</label>
            <AnimatePresence mode="wait">
              {!preview ? (
                <motion.div
                  key="dz"
                  className={`dropzone ${drag ? 'drag' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); setImage(e.dataTransfer.files?.[0]); }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  <div className="dz-icon"><UploadCloud size={26} /></div>
                  <span className="dz-main">{drag ? 'Drop it!' : 'Drag & drop or click to upload'}</span>
                  <span className="dz-hint">JPEG · PNG · WebP — max 10 MB</span>
                </motion.div>
              ) : (
                <motion.div key="pv" className="preview-frame" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <img src={preview} alt="Preview" />
                  {status === 'loading' && (
                    <motion.div className="scan-line" initial={{ top: '0%' }} animate={{ top: ['0%', '100%', '0%'] }} transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }} />
                  )}
                  <button className="preview-x" onClick={clearFile}><X size={15} /></button>
                </motion.div>
              )}
            </AnimatePresence>
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0])} style={{ display: 'none' }} />
          </div>

          {/* City */}
          <div className="field">
            <label><Building2 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />City <span className="field-required">*</span></label>
            <select className="field-select" value={city} onChange={(e) => { setCity(e.target.value); setStatus(null); setErrMsg(''); }}>
              <option value="">Select city…</option>
              {cities.map((c) => <option key={c.code} value={c.code}>{c.name}, {c.state}</option>)}
            </select>
          </div>

          {/* Address */}
          <div className="field">
            <label><MapPin size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Address / Landmark <span className="field-optional">(optional)</span></label>
            <input type="text" className="field-input" placeholder="e.g. MP Nagar Zone 2, Near DB Mall" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
            <span className="field-hint">{location.length}/200</span>
          </div>

          {/* Alerts */}
          <AnimatePresence>
            {status === 'duplicate' && (
              <motion.div className="alert error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AlertCircle size={14} />&nbsp;{errMsg}{result?.existingReportId && <> (Report: <code>{result.existingReportId}</code>)</>}
              </motion.div>
            )}
            {status === 'error' && (
              <motion.div className="alert error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AlertCircle size={14} />&nbsp;{errMsg || 'Submission failed — please try again.'}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success */}
          <AnimatePresence>
            {status === 'success' && result && (
              <motion.div className="result-success" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
                <div className="confetti-layer">
                  {Array.from({ length: 18 }).map((_, i) => (
                    <i key={i} style={{ left: `${(i * 5.5 + 4)}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 6) * 0.05}s` }} />
                  ))}
                </div>
                <div className="result-head"><CheckCircle2 size={20} /> Block forged successfully!</div>
                {result.cityName && (
                  <div className="dept-badge-row" style={{ marginBottom: '0.75rem' }}>
                    <Building2 size={12} /><span>{result.cityName}</span>
                    {result.address && <span style={{ color: 'var(--muted)' }}>· {result.address}</span>}
                  </div>
                )}
                <div className="reward-grid">
                  <div className="reward-cell">
                    <div className="ic" style={{ background: 'rgba(255,154,58,.15)', color: 'var(--accent)' }}><Cpu size={16} /></div>
                    <div><div className="big">{result.analysis?.confidence ?? 0}%</div><div className="cap">{result.analysis?.category?.replace(/_/g, ' ') || 'AI verdict'}</div></div>
                  </div>
                  <div className="reward-cell">
                    <div className="ic" style={{ background: 'rgba(239,68,68,.15)', color: '#ef6a6a' }}><ShieldCheck size={16} /></div>
                    <div><div className="big" style={{ fontSize: '1rem' }}>{result.analysis?.severity || '—'}</div><div className="cap">Severity</div></div>
                  </div>
                  <div className="reward-cell">
                    <div className="ic" style={{ background: 'rgba(255,154,58,.15)', color: 'var(--accent)' }}><Coins size={16} /></div>
                    <div><div className="big" style={{ color: 'var(--accent)' }}>+<CountUp value={result.rewards?.earned || 0} /></div><div className="cap">Reward points</div></div>
                  </div>
                  <div className="reward-cell">
                    <div className="ic" style={{ background: 'rgba(25,195,125,.15)', color: 'var(--accent2)' }}><Star size={16} /></div>
                    <div><div className="big" style={{ color: 'var(--accent2)' }}>+<CountUp value={result.reputation?.earned || 0} /></div><div className="cap">Reputation</div></div>
                  </div>
                </div>
                {result.blockchain?.txHash && <div className="dept-badge-row" style={{ marginBottom: '0.5rem' }}>Tx: <code>{result.blockchain.txHash.slice(0, 24)}…</code></div>}
                {result.evidence?.publicUrl && (
                  <a href={result.evidence.publicUrl} target="_blank" rel="noreferrer" className="cc-refresh" style={{ textDecoration: 'none' }}>
                    <ExternalLink size={12} /> View evidence on IPFS
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <button className="btn-primary full" onClick={submit} disabled={!canSubmit}>
            {status === 'loading' ? <><Loader2 size={14} className="spin" /> Processing…</> : <><Send size={14} /> Submit Report</>}
          </button>
        </motion.div>

        {/* ── Right: live pipeline ── */}
        <motion.aside className="submit-aside" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <div className="aside-title">
            {status === 'loading' ? '⚡ Processing pipeline' : status === 'success' ? '✓ Pipeline complete' : '◇ The processing pipeline'}
          </div>
          <Pipeline current={step} status={status} />
          <div style={{ marginTop: '1.5rem', padding: '0.85rem 1rem', borderRadius: 12, background: 'rgba(255,154,58,.05)', border: '1px solid rgba(255,154,58,.18)', display: 'flex', gap: 10 }}>
            <Sparkles size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: '0.78rem', color: '#cfd2d8', lineHeight: 1.5 }}>
              Your evidence is classified by AI, stored on IPFS, and written to the SAYMAN chain — fully automated, fully verifiable, impossible to alter.
            </p>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
