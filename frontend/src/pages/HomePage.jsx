import { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api.js';

/**
 * CivicChain landing page.
 *  - Three.js scroll-forged blockchain hero (sticky 420vh track)
 *  - Reveal-on-scroll sections (Problem / Solution / Explore / One-liner)
 *  - A live "Network" section wired to the real backend (all functionalities surfaced)
 *  - "Explore" cards route into the actual app tabs via setTab
 */
export default function HomePage({ setTab, onConnect }) {
  const rootRef    = useRef(null);
  const trackRef   = useRef(null);
  const canvasRef  = useRef(null);
  const overlayRef = useRef(null);
  const railRef    = useRef(null);

  const [stats, setStats]       = useState(null);
  const [overview, setOverview] = useState(null);

  // ── Live backend data ───────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    async function load() {
      const [s, o] = await Promise.allSettled([api.stats(), api.analyticsOverview()]);
      if (!alive) return;
      if (s.status === 'fulfilled') setStats(s.value);
      if (o.status === 'fulfilled') setOverview(o.value);
    }
    load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ── Reveal-on-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    const els = Array.from(rootRef.current?.querySelectorAll('.cc-reveal') || []);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // ── Three.js scroll-forged blockchain hero ───────────────────────────────────
  useEffect(() => {
    const THREE = window.THREE;
    const canvas = canvasRef.current;
    const track  = trackRef.current;
    if (!canvas || !track) return;

    const state = { scrollProgress: 0, mouse: { x: 0, y: 0 }, tmouse: { x: 0, y: 0 }, camZ: 8, raf: 0 };

    const computeProgress = () => {
      const r = track.getBoundingClientRect();
      const total = track.offsetHeight - window.innerHeight;
      const p = Math.min(1, Math.max(0, (-r.top) / total));
      state.scrollProgress = p;
      if (railRef.current) railRef.current.style.height = (p * 100) + '%';
    };
    const onScroll = () => computeProgress();
    const onMouse  = (e) => { state.tmouse.x = e.clientX / window.innerWidth - 0.5; state.tmouse.y = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onMouse, { passive: true });
    computeProgress();

    // No three.js available → graceful fallback (captions still animate on scroll)
    if (!THREE) {
      const caps = overlayRef.current ? Array.from(overlayRef.current.querySelectorAll('[data-cap]')) : [];
      const centers = [0.10, 0.40, 0.66, 0.92], widths = [0.16, 0.13, 0.13, 0.14];
      const loop = () => {
        state.raf = requestAnimationFrame(loop);
        const p = state.scrollProgress;
        caps.forEach((el, i) => {
          let o = 1 - Math.abs(p - centers[i]) / widths[i];
          o = Math.max(0, Math.min(1, o));
          el.style.opacity = o.toFixed(3);
          el.style.transform = `translateY(${((1 - o) * 26).toFixed(1)}px)`;
        });
      };
      loop();
      return () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('mousemove', onMouse);
        cancelAnimationFrame(state.raf);
      };
    }

    const w = window.innerWidth, h = window.innerHeight;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x07080a, 14, 46);
    const camera = new THREE.PerspectiveCamera(62, w / h, 0.1, 200);
    camera.position.set(0, 0.6, 8);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x07080a, 1);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const p1 = new THREE.PointLight(0xFF9A3A, 1.4, 40); p1.position.set(4, 6, 6); scene.add(p1);
    const p2 = new THREE.PointLight(0x19c37d, 1.0, 40); p2.position.set(-6, -3, 4); scene.add(p2);

    const makeGlow = (hex) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, hex); grd.addColorStop(0.25, hex); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    };

    const N = 16, spacing = 3.0;
    const saffronGlow = makeGlow('#FF9A3A');
    const greenGlow   = makeGlow('#19c37d');
    const blocks = [];
    const group = new THREE.Group();
    scene.add(group);

    for (let i = 0; i < N; i++) {
      const isGreen = i % 3 === 2;
      const col = isGreen ? 0x19c37d : 0xFF9A3A;
      const geo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
      const mat = new THREE.MeshStandardMaterial({ color: 0x0d0f13, metalness: 0.55, roughness: 0.3, emissive: col, emissiveIntensity: 0, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0 }));
      mesh.add(edges);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: isGreen ? greenGlow : saffronGlow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.scale.set(4.5, 4.5, 1); mesh.add(sp);
      const bx = Math.sin(i * 0.62) * 1.5, by = Math.cos(i * 0.5) * 0.95, bz = -i * spacing;
      mesh.position.set(bx, by, bz);
      mesh.scale.setScalar(0.001);
      group.add(mesh);
      blocks.push({ mesh, mat, edges, sp, base: { x: bx, y: by, z: bz }, phase: i * 0.9 });
    }

    const conns = [];
    for (let i = 0; i < N - 1; i++) {
      const a = blocks[i].base, b = blocks[i + 1].base;
      const cmat = new THREE.LineBasicMaterial({ color: 0xFF9A3A, transparent: true, opacity: 0 });
      const cgeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
      conns.push({ cmat, i, line: (() => { const l = new THREE.Line(cgeo, cmat); group.add(l); return l; })() });
    }

    const pcount = 900;
    const ppos = new Float32Array(pcount * 3), pcol = new Float32Array(pcount * 3);
    const palette = [[1, 0.6, 0.23], [0.1, 0.76, 0.49], [0.95, 0.93, 0.88]];
    for (let i = 0; i < pcount; i++) {
      ppos[i * 3] = (Math.random() - 0.5) * 40;
      ppos[i * 3 + 1] = (Math.random() - 0.5) * 26;
      ppos[i * 3 + 2] = -Math.random() * 60 + 6;
      const c = palette[Math.floor(Math.random() * palette.length)];
      pcol[i * 3] = c[0]; pcol[i * 3 + 1] = c[1]; pcol[i * 3 + 2] = c[2];
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
    const points = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(points);

    const grid = new THREE.GridHelper(120, 60, 0xFF9A3A, 0x1a1d22);
    grid.position.y = -7; grid.material.transparent = true; grid.material.opacity = 0.12;
    scene.add(grid);

    const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    const caps = overlayRef.current ? Array.from(overlayRef.current.querySelectorAll('[data-cap]')) : [];
    const clock = new THREE.Clock();

    const animate = () => {
      state.raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const p = state.scrollProgress;
      state.mouse.x += (state.tmouse.x - state.mouse.x) * 0.05;
      state.mouse.y += (state.tmouse.y - state.mouse.y) * 0.05;

      const frontier = p * (N + 1.5);
      for (let i = 0; i < N; i++) {
        const b = blocks[i];
        const tt = Math.min(1, Math.max(0, frontier - i));
        const e = tt <= 0 ? 0 : easeOutBack(tt);
        b.mesh.scale.setScalar(Math.max(0.001, e));
        b.mat.opacity = tt;
        b.mat.emissiveIntensity = 0.4 * tt;
        b.edges.material.opacity = tt;
        b.sp.material.opacity = 0.5 * tt;
        b.mesh.position.y = b.base.y + Math.sin(t * 1.1 + b.phase) * 0.14;
        b.mesh.rotation.y += 0.004;
        b.mesh.rotation.x = Math.sin(t * 0.5 + b.phase) * 0.12;
      }
      for (const c of conns) c.cmat.opacity = Math.min(1, Math.max(0, frontier - c.i - 0.5)) * 0.55;

      points.rotation.y = t * 0.012;
      grid.material.opacity = 0.06 + 0.06 * Math.sin(t * 0.6);

      const targetZ = 8 - p * (N * spacing + 2);
      state.camZ += (targetZ - state.camZ) * 0.08;
      camera.position.z = state.camZ;
      camera.position.x = state.mouse.x * 2.4;
      camera.position.y = 0.6 - state.mouse.y * 1.6;
      camera.lookAt(state.mouse.x * 1.2, 0, state.camZ - 7);

      const centers = [0.10, 0.40, 0.66, 0.92], widths = [0.16, 0.13, 0.13, 0.14];
      caps.forEach((el, idx) => {
        let o = 1 - Math.abs(p - centers[idx]) / widths[idx];
        o = Math.max(0, Math.min(1, o));
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translateY(${((1 - o) * 26).toFixed(1)}px)`;
      });

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const ww = window.innerWidth, hh = window.innerHeight;
      camera.aspect = ww / hh; camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(state.raf);
      renderer.dispose();
    };
  }, []);

  const go = (tab) => () => { window.scrollTo({ top: 0, behavior: 'auto' }); setTab?.(tab); };

  const liveCards = [
    { v: stats?.blocks ?? '—',                 l: 'Blocks Forged',   c: 'var(--accent)' },
    { v: overview?.totalReports ?? stats?.reports ?? '—', l: 'Reports On-Chain', c: 'var(--accent2)' },
    { v: overview?.resolvedReports ?? '—',     l: 'Issues Resolved', c: 'var(--accent2)' },
    { v: overview ? overview.resolutionRate + '%' : '—', l: 'Resolution Rate', c: 'var(--accent)' },
    { v: stats?.validators ?? '—',             l: 'Validators',      c: 'var(--accent)' },
    { v: stats?.mempool ?? '—',                l: 'Mempool',         c: 'var(--accent2)' },
  ];

  return (
    <div className="cc-home" ref={rootRef}>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="cc-hero-track" ref={trackRef}>
        <div className="cc-hero-sticky">
          <div className="cc-hero-fallback" aria-hidden />
          <canvas className="cc-hero-canvas" ref={canvasRef} />
          <div className="cc-hero-vignette" aria-hidden />
          <div className="cc-hero-scan" aria-hidden />

          <div className="cc-hero-overlay" ref={overlayRef}>
            <div data-cap="0" className="cc-cap">
              <div className="cc-kicker">National Civic Intelligence Network</div>
              <h1 className="cc-hero-title">Civic<span className="cc-accent">Chain</span></h1>
              <p className="cc-hero-sub">
                Citizens report. AI verifies. Blockchain remembers.<br />
                <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>Nobody can hide.</span>
              </p>
              <div className="cc-hero-scrollhint"><i />scroll to forge the chain</div>
            </div>

            <div data-cap="1" className="cc-cap" style={{ opacity: 0, gap: 16 }}>
              <div className="cc-kicker tight">// PROOF OF REPORT</div>
              <h2 className="cc-hero-h2">Every report becomes<br />an <span className="cc-accent">immutable block.</span></h2>
            </div>

            <div data-cap="2" className="cc-cap" style={{ opacity: 0, gap: 16 }}>
              <div className="cc-kicker tight green">// END-TO-END TRACEABILITY</div>
              <h2 className="cc-hero-h2">Every rupee carries<br />a <span className="cc-accent2">traceable journey.</span></h2>
            </div>

            <div data-cap="3" className="cc-cap" style={{ opacity: 0, gap: 24 }}>
              <h2 className="cc-hero-h2">One chain.<br />Total <span className="cc-accent">accountability.</span></h2>
              <button className="cc-hero-cta" onClick={go('Submit')}>Launch the app →</button>
            </div>
          </div>

          <div className="cc-hero-rail"><i ref={railRef} /></div>
        </div>
      </section>

      {/* ── PROBLEM ──────────────────────────────────────────────────────────── */}
      <section className="cc-section">
        <div className="cc-reveal">
          <div className="cc-eyebrow">01 / The Problem</div>
          <h2 className="cc-h2">India's civic infrastructure fails <span className="dim">silently</span> — and when disasters strike, <span className="cc-accent">accountability disappears.</span></h2>
        </div>

        <div className="cc-grid-2">
          <div className="cc-reveal cc-panel">
            <div className="cc-topbar" style={{ background: 'var(--accent)' }} />
            <div className="cc-panel-label" style={{ color: 'var(--accent)' }}>CIVIC FAILURES</div>
            <div className="cc-panel-list">
              <div className="row"><span className="arrow" style={{ color: 'var(--accent)' }}>→</span><p>500 people see a pipeline burst. Authorities know <b>tomorrow.</b></p></div>
              <div className="row"><span className="arrow" style={{ color: 'var(--accent)' }}>→</span><p>Potholes reported. No action. <b>No record.</b></p></div>
              <div className="row"><span className="arrow" style={{ color: 'var(--accent)' }}>→</span><p>Complaint portals exist. Data gets <b>manipulated.</b></p></div>
            </div>
          </div>
          <div className="cc-reveal cc-panel">
            <div className="cc-topbar" style={{ background: 'var(--accent2)' }} />
            <div className="cc-panel-label" style={{ color: 'var(--accent2)' }}>DISASTER RESPONSE</div>
            <div className="cc-panel-list">
              <div className="row"><span className="arrow" style={{ color: 'var(--accent2)' }}>→</span><p>₹10 crore donated for flood relief. <b>₹3 crore reaches victims.</b></p></div>
              <div className="row"><span className="arrow" style={{ color: 'var(--accent2)' }}>→</span><p>NGOs, districts, beneficiaries — <b>zero shared tracking.</b></p></div>
              <div className="row"><span className="arrow" style={{ color: 'var(--accent2)' }}>→</span><p>Donors have <b>no visibility</b> after payment.</p></div>
            </div>
          </div>
        </div>

        <div className="cc-reveal cc-callout">
          <div className="glyph">≡</div>
          <p>The root cause is the same: <b>multiple actors who don't trust each other</b>, and no neutral system to enforce accountability.</p>
        </div>
      </section>

      {/* ── SOLUTION ─────────────────────────────────────────────────────────── */}
      <section className="cc-section tight">
        <div className="cc-reveal">
          <div className="cc-eyebrow">02 / The Solution</div>
          <h2 className="cc-h2">A <span className="cc-accent">dual-purpose</span> decentralized platform that solves both problems on a <span className="cc-accent2">single blockchain backbone.</span></h2>
        </div>
        <div className="cc-feature-grid">
          <div className="cc-reveal cc-feature">
            <div className="num" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>01</div>
            <h3>Civic Reporting Engine</h3>
            <p>Real-time, AI-verified civic issue reporting with government accountability tracking baked into the chain.</p>
          </div>
          <div className="cc-reveal cc-feature">
            <div className="num" style={{ borderColor: 'var(--accent2)', color: 'var(--accent2)' }}>02</div>
            <h3>Disaster Fund Transparency</h3>
            <p>End-to-end donation traceability — from the donor's wallet to the final verified beneficiary.</p>
          </div>
        </div>
      </section>

      {/* ── LIVE NETWORK (backend-powered) ───────────────────────────────────── */}
      <section className="cc-live">
        <div className="cc-reveal cc-eyebrow green" style={{ color: 'var(--accent2)' }}>// LIVE ON SAYMAN TESTNET</div>
        <div className="cc-reveal cc-h2" style={{ fontSize: 'clamp(26px,4vw,46px)' }}>The chain is <span className="cc-accent2">already running.</span></div>
        <div className="cc-live-grid">
          {liveCards.map((c) => (
            <div key={c.l} className="cc-reveal cc-live-card">
              <span className="cc-live-dot" />
              <div className="v" style={{ color: c.c }}>{c.v}</div>
              <span className="l">{c.l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── EXPLORE / app nav ────────────────────────────────────────────────── */}
      <section className="cc-section tight" style={{ paddingTop: 0 }}>
        <div className="cc-reveal cc-eyebrow muted">Explore the system</div>
        <div className="cc-explore-grid">
          <button className="cc-reveal cc-explore-card" onClick={go('Submit')}>
            <div className="tag" style={{ color: 'var(--accent)' }}>→ REPORT</div>
            <h4>Submit a Report</h4>
            <p>Upload evidence → AI vision → IPFS → blockchain → rewards.</p>
          </button>
          <button className="cc-reveal cc-explore-card" onClick={go('Feed')}>
            <div className="tag" style={{ color: 'var(--accent)' }}>→ FEED</div>
            <h4>Live Civic Feed</h4>
            <p>Every verified report, streaming from the chain in real time.</p>
          </button>
          <button className="cc-reveal cc-explore-card" onClick={go('Analytics')}>
            <div className="tag" style={{ color: 'var(--accent2)' }}>→ INSIGHTS</div>
            <h4>Analytics</h4>
            <p>Categories, severity, hotspots, trends & contributor leaderboard.</p>
          </button>
          <button className="cc-reveal cc-explore-card" onClick={go('Explorer')}>
            <div className="tag" style={{ color: 'var(--accent2)' }}>→ CHAIN</div>
            <h4>Block Explorer</h4>
            <p>Inspect SAYMAN blocks and deployed smart contracts.</p>
          </button>
        </div>
      </section>

      {/* ── ONE-LINER ────────────────────────────────────────────────────────── */}
      <section className="cc-section center">
        <div className="cc-reveal" style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div className="cc-eyebrow" style={{ marginBottom: 30 }}>THE ONE-LINER</div>
          <p className="cc-oneliner">
            CivicChain turns citizens into a real-time <span className="cc-accent">decentralized sensor network</span> and makes every donated rupee <span className="cc-accent2">traceable</span> — powered by AI, secured by blockchain.
          </p>
          <button className="btn-primary" style={{ marginTop: 36 }} onClick={onConnect}>Connect your wallet →</button>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="cc-footer">
        <span>Built on SAYMAN Blockchain · Designed for Bharat 🇮🇳</span>
        <span>Accountable to no one authority.</span>
      </footer>
    </div>
  );
}
