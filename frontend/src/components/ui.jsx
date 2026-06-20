import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/* ─────────────────────────────────────────────────────────────────────────────
   Shared animated UI primitives for the CivicChain dashboards.
   ───────────────────────────────────────────────────────────────────────────── */

/** Smoothly counts a number up (or down) whenever `value` changes. */
export function CountUp({ value, duration = 1100, decimals = 0, suffix = '', prefix = '' }) {
  const target = typeof value === 'number' ? value : parseFloat(value);
  const safe = Number.isFinite(target) ? target : 0;
  const [display, setDisplay] = useState(safe);
  const ref = useRef({ raf: 0, from: safe });

  useEffect(() => {
    const from = ref.current.from;
    let start;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (safe - from) * eased);
      if (p < 1) ref.current.raf = requestAnimationFrame(tick);
      else ref.current.from = safe;
    };
    cancelAnimationFrame(ref.current.raf);
    ref.current.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current.raf);
  }, [safe, duration]);

  if (!Number.isFinite(target)) return <>{value}</>;
  return <>{prefix}{display.toFixed(decimals)}{suffix}</>;
}

/** Shimmering skeleton placeholder. */
export function Skeleton({ w = '100%', h = 14, r = 6, style }) {
  return <span className="cc-skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Animated multi-segment SVG donut chart. segments: [{ value, color, label }] */
export function Donut({ segments = [], size = 168, stroke = 18, center }) {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0) || 1;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="cc-donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="cc-donut">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const frac = (s.value || 0) / total;
          const dash = frac * circ;
          const el = (
            <motion.circle
              key={s.label || i}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${dash} ${circ - dash}`}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: -offset }}
              transition={{ duration: 1, delay: 0.15 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ filter: `drop-shadow(0 0 6px ${s.color}66)` }}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      {center && <div className="cc-donut-center">{center}</div>}
    </div>
  );
}

/** One-click copy button with a check-mark confirmation. */
export function CopyButton({ text, size = 12 }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="cc-copy"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      title="Copy"
    >
      <motion.span key={copied ? 'y' : 'n'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        {copied ? '✓' : '⧉'}
      </motion.span>
    </button>
  );
}

/** Live "streaming" pulse badge. */
export function LiveBadge({ label = 'LIVE' }) {
  return (
    <span className="cc-live-badge">
      <span className="cc-live-ping"><span /></span>
      {label}
    </span>
  );
}
