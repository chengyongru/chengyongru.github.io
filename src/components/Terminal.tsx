// ============================================================
// Terminal Component - Preact Island
// Core terminal UI with command input, output, and history
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import ContentViewer from './ContentViewer';
import { executeCommand, getPrompt, getAllCommands } from '../terminal/commands';
import { loadFileSystem, listDir, resolvePath, fetchPostContent, getAllPosts } from '../terminal/file-tree';
import { completeTerminalInput, type TabCycleState } from '../terminal/autocomplete';
import { quoteCommandArg } from '../terminal/command-line';
import { normalizeTheme } from '../terminal/theme';
import { selectHomePosts } from '../terminal/home';
import { emitTerminalGeometry, type TerminalGeometry } from '../terminal/geometry';
import type { FileEntry, PostContent, PostMeta } from '../terminal/types';
import config from '../config';

interface OutputLine {
  html: string;
  isInput?: boolean;
}

interface ViewerWindowState {
  id: number;
  post: PostContent;
  initialPosition: { x: number; y: number };
  initialSize: { w: number; h: number };
  zIndex: number;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date?: string): string {
  return date ? date.split('T')[0] : '';
}

function renderPostRow(post: PostMeta, index: number): string {
  const meta = [
    formatDate(post.date),
    post.reading_time ? `${post.reading_time} min` : '',
    ...post.tags.slice(0, 2),
  ].filter(Boolean).join(' / ');

  return `<div class="welcome-post">
    <span class="welcome-post-index">${String(index + 1).padStart(2, '0')}</span>
    <span class="welcome-post-title clickable-file" data-action="cat" data-slug="${esc(post.slug)}">${esc(post.title)}</span>
    <span class="welcome-post-meta">${esc(meta)}</span>
  </div>`;
}

function renderCommand(label: string, cmd: string): string {
  return `<span class="welcome-command clickable-file" data-action="cmd" data-cmd="${esc(cmd)}">${esc(label)}</span>`;
}

function renderBootLines(): string[] {
  const { featured, recent } = selectHomePosts(getAllPosts(), config.home.featuredSlugs);

  const featuredHtml = featured.length > 0
    ? featured.map(renderPostRow).join('')
    : '<div class="welcome-muted">No published notes yet.</div>';
  const recentHtml = recent.length > 0
    ? recent.map(renderPostRow).join('')
    : '<div class="welcome-muted">Run recent after more notes are published.</div>';

  return [
    `<div class="terminal-welcome">
      <div class="welcome-brand-row">
        <div class="welcome-brand">
          <span style="color:var(--${config.terminal.brandColor})">${esc(config.terminal.brand)}</span><span style="color:var(--surface2)">.</span><span style="color:var(--mauve)">${esc(config.terminal.brandSuffix)}</span>
        </div>
        <a class="welcome-email" href="mailto:${esc(config.terminal.email)}">${esc(config.terminal.email)}</a>
      </div>
      <div class="welcome-tagline">${esc(config.home.tagline)}</div>
      <div class="welcome-grid">
        <section class="welcome-section">
          <div class="welcome-section-title">Featured</div>
          ${featuredHtml}
        </section>
        <section class="welcome-section">
          <div class="welcome-section-title">Recent</div>
          ${recentHtml}
        </section>
      </div>
      <div class="welcome-actions">
        ${renderCommand('about', 'about')}
        ${renderCommand('recent', 'recent')}
        ${renderCommand('ls notebook/', 'ls notebook/')}
        ${renderCommand('grep agent', 'grep agent')}
        ${renderCommand('help', 'help')}
      </div>
    </div>`,
    '',
  ];
}

const MIN_W = 480;
const MIN_H = 360;
const DEFAULT_WIN = { w: 960, h: 600 };
const MAX_LINES = 500;
const WINDOW_Z_BASE = 10;

