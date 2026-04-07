// ============================================================
// Background - Text flowing around the terminal window
// Uses @chenglou/pretext for text layout. Pure DOM, no framework.
// Optimized: only re-layouts when terminal position changes.
// Three-body spotlight: gravitational simulation tints text
// with blue/mauve/green via per-pixel CSS gradients.
// Colors only appear on text, never on the background.
// ============================================================

interface SpotBody { x: number; y: number; vx: number; vy: number }

export async function initBackground(): Promise<() => void> {
  if (window.innerWidth <= 768) return () => {};
  if (document.querySelector('.bg-stage')) return () => {};

  const { prepareWithSegments, layoutNextLine } = await import('@chenglou/pretext');

  const FONT_SIZE = 14;
  const LINE_HEIGHT = 26;
  const GUTTER = 24;
  const PAD = 16;
  const MIN_SLOT_WIDTH = 60;
  const MAX_CHARS = 8000;

  // --- Geometry helpers ---

  function rectIntervalForBand(rect: DOMRect, bandTop: number, bandBottom: number): { left: number; right: number } | null {
    if (bandBottom <= rect.top - PAD || bandTop >= rect.bottom + PAD) return null;
    return { left: rect.left - PAD, right: rect.right + PAD };
  }

  function carveSlots(base: { left: number; right: number }, blocked: ({ left: number; right: number } | null)[]) {
    let slots = [base];
    for (const iv of blocked) {
      if (!iv) continue;
      const next = [];
      for (const slot of slots) {
        if (iv.right <= slot.left || iv.left >= slot.right) { next.push(slot); continue; }
        if (iv.left > slot.left) next.push({ left: slot.left, right: iv.left });
        if (iv.right < slot.right) next.push({ left: iv.right, right: slot.right });
      }
      slots = next;
    }
    return slots.filter(s => s.right - s.left >= MIN_SLOT_WIDTH);
  }

  function layoutAllLines(prepared: Awaited<ReturnType<typeof prepareWithSegments>>, W: number, H: number, termRect: DOMRect | null) {
    const baseCol = { left: GUTTER, right: W - GUTTER };
    const allLines = [];
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    let lineTop = GUTTER;

    while (lineTop + LINE_HEIGHT <= H - GUTTER / 2) {
      const blocked = [];
      if (termRect) {
        const iv = rectIntervalForBand(termRect, lineTop, lineTop + LINE_HEIGHT);
        if (iv) blocked.push(iv);
      }
      const slots = carveSlots(baseCol, blocked);
      if (slots.length === 0) { lineTop += LINE_HEIGHT; continue; }
      for (const slot of slots) {
        let line = layoutNextLine(prepared, cursor, slot.right - slot.left);
        if (line === null) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 };
          line = layoutNextLine(prepared, cursor, slot.right - slot.left);
          if (line === null) break;
        }
        allLines.push({ x: Math.round(slot.left), y: Math.round(lineTop), text: line.text });
        cursor = line.end;
      }
      lineTop += LINE_HEIGHT;
    }
    return allLines;
  }

  // --- Three-body gravitational simulation ---

  const VARS = ['--blue', '--mauve', '--green'] as const;

  function hexRGB(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  function readColors(): [number, number, number][] {
    const cs = getComputedStyle(document.documentElement);
    return VARS.map(v => {
      const h = cs.getPropertyValue(v).trim();
      return h ? hexRGB(h) : ([137, 180, 250] as [number, number, number]);
    });
  }

  let spotColors = readColors();
  const themeObserver = new MutationObserver(() => { spotColors = readColors(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const G = 800;
  const SOFT = 80;
  const SOFT2 = SOFT * SOFT;
  const VMAX = 2.5;

  let W = window.innerWidth;
  let H = window.innerHeight;
  let cx = W / 2, cy = H / 2;
  const spread = Math.min(W, H) * 0.25;
  const orbitV = 0.8;

  const bodies: SpotBody[] = [0, 1, 2].map(i => {
    const a = -Math.PI / 2 + i * 2.094;
    return {
      x: cx + Math.cos(a) * spread,
      y: cy + Math.sin(a) * spread,
      vx: Math.cos(a + 1.5708) * orbitV,
      vy: Math.sin(a + 1.5708) * orbitV,
    };
  });

  // Cache terminal element ref (Fix #1: avoid repeated querySelector)
  const termRef = document.querySelector('.terminal-window');

  function stepBodies(termRect: DOMRect | null) {
    const ax = [0, 0, 0], ay = [0, 0, 0];

    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const dx = bodies[j].x - bodies[i].x;
        const dy = bodies[j].y - bodies[i].y;
        const d2 = dx * dx + dy * dy + SOFT2;
        const d = Math.sqrt(d2);
        const f = G / d2;
        const fx = f * dx / d, fy = f * dy / d;
        ax[i] += fx; ay[i] += fy;
        ax[j] -= fx; ay[j] -= fy;
      }
    }

    for (let i = 0; i < 3; i++) {
      const b = bodies[i];
      b.vx += ax[i]; b.vy += ay[i];
      b.vx += (cx - b.x) * 1e-5;
      b.vy += (cy - b.y) * 1e-5;
      const spd = Math.hypot(b.vx, b.vy);
      if (spd > VMAX) { b.vx *= VMAX / spd; b.vy *= VMAX / spd; }
      b.x += b.vx; b.y += b.vy;
      // Viewport boundary bounce
      const m = 40;
      if (b.x < m) { b.x = m; b.vx = Math.abs(b.vx) * 0.5; }
      if (b.x > W - m) { b.x = W - m; b.vx = -Math.abs(b.vx) * 0.5; }
      if (b.y < m) { b.y = m; b.vy = Math.abs(b.vy) * 0.5; }
      if (b.y > H - m) { b.y = H - m; b.vy = -Math.abs(b.vy) * 0.5; }
      // Terminal boundary bounce (Fix #5: flat if/else, no object allocation)
      if (termRect) {
        const tb = 50;
        const tLeft = termRect.left - tb;
        const tRight = termRect.right + tb;
        const tTop = termRect.top - tb;
        const tBottom = termRect.bottom + tb;
        if (b.x > tLeft && b.x < tRight && b.y > tTop && b.y < tBottom) {
          const dl = b.x - tLeft, dr = tRight - b.x;
          const dt = b.y - tTop, db = tBottom - b.y;
          const minD = Math.min(dl, dr, dt, db);
          if (minD === dl) { b.x = tLeft; b.vx = -Math.abs(b.vx) * 0.5; }
          else if (minD === dr) { b.x = tRight; b.vx = Math.abs(b.vx) * 0.5; }
          else if (minD === dt) { b.y = tTop; b.vy = -Math.abs(b.vy) * 0.5; }
          else { b.y = tBottom; b.vy = Math.abs(b.vy) * 0.5; }
        }
      }
    }
  }

  // --- DOM setup ---

  const stage = document.createElement('div');
  stage.className = 'bg-stage';
  document.body.prepend(stage);

  let prepared: Awaited<ReturnType<typeof prepareWithSegments>> | null = null;
  let linePool: HTMLSpanElement[] = [];
  let committed: { x: number; y: number; text: string }[] | null = null;
  let rafId = 0;

  const font = `${FONT_SIZE}px "JetBrains Mono", monospace`;

  function syncPool(count: number) {
    while (linePool.length < count) {
      const el = document.createElement('span');
      el.className = 'bg-line';
      stage.appendChild(el);
      linePool.push(el);
    }
    for (let i = 0; i < linePool.length; i++) {
      linePool[i].style.display = i < count ? '' : 'none';
    }
  }

  function commitLines(allLines: { x: number; y: number; text: string }[]) {
    syncPool(allLines.length);
    for (let i = 0; i < allLines.length; i++) {
      const el = linePool[i], l = allLines[i];
      el.textContent = l.text;
      el.style.left = `${l.x}px`;
      el.style.top = `${l.y}px`;
    }
    committed = allLines;
  }

  // --- Per-pixel spotlight coloring via CSS gradient ---

  const BASE_OPACITY = 0.12;
  const MAX_OPACITY = 0.65;
  const OPACITY_BOOST = 0.55;
  const COLOR_THRESHOLD = 0.005;
  const GRAD_SAMPLES = 10;

  function updateLineColors() {
    if (!committed) return;
    const R = Math.min(W, H) * 0.18;
    const R2 = R * R;
    const halfLH = LINE_HEIGHT / 2;

    for (let i = 0; i < committed.length; i++) {
      const line = committed[i];
      const el = linePool[i];
      const ly = line.y + halfLH;

      // Quick check using squared vertical distance (Fix #5: avoid sqrt)
      let nearBody = false;
      for (let j = 0; j < 3; j++) {
        const dy2 = (ly - bodies[j].y);
        if (dy2 * dy2 < R2) { nearBody = true; break; }
      }

      if (!nearBody) {
        // Remove spotlight class if it was active
        if (el.classList.contains('spotlit')) {
          el.classList.remove('spotlit');
          el.style.backgroundImage = '';
          el.style.backgroundSize = '';
          el.style.backgroundPosition = '';
        }
        continue;
      }

      // Build gradient string directly, no array allocation (Fix #3)
      let grad = `linear-gradient(to right,`;
      for (let s = 0; s <= GRAD_SAMPLES; s++) {
        if (s > 0) grad += ',';
        const frac = s / GRAD_SAMPLES;
        const sx = frac * W;

        let totalR = 0, totalG = 0, totalB = 0, totalWeight = 0;
        for (let j = 0; j < 3; j++) {
          const dx = sx - bodies[j].x;
          const dy = ly - bodies[j].y;
          // Fix #4: squared distance falloff, no sqrt
          const dist2 = dx * dx + dy * dy;
          const t = dist2 / R2;
          const weight = t < 1 ? (1 - t) * (1 - t) : 0;
          totalR += spotColors[j][0] * weight;
          totalG += spotColors[j][1] * weight;
          totalB += spotColors[j][2] * weight;
          totalWeight += weight;
        }

        const pct = Math.round(frac * 100);
        if (totalWeight > COLOR_THRESHOLD) {
          const r = Math.round(totalR / totalWeight);
          const g = Math.round(totalG / totalWeight);
          const b = Math.round(totalB / totalWeight);
          const a = Math.min(BASE_OPACITY + totalWeight * OPACITY_BOOST, MAX_OPACITY);
          grad += `rgba(${r},${g},${b},${a}) ${pct}%`;
        } else {
          grad += `rgba(166,173,200,${BASE_OPACITY}) ${pct}%`;
        }
      }
      grad += ')';

      // Fix #2: constant styles set via class, only dynamic ones per frame
      if (!el.classList.contains('spotlit')) el.classList.add('spotlit');
      el.style.backgroundImage = grad;
      el.style.backgroundSize = `${W}px 100%`;
      el.style.backgroundPosition = `${-line.x}px 0`;
    }
  }

  // --- Render loop ---

  let lastCacheKey = '';
  let lastFrame = 0;
  const DT = 33;

  function render(now: number) {
    rafId = requestAnimationFrame(render);

    if (now - lastFrame < DT) return;
    lastFrame = now;

    // Use cached termRef, compute rect once per frame (Fix #1)
    const termRect = termRef ? termRef.getBoundingClientRect() : null;

    stepBodies(termRect);

    if (!prepared) return;

    const curW = window.innerWidth;
    const curH = window.innerHeight;

    const termKey = termRect
      ? `${Math.round(termRect.left)},${Math.round(termRect.top)},${Math.round(termRect.width)},${Math.round(termRect.height)}`
      : 'none';
    const cacheKey = `${curW}x${curH}|${termKey}`;

    if (cacheKey !== lastCacheKey) {
      lastCacheKey = cacheKey;
      W = curW; H = curH; cx = W / 2; cy = H / 2;
      const allLines = layoutAllLines(prepared, W, H, termRect);

      const prev = committed;
      const changed = !prev || prev.length !== allLines.length ||
        allLines.some((l, idx) => {
          const p = prev![idx];
          return !p || p.x !== l.x || p.y !== l.y || l.text !== p.text;
        });

      if (changed) commitLines(allLines);
    }

    updateLineColors();
  }

  // --- Resize (Fix #8: just set dirty, render handles state) ---

  const onResize = () => {
    if (window.innerWidth <= 768) cancelAnimationFrame(rafId);
  };
  window.addEventListener('resize', onResize);

  // --- Init ---

  const cacheBuster = import.meta.env.DEV ? `?_t=${Date.now()}` : '';
  const res = await fetch(`/content-index.json${cacheBuster}`);
  const data = await res.json();
  const text = (data.backgroundText || '').slice(0, MAX_CHARS);
  if (text.length < 50) {
    // Cleanup if we bail out
    themeObserver.disconnect();
    window.removeEventListener('resize', onResize);
    return () => {};
  }

  await document.fonts.ready;
  prepared = prepareWithSegments(text, font);

  rafId = requestAnimationFrame(render);

  // Fix #4: return cleanup function
  return () => {
    cancelAnimationFrame(rafId);
    themeObserver.disconnect();
    window.removeEventListener('resize', onResize);
    stage.remove();
  };
}
