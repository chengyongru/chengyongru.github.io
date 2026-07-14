// ============================================================
// Background - Pretext layout rendered through one canvas.
// Pretext handles multilingual line breaking; canvas keeps terminal
// avoidance and the three-body spotlight off the DOM hot path.
// ============================================================

import {
  TERMINAL_GEOMETRY_EVENT,
  type TerminalGeometry,
} from "../terminal/geometry";

interface SpotBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface PositionedLine {
  x: number;
  y: number;
  text: string;
}

type RGB = [number, number, number];

export async function initBackground(): Promise<() => void> {
  if (window.innerWidth <= 768) return () => {};
  if (document.querySelector(".bg-stage")) return () => {};

  const FONT_SIZE = 14;
  const LINE_HEIGHT = 26;
  const TEXT_TOP_OFFSET = 3;
  const GUTTER = 24;
  const PAD = 18;
  const WRAP_CORNER_RADIUS = 200;
  const CUTOUT_FEATHER = 20;
  const MIN_SLOT_WIDTH = 60;
  const MAX_CHARS = 8000;
  const SPOTLIGHT_FPS = 30;
  const SPOTLIGHT_FRAME_MS = 1000 / SPOTLIGHT_FPS;
  const REDUCED_MOTION_FPS = 20;
  const REDUCED_MOTION_FRAME_MS = 1000 / REDUCED_MOTION_FPS;
  const REDUCED_MOTION_SCALE = 0.55;
  const MOTION_SPEED_MULTIPLIER = 2;
  const INTERACTIVE_LAYOUT_MS = 50;
  const MAX_RENDER_SCALE = 1.25;
  const BASE_OPACITY = 0.11;
  const SPOT_COLOR_STRENGTH = 0.58;
  const font = `${FONT_SIZE}px "JetBrains Mono", monospace`;

  let pretext: typeof import("@chenglou/pretext");
  let backgroundText = "";

  try {
    const cacheBuster = import.meta.env.DEV ? `?_t=${Date.now()}` : "";
    const [module, response] = await Promise.all([
      import("@chenglou/pretext"),
      fetch(`/content-index.json${cacheBuster}`),
      document.fonts.ready,
    ]);
    if (!response.ok) return () => {};

    const data = await response.json();
    pretext = module;
    backgroundText =
      typeof data.backgroundText === "string"
        ? data.backgroundText.slice(0, MAX_CHARS)
        : "";
  } catch {
    return () => {};
  }

  if (backgroundText.length < 50) return () => {};
  if (document.querySelector(".bg-stage")) return () => {};

  const prepared = pretext.prepareWithSegments(backgroundText, font);
  const stage = document.createElement("canvas");
  stage.className = "bg-stage";
  stage.setAttribute("aria-hidden", "true");
  document.body.prepend(stage);

  const maskCanvas = document.createElement("canvas");
  const maybeContext = stage.getContext("2d", { alpha: true });
  const maybeMaskContext = maskCanvas.getContext("2d", { alpha: true });

  if (!maybeContext || !maybeMaskContext) {
    stage.remove();
    return () => {};
  }
  const context = maybeContext;
  const maskContext = maybeMaskContext;

  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;
  let centerX = viewportWidth / 2;
  let centerY = viewportHeight / 2;
  let renderScale = 1;
  let terminalGeometry: TerminalGeometry | null = null;
  let geometryDirty = true;
  let surfaceDirty = true;
  let sceneDirty = true;
  let destroyed = false;
  let desktopActive = true;
  let rafId = 0;
  let lastLayoutAt = -Infinity;
  let lastSimulationAt = 0;
  let lastPaintAt = 0;

  function readTerminalGeometry(): TerminalGeometry | null {
    const element = document.querySelector<HTMLElement>(".terminal-window");
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      interacting: false,
    };
  }

  function rectIntervalForBand(
    rect: TerminalGeometry,
    bandTop: number,
    bandBottom: number,
  ): { left: number; right: number } | null {
    const left = rect.left - PAD;
    const right = rect.left + rect.width + PAD;
    const top = rect.top - PAD;
    const bottom = rect.top + rect.height + PAD;
    if (bandBottom <= top || bandTop >= bottom) return null;

    const radius = Math.min(
      WRAP_CORNER_RADIUS,
      (right - left) / 2,
      (bottom - top) / 2,
    );
    let inset = 0;

    // Use the widest part touched by this text band. Consecutive lines then
    // follow the terminal as a rounded envelope instead of snapping to a box.
    if (bandBottom < top + radius) {
      const distanceFromCenter = top + radius - Math.max(top, bandBottom);
      inset =
        radius -
        Math.sqrt(
          Math.max(
            0,
            radius * radius - distanceFromCenter * distanceFromCenter,
          ),
        );
    } else if (bandTop > bottom - radius) {
      const distanceFromCenter = Math.min(bottom, bandTop) - (bottom - radius);
      inset =
        radius -
        Math.sqrt(
          Math.max(
            0,
            radius * radius - distanceFromCenter * distanceFromCenter,
          ),
        );
    }

    return { left: left + inset, right: right - inset };
  }

  function addRoundedRectPath(
    target: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    target.beginPath();
    target.moveTo(left + safeRadius, top);
    target.lineTo(left + width - safeRadius, top);
    target.quadraticCurveTo(left + width, top, left + width, top + safeRadius);
    target.lineTo(left + width, top + height - safeRadius);
    target.quadraticCurveTo(
      left + width,
      top + height,
      left + width - safeRadius,
      top + height,
    );
    target.lineTo(left + safeRadius, top + height);
    target.quadraticCurveTo(
      left,
      top + height,
      left,
      top + height - safeRadius,
    );
    target.lineTo(left, top + safeRadius);
    target.quadraticCurveTo(left, top, left + safeRadius, top);
    target.closePath();
  }

  function carveSlots(
    base: { left: number; right: number },
    blocked: { left: number; right: number } | null,
  ): { left: number; right: number }[] {
    if (!blocked || blocked.right <= base.left || blocked.left >= base.right) {
      return [base];
    }

    const slots: { left: number; right: number }[] = [];
    if (blocked.left - base.left >= MIN_SLOT_WIDTH) {
      slots.push({
        left: base.left,
        right: Math.min(blocked.left, base.right),
      });
    }
    if (base.right - blocked.right >= MIN_SLOT_WIDTH) {
      slots.push({
        left: Math.max(blocked.right, base.left),
        right: base.right,
      });
    }
    return slots;
  }

  function layoutAllLines(rect: TerminalGeometry | null): PositionedLine[] {
    const base = { left: GUTTER, right: viewportWidth - GUTTER };
    const lines: PositionedLine[] = [];
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };

    for (
      let lineTop = GUTTER;
      lineTop + LINE_HEIGHT <= viewportHeight - GUTTER / 2;
      lineTop += LINE_HEIGHT
    ) {
      const blocked = rect
        ? rectIntervalForBand(rect, lineTop, lineTop + LINE_HEIGHT)
        : null;
      const slots = carveSlots(base, blocked);

      for (const slot of slots) {
        const slotWidth = Math.round(slot.right - slot.left);
        let line = pretext.layoutNextLine(prepared, cursor, slotWidth);
        if (line === null) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 };
          line = pretext.layoutNextLine(prepared, cursor, slotWidth);
        }
        if (line === null) continue;

        lines.push({
          x: Math.round(slot.left),
          y: Math.round(lineTop),
          text: line.text,
        });
        cursor = line.end;
      }
    }

    return lines;
  }

  function paintTextMask(lines: PositionedLine[]): void {
    maskContext.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    maskContext.clearRect(0, 0, viewportWidth, viewportHeight);
    maskContext.font = font;
    maskContext.textBaseline = "top";
    maskContext.fillStyle = "#fff";

    for (const line of lines) {
      maskContext.fillText(line.text, line.x, line.y + TEXT_TOP_OFFSET);
    }
  }

  function parseThemeColor(value: string, fallback: RGB): RGB {
    const hex = value.trim();
    const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(hex);
    if (short) {
      return short.slice(1).map((part) => parseInt(part + part, 16)) as RGB;
    }
    const full = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    if (full) {
      return full.slice(1).map((part) => parseInt(part, 16)) as RGB;
    }
    return fallback;
  }

  function rgba(color: RGB, alpha: number): string {
    return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
  }

  function blendColor(foreground: RGB, background: RGB, strength: number): RGB {
    return foreground.map((channel, index) =>
      Math.round(channel * strength + background[index] * (1 - strength)),
    ) as RGB;
  }

  function readThemeColors(): { base: RGB; spots: [RGB, RGB, RGB] } {
    const styles = getComputedStyle(document.documentElement);
    const base = parseThemeColor(
      styles.getPropertyValue("--subtext"),
      [166, 173, 200],
    );
    const spots: [RGB, RGB, RGB] = [
      parseThemeColor(styles.getPropertyValue("--blue"), [137, 180, 250]),
      parseThemeColor(styles.getPropertyValue("--mauve"), [203, 166, 247]),
      parseThemeColor(styles.getPropertyValue("--green"), [166, 227, 161]),
    ];
    return {
      base,
      spots: spots.map((color) =>
        blendColor(color, base, SPOT_COLOR_STRENGTH),
      ) as [RGB, RGB, RGB],
    };
  }

  let themeColors = readThemeColors();
  const spread = Math.min(viewportWidth, viewportHeight) * 0.25;
  const orbitVelocity = 1.8;
  const bodies: SpotBody[] = [0, 1, 2].map((index) => {
    const angle = -Math.PI / 2 + index * 2.094;
    return {
      x: centerX + Math.cos(angle) * spread,
      y: centerY + Math.sin(angle) * spread,
      vx: Math.cos(angle + Math.PI / 2) * orbitVelocity,
      vy: Math.sin(angle + Math.PI / 2) * orbitVelocity,
    };
  });

  const accelerationX = new Float64Array(3);
  const accelerationY = new Float64Array(3);
  const GRAVITY = 800;
  const SOFTENING_SQUARED = 80 * 80;
  const MAX_VELOCITY = 4;
  const VIEWPORT_BUFFER = 40;
  const SPOTLIGHT_CORE_RATIO = 0.46;
  const MIN_EDGE_VELOCITY = 1.35;

  function spotlightRadius(): number {
    return Math.max(190, Math.min(viewportWidth, viewportHeight) * 0.235);
  }

  function resolveTerminalCollision(body: SpotBody): void {
    if (!terminalGeometry) return;

    const terminalRight = terminalGeometry.left + terminalGeometry.width;
    const terminalBottom = terminalGeometry.top + terminalGeometry.height;
    const largestCorridor = Math.max(
      terminalGeometry.left - VIEWPORT_BUFFER,
      viewportWidth - VIEWPORT_BUFFER - terminalRight,
      terminalGeometry.top - VIEWPORT_BUFFER,
      viewportHeight - VIEWPORT_BUFFER - terminalBottom,
    );
    const clearance = Math.min(
      spotlightRadius() * SPOTLIGHT_CORE_RATIO + PAD,
      Math.max(32, largestCorridor - 8),
    );
    const left = terminalGeometry.left - clearance;
    const right = terminalRight + clearance;
    const top = terminalGeometry.top - clearance;
    const bottom = terminalBottom + clearance;
    const radius = Math.min(
      WRAP_CORNER_RADIUS + clearance * 0.35,
      (right - left) / 2,
      (bottom - top) / 2,
    );

    const cornerCenterX = Math.min(
      right - radius,
      Math.max(left + radius, body.x),
    );
    const cornerCenterY = Math.min(
      bottom - radius,
      Math.max(top + radius, body.y),
    );
    const dx = body.x - cornerCenterX;
    const dy = body.y - cornerCenterY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= radius * radius) return;

    let targetX = body.x;
    let targetY = body.y;
    let normalX = 0;
    let normalY = 0;

    if (distanceSquared > 0.0001) {
      const distance = Math.sqrt(distanceSquared);
      normalX = dx / distance;
      normalY = dy / distance;
      targetX = cornerCenterX + normalX * (radius + 1);
      targetY = cornerCenterY + normalY * (radius + 1);
    }

    const radialExitIsVisible =
      distanceSquared > 0.0001 &&
      targetX >= VIEWPORT_BUFFER &&
      targetX <= viewportWidth - VIEWPORT_BUFFER &&
      targetY >= VIEWPORT_BUFFER &&
      targetY <= viewportHeight - VIEWPORT_BUFFER;

    if (!radialExitIsVisible) {
      const exits = [
        {
          distance: body.x - left,
          x: left - 1,
          y: body.y,
          nx: -1,
          ny: 0,
          available: left >= VIEWPORT_BUFFER,
        },
        {
          distance: right - body.x,
          x: right + 1,
          y: body.y,
          nx: 1,
          ny: 0,
          available: right <= viewportWidth - VIEWPORT_BUFFER,
        },
        {
          distance: body.y - top,
          x: body.x,
          y: top - 1,
          nx: 0,
          ny: -1,
          available: top >= VIEWPORT_BUFFER,
        },
        {
          distance: bottom - body.y,
          x: body.x,
          y: bottom + 1,
          nx: 0,
          ny: 1,
          available: bottom <= viewportHeight - VIEWPORT_BUFFER,
        },
      ];
      let nearestExit: (typeof exits)[number] | null = null;
      for (const exit of exits) {
        if (
          exit.available &&
          exit.distance >= 0 &&
          (!nearestExit || exit.distance < nearestExit.distance)
        ) {
          nearestExit = exit;
        }
      }
      if (!nearestExit) return;
      targetX = nearestExit.x;
      targetY = nearestExit.y;
      normalX = nearestExit.nx;
      normalY = nearestExit.ny;
    }

    body.x = targetX;
    body.y = targetY;

    // Reflect only the inward component. Tangential velocity survives, so a
    // spotlight glances around the rounded terminal instead of sticking to it.
    const inwardVelocity = body.vx * normalX + body.vy * normalY;
    if (inwardVelocity < 0) {
      const impulse = inwardVelocity * 1.45;
      body.vx -= impulse * normalX;
      body.vy -= impulse * normalY;
    }

    // Keep a visible clockwise drift around the obstacle. Gravity still
    // perturbs the paths, but no body can lose all motion against a flat edge.
    const tangentX = -normalY;
    const tangentY = normalX;
    const tangentVelocity = body.vx * tangentX + body.vy * tangentY;
    if (tangentVelocity < MIN_EDGE_VELOCITY) {
      const boost = MIN_EDGE_VELOCITY - tangentVelocity;
      body.vx += tangentX * boost;
      body.vy += tangentY * boost;
    }
  }

  function resolveAllTerminalCollisions(): void {
    for (const body of bodies) resolveTerminalCollision(body);
  }

  function stepBodies(frameScale: number): void {
    accelerationX.fill(0);
    accelerationY.fill(0);

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const dx = bodies[j].x - bodies[i].x;
        const dy = bodies[j].y - bodies[i].y;
        const distanceSquared = dx * dx + dy * dy + SOFTENING_SQUARED;
        const distance = Math.sqrt(distanceSquared);
        const force = GRAVITY / distanceSquared;
        const forceX = (force * dx) / distance;
        const forceY = (force * dy) / distance;
        accelerationX[i] += forceX;
        accelerationY[i] += forceY;
        accelerationX[j] -= forceX;
        accelerationY[j] -= forceY;
      }
    }

    for (let index = 0; index < bodies.length; index++) {
      const body = bodies[index];
      body.vx += accelerationX[index] * frameScale;
      body.vy += accelerationY[index] * frameScale;
      body.vx += (centerX - body.x) * 1e-5 * frameScale;
      body.vy += (centerY - body.y) * 1e-5 * frameScale;

      const speed = Math.hypot(body.vx, body.vy);
      if (speed > MAX_VELOCITY) {
        body.vx *= MAX_VELOCITY / speed;
        body.vy *= MAX_VELOCITY / speed;
      }

      body.x += body.vx * frameScale;
      body.y += body.vy * frameScale;

      if (body.x < VIEWPORT_BUFFER) {
        body.x = VIEWPORT_BUFFER;
        body.vx = Math.abs(body.vx) * 0.5;
      } else if (body.x > viewportWidth - VIEWPORT_BUFFER) {
        body.x = viewportWidth - VIEWPORT_BUFFER;
        body.vx = -Math.abs(body.vx) * 0.5;
      }
      if (body.y < VIEWPORT_BUFFER) {
        body.y = VIEWPORT_BUFFER;
        body.vy = Math.abs(body.vy) * 0.5;
      } else if (body.y > viewportHeight - VIEWPORT_BUFFER) {
        body.y = viewportHeight - VIEWPORT_BUFFER;
        body.vy = -Math.abs(body.vy) * 0.5;
      }
      resolveTerminalCollision(body);
    }
  }

  function paintScene(): void {
    context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.fillStyle = rgba(themeColors.base, BASE_OPACITY);
    context.fillRect(0, 0, viewportWidth, viewportHeight);

    const radius = spotlightRadius();
    for (let index = 0; index < bodies.length; index++) {
      const body = bodies[index];
      const color = themeColors.spots[index];
      const radiusX = Math.max(
        1,
        Math.min(radius, body.x, viewportWidth - body.x),
      );
      const radiusY = Math.max(
        1,
        Math.min(radius, body.y, viewportHeight - body.y),
      );

      context.save();
      context.translate(body.x, body.y);
      context.scale(radiusX / radius, radiusY / radius);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, rgba(color, 0.68));
      gradient.addColorStop(0.2, rgba(color, 0.62));
      gradient.addColorStop(0.5, rgba(color, 0.36));
      gradient.addColorStop(0.8, rgba(color, 0.1));
      gradient.addColorStop(1, rgba(color, 0));
      context.fillStyle = gradient;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    }
    context.globalCompositeOperation = "destination-in";
    context.drawImage(
      maskCanvas,
      0,
      0,
      maskCanvas.width,
      maskCanvas.height,
      0,
      0,
      viewportWidth,
      viewportHeight,
    );
    // The exact cutout updates every interaction frame. Its broad rounded edge
    // matches the Pretext envelope, while two cheap alpha strokes avoid a hard
    // cut without paying for a canvas blur on every animation frame.
    if (terminalGeometry) {
      const left = terminalGeometry.left - PAD;
      const top = terminalGeometry.top - PAD;
      const width = terminalGeometry.width + PAD * 2;
      const height = terminalGeometry.height + PAD * 2;
      const radius = Math.min(WRAP_CORNER_RADIUS, width / 2, height / 2);

      context.save();
      context.globalCompositeOperation = "destination-out";
      context.strokeStyle = "#000";
      context.fillStyle = "#000";
      addRoundedRectPath(context, left, top, width, height, radius);
      context.globalAlpha = 0.12;
      context.lineWidth = CUTOUT_FEATHER * 2;
      context.stroke();
      context.globalAlpha = 0.32;
      context.lineWidth = CUTOUT_FEATHER;
      context.stroke();
      context.globalAlpha = 1;
      context.fill();
      context.restore();
    }
  }

  function resizeSurface(): void {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    centerX = viewportWidth / 2;
    centerY = viewportHeight / 2;
    renderScale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);

    const pixelWidth = Math.max(1, Math.round(viewportWidth * renderScale));
    const pixelHeight = Math.max(1, Math.round(viewportHeight * renderScale));
    stage.width = pixelWidth;
    stage.height = pixelHeight;
    maskCanvas.width = pixelWidth;
    maskCanvas.height = pixelHeight;

    terminalGeometry = readTerminalGeometry();
    resolveAllTerminalCollisions();
    geometryDirty = true;
    sceneDirty = true;
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function scheduleFrame(): void {
    if (destroyed || !desktopActive || rafId !== 0) return;
    rafId = requestAnimationFrame(render);
  }

  function render(now: number): void {
    rafId = 0;
    if (destroyed || !desktopActive) return;

    if (surfaceDirty) {
      surfaceDirty = false;
      resizeSurface();
    }

    const canReflow =
      geometryDirty &&
      (!terminalGeometry?.interacting ||
        now - lastLayoutAt >= INTERACTIVE_LAYOUT_MS);
    if (canReflow) {
      paintTextMask(layoutAllLines(terminalGeometry));
      geometryDirty = false;
      sceneDirty = true;
      lastLayoutAt = now;
    }

    const spotlightFrameMs = reducedMotion
      ? REDUCED_MOTION_FRAME_MS
      : SPOTLIGHT_FRAME_MS;
    const motionScale = reducedMotion ? REDUCED_MOTION_SCALE : 1;

    if (lastSimulationAt === 0 || now - lastSimulationAt >= spotlightFrameMs) {
      const frameScale =
        lastSimulationAt === 0
          ? 1
          : Math.min(
              2,
              Math.max(0.5, (now - lastSimulationAt) / SPOTLIGHT_FRAME_MS),
            );
      stepBodies(frameScale * motionScale * MOTION_SPEED_MULTIPLIER);
      lastSimulationAt = now;
      sceneDirty = true;
    }

    const canPaint =
      sceneDirty &&
      (!terminalGeometry?.interacting ||
        lastPaintAt === 0 ||
        now - lastPaintAt >= spotlightFrameMs);
    if (canPaint) {
      paintScene();
      sceneDirty = false;
      lastPaintAt = now;
    }

    scheduleFrame();
  }

  function onTerminalGeometry(event: Event): void {
    const next = (event as CustomEvent<TerminalGeometry>).detail;
    if (
      !next ||
      !Number.isFinite(next.left) ||
      !Number.isFinite(next.top) ||
      !Number.isFinite(next.width) ||
      !Number.isFinite(next.height)
    ) {
      return;
    }

    terminalGeometry = next;
    resolveAllTerminalCollisions();
    geometryDirty = true;
    sceneDirty = true;
    scheduleFrame();
  }

  function onResize(): void {
    desktopActive = window.innerWidth > 768;
    if (!desktopActive) {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }

    surfaceDirty = true;
    scheduleFrame();
  }

  function onMotionPreferenceChange(): void {
    reducedMotion = motionQuery.matches;
    lastSimulationAt = 0;
    sceneDirty = true;
    scheduleFrame();
  }

  const themeObserver = new MutationObserver(() => {
    themeColors = readThemeColors();
    sceneDirty = true;
    scheduleFrame();
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window.addEventListener(TERMINAL_GEOMETRY_EVENT, onTerminalGeometry);
  window.addEventListener("resize", onResize, { passive: true });
  motionQuery.addEventListener("change", onMotionPreferenceChange);
  scheduleFrame();

  return () => {
    destroyed = true;
    if (rafId !== 0) cancelAnimationFrame(rafId);
    themeObserver.disconnect();
    window.removeEventListener(TERMINAL_GEOMETRY_EVENT, onTerminalGeometry);
    window.removeEventListener("resize", onResize);
    motionQuery.removeEventListener("change", onMotionPreferenceChange);
    stage.remove();
  };
}
