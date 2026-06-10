// ============================================================
// Background - Text flowing around the terminal window
// Uses @chenglou/pretext for text layout. Pure DOM, no framework.
// Optimized: only re-layouts when terminal position changes.
// Three-body spotlight: three stable moving light centers tint text
// with blue/mauve/green via per-pixel CSS gradients.
// Colors only appear on text, never on the background.
// ============================================================

interface SpotBody { x: number; y: number }

export async function initBackground(): Promise<() => void> {
  if (window.innerWidth <= 768) return () => {};
  if (document.querySelector('.bg-stage')) return () => {};

  const prefersReducedMotion = typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const hardwareConcurrency = navigator.hardwareConcurrency || 8;
  const lowPowerDevice = !prefersReducedMotion &&
    (hardwareConcurrency <= 4 || (typeof deviceMemory === 'number' && deviceMemory <= 4));
  const perfMode = prefersReducedMotion ? 'static' : lowPowerDevice ? 'lite' : 'full';

  const { prepareWithSegments, layoutNextLine } = await import('@chenglou/pretext');

  const FONT_SIZE = 14;
  const LINE_HEIGHT = 26;
  const GUTTER = 24;
  const PAD = 16;
  const MIN_SLOT_WIDTH = 60;
  const MAX_CHARS = perfMode === 'full' ? 8000 : perfMode === 'lite' ? 4200 : 2600;

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

  // --- Three-body spotlight choreography ---

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

  let W = window.innerWidth;
  let H = window.innerHeight;
  let cx = W / 2, cy = H / 2;
  const TAU = Math.PI * 2;

  const bodies: SpotBody[] = [0, 1, 2].map(() => ({ x: cx, y: cy }));

  let termRef: HTMLElement | null = null;
  let cachedTermRect: DOMRect | null = null;
  let cachedTermKey = 'none';
  let geometryDirty = true;
  let lastRectCheck = 0;
  let trackTermUntil = performance.now() + 1500;

  function getTerminalElement(): HTMLElement | null {
    if (!termRef || !termRef.isConnected) {
      termRef = document.querySelector<HTMLElement>('.terminal-window');
    }
    return termRef;
  }

  function getTerminalRect(): DOMRect | null {
    const el = getTerminalElement();
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function rectKey(rect: DOMRect | null): string {
    return rect
      ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`
      : 'none';
  }

  async function waitForStableTerminalRect(): Promise<DOMRect | null> {
    let previous = '';
    let stableFrames = 0;

    for (let i = 0; i < 12; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const rect = getTerminalRect();
      const key = rectKey(rect);
      stableFrames = key === previous && rect ? stableFrames + 1 : 0;
      previous = key;
      if (stableFrames >= 2) return rect;
    }

    return getTerminalRect();
  }

  function refreshTerminalRect(force = false, now = performance.now()): DOMRect | null {
    if (!force && now - lastRectCheck < 240) return cachedTermRect;
    lastRectCheck = now;

    const rect = getTerminalRect();
    const key = rectKey(rect);
    if (key !== cachedTermKey) {
      cachedTermRect = rect;
      cachedTermKey = key;
      geometryDirty = true;
    }
    return cachedTermRect;
  }

  function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
  }

  function bendAroundTerminal(body: SpotBody, termRect: DOMRect | null): SpotBody {
    if (!termRect) return body;

    const pad = 80;
    const left = termRect.left - pad;
    const right = termRect.right + pad;
    const top = termRect.top - pad;
    const bottom = termRect.bottom + pad;
    if (body.x < left || body.x > right || body.y < top || body.y > bottom) {
      return body;
    }

    const dl = body.x - left;
    const dr = right - body.x;
    const dt = body.y - top;
    const db = bottom - body.y;
    const minD = Math.min(dl, dr, dt, db);

    if (minD === dl) return { x: left, y: body.y };
    if (minD === dr) return { x: right, y: body.y };
    if (minD === dt) return { x: body.x, y: top };
    return { x: body.x, y: bottom };
  }

  function stepBodies(now: number, termRect: DOMRect | null) {
    const t = now * 0.00018;
    const radiusX = clamp(W * 0.34, 260, 620);
    const radiusY = clamp(H * 0.36, 190, 360);
    const braid = clamp(Math.min(W, H) * 0.12, 80, 150);
    const margin = 36;

    for (let i = 0; i < 3; i++) {
      const phase = t + i * TAU / 3;
      const body = {
        x: cx + Math.sin(phase) * radiusX + Math.sin(phase * 2.0 + i * 0.7) * braid,
        y: cy + Math.sin(phase) * Math.cos(phase) * radiusY + Math.cos(phase * 1.5 + i * 1.2) * braid * 0.55,
      };
      const bent = bendAroundTerminal(body, termRect);
      bodies[i].x = clamp(bent.x, margin, W - margin);
      bodies[i].y = clamp(bent.y, margin, H - margin);
    }
  }

  // --- DOM setup ---

  const stage = document.createElement('div');
  stage.className = 'bg-stage';
  stage.dataset.perfMode = perfMode;
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

  const BASE_OPACITY = 0.055;
  const MAX_OPACITY = 0.86;
  const OPACITY_BOOST = 0.76;
  const COLOR_THRESHOLD = 0.003;
  const GRAD_SAMPLES = perfMode === 'lite' ? 8 : 12;

  function updateLineColors() {
    if (!committed) return;
    const R = clamp(Math.min(W, H) * 0.2, 160, 280);
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
          const u = dist2 / R2;
          const falloff = 1 - u;
          const weight = u < 1 ? falloff * falloff : 0;
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
  const DT = perfMode === 'static' ? 250 : perfMode === 'lite' ? 66 : 33;

  function render(now: number) {
    rafId = requestAnimationFrame(render);

    if (now - lastFrame < DT) return;
    lastFrame = now;

    const shouldTrackTerminal = geometryDirty || now < trackTermUntil || now - lastRectCheck > 240;
    const termRect = shouldTrackTerminal ? refreshTerminalRect(true, now) : cachedTermRect;

    if (perfMode !== 'static') {
      stepBodies(now, termRect);
    }

    if (!prepared) return;

    const curW = window.innerWidth;
    const curH = window.innerHeight;
    if (curW !== W || curH !== H) {
      W = curW;
      H = curH;
      cx = W / 2;
      cy = H / 2;
      geometryDirty = true;
    }

    const cacheKey = `${curW}x${curH}|${cachedTermKey}`;

    if (geometryDirty || cacheKey !== lastCacheKey) {
      lastCacheKey = cacheKey;
      geometryDirty = false;
      const allLines = layoutAllLines(prepared, W, H, termRect);

      const prev = committed;
      const changed = !prev || prev.length !== allLines.length ||
        allLines.some((l, idx) => {
          const p = prev![idx];
          return !p || p.x !== l.x || p.y !== l.y || l.text !== p.text;
        });

      if (changed) commitLines(allLines);
    }

    if (perfMode !== 'static') {
      updateLineColors();
    }
  }

  // --- Resize (Fix #8: just set dirty, render handles state) ---

  const onResize = () => {
    if (window.innerWidth <= 768) cancelAnimationFrame(rafId);
    geometryDirty = true;
    trackTermUntil = performance.now() + 500;
  };
  window.addEventListener('resize', onResize);

  const onMouseMove = (event: MouseEvent) => {
    if (event.buttons) trackTermUntil = performance.now() + 150;
  };
  const onMouseUp = () => {
    geometryDirty = true;
    trackTermUntil = performance.now() + 300;
  };
  window.addEventListener('mousemove', onMouseMove, { capture: true });
  window.addEventListener('mouseup', onMouseUp, { capture: true });

  // --- Init ---

  const cacheBuster = import.meta.env.DEV ? `?_t=${Date.now()}` : '';
  const res = await fetch(`/content-index.json${cacheBuster}`);
  const data = await res.json();
  const text = (data.backgroundText || '').slice(0, MAX_CHARS);
  if (text.length < 50) {
    // Cleanup if we bail out
    themeObserver.disconnect();
    window.removeEventListener('resize', onResize);
    stage.remove();
    return () => {};
  }

  await document.fonts.ready;
  prepared = prepareWithSegments(text, font);

  const initialTermRect = await waitForStableTerminalRect();
  cachedTermRect = initialTermRect;
  cachedTermKey = rectKey(initialTermRect);
  lastRectCheck = performance.now();
  commitLines(layoutAllLines(prepared, W, H, initialTermRect));
  lastCacheKey = `${W}x${H}|${cachedTermKey}`;
  geometryDirty = false;

  rafId = requestAnimationFrame(render);

  // Fix #4: return cleanup function
  return () => {
    cancelAnimationFrame(rafId);
    themeObserver.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('mousemove', onMouseMove, { capture: true });
    window.removeEventListener('mouseup', onMouseUp, { capture: true });
    stage.remove();
  };
}