function getViewerGeometry(sequence: number) {
  const gutter = window.innerWidth <= 768 ? 0 : 20;
  const width = Math.min(900, Math.max(520, window.innerWidth - 120));
  const height = Math.min(800, Math.max(420, window.innerHeight - 96));
  const offset = (sequence % 6) * 24;
  const centeredX = Math.round((window.innerWidth - width) / 2);
  const centeredY = Math.round((window.innerHeight - height) / 2);

  return {
    position: {
      x: Math.min(Math.max(gutter, centeredX + 56 + offset), Math.max(gutter, window.innerWidth - width - gutter)),
      y: Math.min(Math.max(gutter, centeredY + 28 + offset), Math.max(gutter, window.innerHeight - height - gutter)),
    },
    size: { w: width, h: height },
  };
}

function syncBrowserLocation(post: PostContent | null, mode: 'push' | 'replace' = 'push') {
  const state = post ? { slug: post.slug, title: post.title } : null;
  const url = post ? `/blog/${post.slug}/` : '/';
  document.title = post ? `${post.title} | ${config.site.title}` : config.site.title;
  if (mode === 'replace') {
    window.history.replaceState(state, '', url);
  } else if (window.location.pathname !== url) {
    window.history.pushState(state, '', url);
  }
}

export default function Terminal() {
  const [cwd, setCwd] = useState('/');
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cmd-history') || '[]'); } catch { return []; }
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [viewerWindows, setViewerWindows] = useState<ViewerWindowState[]>([]);
  const [ready, setReady] = useState(false);
  const [tabCycle, setTabCycle] = useState<TabCycleState | null>(null);

  // Window management
  const [winPos, setWinPos] = useState({ x: 0, y: 0 });
  const [winSize, setWinSize] = useState({ ...DEFAULT_WIN });
  const [maximized, setMaximized] = useState(false);
  const [mainZIndex, setMainZIndex] = useState(WINDOW_Z_BASE);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    ox: number; oy: number;
    sl: number; st: number;
    w: number; h: number;
  } | null>(null);
  const resizeRef = useRef<{
    sx: number; sy: number;
    sw: number; sh: number;
    sl: number; st: number;
    dir: string;
  } | null>(null);
  const preMaxRef = useRef({ pos: { x: 0, y: 0 }, size: { ...DEFAULT_WIN } });
  const viewerWindowsRef = useRef<ViewerWindowState[]>([]);
  const nextViewerIdRef = useRef(1);
  const zCounterRef = useRef(WINDOW_Z_BASE);

  const createViewerWindow = useCallback((post: PostContent): ViewerWindowState => {
    const id = nextViewerIdRef.current++;
    const geometry = getViewerGeometry(id - 1);
    return {
      id,
      post,
      initialPosition: geometry.position,
      initialSize: geometry.size,
      zIndex: ++zCounterRef.current,
    };
  }, []);

  // Center window on mount
  useEffect(() => {
    setWinPos({
      x: Math.max(20, Math.round((window.innerWidth - DEFAULT_WIN.w) / 2)),
      y: Math.max(20, Math.round((window.innerHeight - DEFAULT_WIN.h) / 2)),
    });
  }, []);

  // Load file system on mount
  useEffect(() => {
    // Restore saved theme
    const savedTheme = localStorage.getItem('theme');
    const theme = normalizeTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', theme);
    if (savedTheme !== theme) {
      localStorage.setItem('theme', theme);
    }

    // Check URL for a blog post to restore
    const initialSlug = (() => {
      const m = window.location.pathname.match(/^\/blog\/(.+?)\/?$/);
      return m ? decodeURIComponent(m[1]) : null;
    })();

    loadFileSystem().then(() => {
      // Check if user prefers reduced motion
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const hasVisited = localStorage.getItem('terminal-booted');

      const bootLines = renderBootLines();

      if (prefersReducedMotion || hasVisited) {
        // Skip animation — show all at once
        setLines(bootLines.map(html => ({ html })));
        setReady(true);
      } else {
        // Typing animation for first visit
        const typedLines: OutputLine[] = [];
        let idx = 0;
        const animate = () => {
          if (idx < bootLines.length) {
            typedLines.push({ html: bootLines[idx] });
            setLines([...typedLines]);
            idx++;
            const delay = 80;
            setTimeout(animate, delay);
          } else {
            localStorage.setItem('terminal-booted', '1');
            setReady(true);
          }
        };
        animate();
      }

      // Restore viewer from URL
      if (initialSlug) {
        fetchPostContent(initialSlug).then(result => {
          if (result) {
            const viewerWindow = createViewerWindow(result);
            viewerWindowsRef.current = [viewerWindow];
            setViewerWindows([viewerWindow]);
            syncBrowserLocation(result, 'replace');
          } else {
            // Invalid slug, redirect to home
            window.history.replaceState(null, '', '/');
          }
        });
      }
    });
  }, [createViewerWindow]);

  // Drag & resize — batch pointer input to one visual update per frame.
  useEffect(() => {
    let moveRaf = 0;
    let pendingPoint: { x: number; y: number } | null = null;
    let lastGeometry: TerminalGeometry | null = null;

    const applyPendingMove = () => {
      moveRaf = 0;
      const point = pendingPoint;
      const el = winRef.current;
      pendingPoint = null;
      if (!point || !el) return;

      if (dragRef.current) {
        const drag = dragRef.current;
        const left = point.x - drag.ox;
        const top = point.y - drag.oy;
        el.style.transform = `translate3d(${left - drag.sl}px, ${top - drag.st}px, 0)`;
        lastGeometry = {
          left,
          top,
          width: drag.w,
          height: drag.h,
          interacting: true,
        };
      } else if (resizeRef.current) {
        const resize = resizeRef.current;
        const dx = point.x - resize.sx;
        const dy = point.y - resize.sy;
        let width = resize.sw, height = resize.sh, left = resize.sl, top = resize.st;
        if (resize.dir.includes('e')) width = Math.max(MIN_W, resize.sw + dx);
        if (resize.dir.includes('s')) height = Math.max(MIN_H, resize.sh + dy);
        if (resize.dir.includes('w')) {
          width = Math.max(MIN_W, resize.sw - dx);
          left = resize.sl + resize.sw - width;
        }
        if (resize.dir.includes('n')) {
          height = Math.max(MIN_H, resize.sh - dy);
          top = resize.st + resize.sh - height;
        }
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        lastGeometry = { left, top, width, height, interacting: true };
      }

      if (lastGeometry) emitTerminalGeometry(lastGeometry);
    };

    const onMove = (e: MouseEvent) => {
      if (!dragRef.current && !resizeRef.current) return;
      pendingPoint = { x: e.clientX, y: e.clientY };
      if (moveRaf === 0) moveRaf = requestAnimationFrame(applyPendingMove);
    };

    const onUp = () => {
      const el = winRef.current;
      const wasDragging = dragRef.current !== null;
      const wasResizing = resizeRef.current !== null;
      if (!el || (!wasDragging && !wasResizing)) return;

      if (moveRaf !== 0) {
        cancelAnimationFrame(moveRaf);
        applyPendingMove();
      }

      const rect = lastGeometry ?? (() => {
        const measured = el.getBoundingClientRect();
        return {
          left: measured.left,
          top: measured.top,
          width: measured.width,
          height: measured.height,
          interacting: false,
        };
      })();

      // Commit transform-based dragging back to left/top before Preact syncs state.
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      el.style.transform = '';
      el.classList.remove('is-interacting');
      setWinPos({ x: rect.left, y: rect.top });
      setWinSize({ w: rect.width, h: rect.height });
      emitTerminalGeometry({ ...rect, interacting: false });

      dragRef.current = null;
      resizeRef.current = null;
      lastGeometry = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      if (moveRaf !== 0) cancelAnimationFrame(moveRaf);
      winRef.current?.classList.remove('is-interacting');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Notify the background after state-driven moves (mount, maximize, restore).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const rect = winRef.current?.getBoundingClientRect();
      if (!rect) return;
      emitTerminalGeometry({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        interacting: false,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [winPos.x, winPos.y, winSize.w, winSize.h, maximized]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (bodyRef.current) {
      const showingBootOutput = lines.length <= 2 && lines.some(line => line.html.includes('terminal-welcome'));
      bodyRef.current.scrollTop = showingBootOutput ? 0 : bodyRef.current.scrollHeight;
    }
  }, [lines, ready]);

  // Focus input on click
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const focusInput = () => inputRef.current?.focus();
    body.addEventListener('click', focusInput);
    return () => body.removeEventListener('click', focusInput);
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const m = window.location.pathname.match(/^\/blog\/(.+?)\/?$/);
      if (m) {
        const slug = decodeURIComponent(m[1]);
        fetchPostContent(slug).then(result => {
          if (result) {
            const existing = viewerWindowsRef.current.find(viewer => viewer.post.slug === slug);
            let next: ViewerWindowState[];
            if (existing) {
              const zIndex = ++zCounterRef.current;
              next = viewerWindowsRef.current.map(viewer => viewer.id === existing.id ? { ...viewer, zIndex } : viewer);
            } else {
              next = [...viewerWindowsRef.current, createViewerWindow(result)];
            }
            viewerWindowsRef.current = next;
            setViewerWindows(next);
            document.title = `${result.title} | ${config.site.title}`;
          }
        });
      } else {
        // Back to home — close article windows
        viewerWindowsRef.current = [];
        setViewerWindows([]);
        document.title = config.site.title;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [createViewerWindow]);

  // --- Window management handlers ---

  const onTitleMouseDown = useCallback((e: MouseEvent) => {
    if (maximized) return;
    if ((e.target as HTMLElement).closest('.title-dots')) return;
    e.preventDefault();
    winRef.current?.classList.add('is-interacting');
    dragRef.current = {
      ox: e.clientX - winPos.x,
      oy: e.clientY - winPos.y,
      sl: winPos.x,
      st: winPos.y,
      w: winSize.w,
      h: winSize.h,
    };
  }, [winPos.x, winPos.y, winSize.w, winSize.h, maximized]);

  const toggleMaximize = useCallback(() => {
    if (maximized) {
      setWinPos(preMaxRef.current.pos);
      setWinSize(preMaxRef.current.size);
      setMaximized(false);
    } else {
      preMaxRef.current = { pos: { ...winPos }, size: { ...winSize } };
      setWinPos({ x: 0, y: 0 });
      setWinSize({ w: window.innerWidth, h: window.innerHeight });
      setMaximized(true);
    }
  }, [maximized, winPos, winSize]);

  const onResizeStart = useCallback((dir: string) => (e: MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    e.stopPropagation();
    winRef.current?.classList.add('is-interacting');
    resizeRef.current = {
      sx: e.clientX, sy: e.clientY,
      sw: winSize.w, sh: winSize.h,
      sl: winPos.x, st: winPos.y,
      dir,
    };
  }, [maximized, winSize, winPos]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    });
  }, []);

  const output = useCallback((html: string) => {
    setLines(prev => {
      const next = [...prev, { html }];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
    scrollToBottom();
  }, [scrollToBottom]);

  const appendInputLine = useCallback((cmd: string) => {
    setLines(prev => [...prev, { html: `<span class="terminal-prompt">${getPrompt(cwd)}</span>${cmd}`, isInput: true }]);
  }, [cwd]);

  const openViewer = useCallback((post: PostContent) => {
    const viewerWindow = createViewerWindow(post);
    const next = [...viewerWindowsRef.current, viewerWindow];
    viewerWindowsRef.current = next;
    setViewerWindows(next);
    syncBrowserLocation(post);
  }, [createViewerWindow]);

  const activateViewer = useCallback((id: number) => {
    const current = viewerWindowsRef.current.find(viewer => viewer.id === id);
    if (!current) return;
    const zIndex = ++zCounterRef.current;
    const next = viewerWindowsRef.current.map(viewer => viewer.id === id ? { ...viewer, zIndex } : viewer);
    viewerWindowsRef.current = next;
    setViewerWindows(next);
    syncBrowserLocation(current.post, 'replace');
  }, []);

  const activateMainWindow = useCallback(() => {
    setMainZIndex(++zCounterRef.current);
  }, []);

  const closeViewer = useCallback((id: number) => {
    const next = viewerWindowsRef.current.filter(viewer => viewer.id !== id);
    viewerWindowsRef.current = next;
    setViewerWindows(next);
    const topViewer = next.reduce<ViewerWindowState | null>(
      (top, viewer) => !top || viewer.zIndex > top.zIndex ? viewer : top,
      null,
    );
    syncBrowserLocation(topViewer?.post ?? null);
    if (!topViewer) requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleViewerNavigate = useCallback((id: number, href: string) => {
    const parsed = new URL(href, window.location.origin);
    const match = parsed.pathname.match(/^\/blog\/(.+?)\/?$/);
    if (!match) {
      window.location.href = href;
      return;
    }
    const slug = decodeURIComponent(match[1]);
    const hash = parsed.hash ? decodeURIComponent(parsed.hash.slice(1)) : null;
    fetchPostContent(slug).then(result => {
      if (!result) {
        window.location.href = href;
        return;
      }
      const zIndex = ++zCounterRef.current;
      const next = viewerWindowsRef.current.map(viewer => viewer.id === id
        ? { ...viewer, post: result, zIndex }
        : viewer);
      viewerWindowsRef.current = next;
      setViewerWindows(next);
      syncBrowserLocation(result);
      if (hash) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const viewer = document.querySelector<HTMLElement>(`.content-viewer[data-viewer-id="${id}"]`);
          viewer?.querySelector<HTMLElement>(`#${CSS.escape(hash)}`)?.scrollIntoView({ behavior: 'smooth' });
        }));
      }
    });
  }, []);

  const handleClear = useCallback(() => {
    setLines([]);
  }, []);

  const getCurrentFiles = useCallback((): FileEntry[] => {
    return listDir(cwd) || [];
  }, [cwd]);

  const handleOutputClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const clickable = target.closest('[data-action]') as HTMLElement | null;
    if (!clickable) return;

    const action = clickable.dataset.action;
    if (action === 'cat') {
      const slug = clickable.dataset.slug;
      if (slug) {
        const quotedSlug = quoteCommandArg(slug);
        executeCommand(`cat ${quotedSlug}`, {
          cwd,
          output,
          appendInputLine,
          openViewer,
          getCurrentFiles,
          setCwd,
          _history: history,
        });
      }
    } else if (action === 'cd') {
      const path = clickable.dataset.path;
      if (path) {
        executeCommand(`cd ${path}`, {
          cwd,
          output,
          appendInputLine,
          openViewer,
          getCurrentFiles,
          setCwd,
          _history: history,
        });
        // Update CWD locally too
        const normalized = path.endsWith('/') ? path : path + '/';
        if (listDir(normalized)) {
          setCwd(normalized);
        }
      }
    } else if (action === 'cmd') {
      const cmd = clickable.dataset.cmd;
      if (cmd) {
        handleCommand(cmd);
      }
    }
  }, [cwd, output, appendInputLine, openViewer, getCurrentFiles, history]);

  const handleCommand = useCallback((cmd: string) => {
    if (cmd.trim().toLowerCase() === 'clear') {
      handleClear();
      appendInputLine(cmd);
      setHistory(prev => { const next = [...prev, cmd]; localStorage.setItem('cmd-history', JSON.stringify(next.slice(-200))); return next; });
      setInput('');
      setHistoryIndex(-1);
      return;
    }

    appendInputLine(cmd);

    executeCommand(cmd, {
      cwd,
      output,
      appendInputLine,
      openViewer,
      getCurrentFiles,
      setCwd,
      _history: history,
    }, handleCommand);

    setHistory(prev => { const next = [...prev, cmd]; localStorage.setItem('cmd-history', JSON.stringify(next.slice(-200))); return next; });
    setInput('');
    setHistoryIndex(-1);
    setTabCycle(null);
  }, [cwd, output, appendInputLine, openViewer, getCurrentFiles, history, handleClear]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!inputRef.current) return;

    if (e.key === 'Enter') {
      handleCommand(input);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setInput(history[newIndex]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= history.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const result = completeTerminalInput({
        input,
        cwd,
        tabCycle,
        shiftKey: e.shiftKey,
        commands: getAllCommands(),
        listDir,
        resolvePath,
      });
      setInput(result.input);
      setTabCycle(result.tabCycle);
      return;
    }

    if (e.key === 'Escape') {
      setTabCycle(null);
    }
  }, [input, history, historyIndex, handleCommand, cwd, tabCycle]);

  const resizeDirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const topViewer = viewerWindows.reduce<ViewerWindowState | null>(
    (top, viewer) => !top || viewer.zIndex > top.zIndex ? viewer : top,
    null,
  );

  return (
    <>
      <div
        ref={winRef}
        class={`terminal-window${maximized ? ' maximized' : ''}`}
        style={!maximized
          ? { left: `${winPos.x}px`, top: `${winPos.y}px`, width: `${winSize.w}px`, height: `${winSize.h}px`, zIndex: mainZIndex }
          : { zIndex: mainZIndex }}
        onMouseDown={activateMainWindow}
      >
        <div class="title-bar" onMouseDown={onTitleMouseDown} onDblClick={toggleMaximize}>
          <div class="title-dots">
            <span class="dot dot-red" />
            <span class="dot dot-yellow" />
            <span class="dot dot-green" onClick={(e) => { e.stopPropagation(); toggleMaximize(); }} />
          </div>
          <span class="title-text">visitor@{config.terminal.hostname}:~</span>
        </div>
        <div class="terminal-body" ref={bodyRef}>
          {lines.map((line, i) => (
            <div
              key={i}
              class="terminal-line"
              dangerouslySetInnerHTML={{ __html: line.html }}
              onClick={line.isInput ? undefined : handleOutputClick}
            />
          ))}
          {tabCycle && tabCycle.matches.length > 0 && (
            <div class="terminal-line" style="color:var(--overlay)">
              {tabCycle.matches.map((m, i) => {
                const desc = tabCycle.descs?.[m];
                return (
                  <span key={i} style={i === tabCycle.idx ? 'color:var(--text);text-decoration:underline' : ''}>
                    {m}{desc ? <span style="color:var(--subtext);font-size:0.85em"> ({desc})</span> : null}{'  '}
                  </span>
                );
              })}
            </div>
          )}
          {ready && (
            <div class="input-line">
              <span class="terminal-prompt">{getPrompt(cwd)}</span>
              <input
                ref={inputRef}
                class="input-field"
                type="text"
                value={input}
                onInput={(e) => { setInput((e.target as HTMLInputElement).value); setTabCycle(null); }}
                onKeyDown={handleKeyDown}
                autoFocus
                spellcheck={false}
                autocomplete="off"
                autocapitalize="off"
              />
            </div>
          )}
        </div>
        {!maximized && resizeDirs.map(dir => (
          <span key={dir} class={`resize-handle rh-${dir}`} onMouseDown={onResizeStart(dir)} />
        ))}
      </div>
      {viewerWindows.map(viewer => (
        <ContentViewer
          key={viewer.id}
          windowId={viewer.id}
          title={viewer.post.title}
          html={viewer.post.html}
          date={viewer.post.date}
          tags={viewer.post.tags}
          readingTime={viewer.post.reading_time}
          slug={viewer.post.slug}
          initialPosition={viewer.initialPosition}
          initialSize={viewer.initialSize}
          zIndex={viewer.zIndex}
          active={viewer.id === topViewer?.id && viewer.zIndex > mainZIndex}
          onActivate={() => activateViewer(viewer.id)}
          onClose={() => closeViewer(viewer.id)}
          onNavigate={(href) => handleViewerNavigate(viewer.id, href)}
        />
      ))}
    </>
  );
}
