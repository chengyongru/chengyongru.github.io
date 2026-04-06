// ============================================================
// Background - Text flowing around the terminal window
// Uses @chenglou/pretext for text layout. Pure DOM, no framework.
// Optimized: only re-layouts when terminal position changes.
// ============================================================

export async function initBackground(): Promise<void> {
  if (window.innerWidth <= 768) return;
  if (document.querySelector('.bg-stage')) return; // already init'd

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

  /** Layout all lines for current viewport + terminal position */
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
          cursor = { segmentIndex: 0, graphemeIndex: 0 }; // loop
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

  // --- DOM setup ---

  const stage = document.createElement('div');
  stage.className = 'bg-stage';
  document.body.prepend(stage);

  let prepared: Awaited<ReturnType<typeof prepareWithSegments>> | null = null;
  let linePool: HTMLSpanElement[] = [];
  let committed: { x: number; y: number; text: string }[] | null = null;
  let rafId = 0;

  const font = `${FONT_SIZE}px "JetBrains Mono", monospace`;

  function syncPool(pool: HTMLSpanElement[], count: number) {
    while (pool.length < count) {
      const el = document.createElement('span');
      el.className = 'bg-line';
      stage.appendChild(el);
      pool.push(el);
    }
    for (let i = 0; i < pool.length; i++) {
      pool[i].style.display = i < count ? '' : 'none';
    }
  }

  function commitLines(allLines: { x: number; y: number; text: string }[]) {
    syncPool(linePool, allLines.length);
    for (let i = 0; i < allLines.length; i++) {
      const el = linePool[i], l = allLines[i];
      el.textContent = l.text;
      el.style.left = `${l.x}px`;
      el.style.top = `${l.y}px`;
    }
    committed = allLines;
  }

  // --- Render loop with dirty-checking ---

  // Cache key: terminal rect string + viewport size
  let lastCacheKey = '';

  function render(_now: number) {
    if (!prepared) { rafId = requestAnimationFrame(render); return; }

    const W = window.innerWidth;
    const H = window.innerHeight;
    const termEl = document.querySelector('.terminal-window');
    const termRect = termEl ? termEl.getBoundingClientRect() : null;

    // Dirty check: only re-layout if terminal moved or viewport resized
    const termKey = termRect
      ? `${Math.round(termRect.left)},${Math.round(termRect.top)},${Math.round(termRect.width)},${Math.round(termRect.height)}`
      : 'none';
    const cacheKey = `${W}x${H}|${termKey}`;

    if (cacheKey !== lastCacheKey) {
      lastCacheKey = cacheKey;
      const allLines = layoutAllLines(prepared, W, H, termRect);

      // Diff against committed to avoid unnecessary DOM writes
      const prev = committed;
      const changed = !prev || prev.length !== allLines.length ||
        allLines.some((l, i) => {
          const p = prev![i];
          return !p || p.x !== l.x || p.y !== l.y || p.text !== l.text;
        });

      if (changed) commitLines(allLines);
    }

    rafId = requestAnimationFrame(render);
  }

  // --- Init ---

  window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) cancelAnimationFrame(rafId);
  });

  const cacheBuster = import.meta.env.DEV ? `?_t=${Date.now()}` : '';
  const res = await fetch(`/content-index.json${cacheBuster}`);
  const data = await res.json();
  const text = (data.backgroundText || '').slice(0, MAX_CHARS);
  if (text.length < 50) return;

  await document.fonts.ready;
  prepared = prepareWithSegments(text, font);

  rafId = requestAnimationFrame(render);
}
