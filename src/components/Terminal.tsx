// ============================================================
// Terminal Component - Preact Island
// Core terminal UI with command input, output, and history
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import ContentViewer, { getLineHeight } from './ContentViewer';
import { executeCommand, getPrompt, getAllCommands } from '../terminal/commands';
import { loadFileSystem, listDir, resolvePath, fetchPostContent, getAllPosts } from '../terminal/file-tree';
import { completeTerminalInput, type TabCycleState } from '../terminal/autocomplete';
import { quoteCommandArg } from '../terminal/command-line';
import type { FileEntry, PostContent, PostMeta } from '../terminal/types';
import config from '../config';

interface OutputLine {
  html: string;
  isInput?: boolean;
}

type ViewerState = PostContent;

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
  const posts = getAllPosts().filter(post => post.slug !== 'index');
  const postsBySlug = new Map(posts.map(post => [post.slug.toLowerCase(), post]));
  const configuredFeatured = config.home.featuredSlugs
    .map(slug => postsBySlug.get(slug.toLowerCase()))
    .filter((post): post is PostMeta => Boolean(post));
  const featured = configuredFeatured.length > 0
    ? configuredFeatured
    : posts.slice(0, 3);
  const featuredSlugs = new Set(featured.map(post => post.slug));
  const recent = posts
    .filter(post => !featuredSlugs.has(post.slug))
    .slice(0, 4);

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

export default function Terminal() {
  const [cwd, setCwd] = useState('/');
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cmd-history') || '[]'); } catch { return []; }
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [ready, setReady] = useState(false);
  const [tabCycle, setTabCycle] = useState<TabCycleState | null>(null);

  // Window management
  const [winPos, setWinPos] = useState({ x: 0, y: 0 });
  const [winSize, setWinSize] = useState({ ...DEFAULT_WIN });
  const [maximized, setMaximized] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{
    sx: number; sy: number;
    sw: number; sh: number;
    sl: number; st: number;
    dir: string;
  } | null>(null);
  const preMaxRef = useRef({ pos: { x: 0, y: 0 }, size: { ...DEFAULT_WIN } });
  const viewerGBufferRef = useRef<number | null>(null);

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
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
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
            setViewer(result);
            document.title = `${result.title} | ${config.site.title}`;
            // Use replaceState since this is restoring, not a new navigation
            window.history.replaceState({ slug: initialSlug, title: result.title }, '', `/blog/${initialSlug}/`);
          } else {
            // Invalid slug, redirect to home
            window.history.replaceState(null, '', '/');
          }
        });
      }
    });
  }, []);

  // Drag & resize — direct DOM manipulation for smoothness, sync state on mouseup
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = winRef.current;
      if (!el) return;

      if (dragRef.current) {
        el.style.left = `${e.clientX - dragRef.current.ox}px`;
        el.style.top = `${e.clientY - dragRef.current.oy}px`;
      }

      if (resizeRef.current) {
        const r = resizeRef.current;
        const dx = e.clientX - r.sx;
        const dy = e.clientY - r.sy;
        let nw = r.sw, nh = r.sh, nl = r.sl, nt = r.st;
        if (r.dir.includes('e')) nw = Math.max(MIN_W, r.sw + dx);
        if (r.dir.includes('s')) nh = Math.max(MIN_H, r.sh + dy);
        if (r.dir.includes('w')) { nw = Math.max(MIN_W, r.sw - dx); nl = r.sl + r.sw - nw; }
        if (r.dir.includes('n')) { nh = Math.max(MIN_H, r.sh - dy); nt = r.st + r.sh - nh; }
        el.style.left = `${nl}px`;
        el.style.top = `${nt}px`;
        el.style.width = `${nw}px`;
        el.style.height = `${nh}px`;
      }
    };

    const onUp = () => {
      const el = winRef.current;
      if (el && (dragRef.current || resizeRef.current)) {
        const rect = el.getBoundingClientRect();
        setWinPos({ x: rect.left, y: rect.top });
        setWinSize({ w: rect.width, h: rect.height });
      }
      dragRef.current = null;
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

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
            setViewer(result);
            document.title = `${result.title} | ${config.site.title}`;
          }
        });
      } else {
        // Back to home — close viewer
        setViewer(null);
        document.title = config.site.title;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --- Window management handlers ---

  const onTitleMouseDown = useCallback((e: MouseEvent) => {
    if (maximized) return;
    if ((e.target as HTMLElement).closest('.title-dots')) return;
    dragRef.current = { ox: e.clientX - winPos.x, oy: e.clientY - winPos.y };
  }, [winPos.x, winPos.y, maximized]);

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
    inputRef.current?.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setViewer(post);
    // Sync URL to browser history
    const { slug, title } = post;
    const url = `/blog/${slug}/`;
    document.title = `${title} | ${config.site.title}`;
    if (window.location.pathname !== url) {
      window.history.pushState({ slug, title }, '', url);
    }
  }, []);

  const closeViewer = useCallback(() => {
    setViewer(null);
    // Restore URL to home
    document.title = config.site.title;
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleViewerNavigate = useCallback((href: string) => {
    // Extract slug from /blog/{slug}/ or /blog/{slug}#hash
    const m = href.match(/^\/blog\/(.+?)(?:\/#|#|\/$|$)/);
    if (!m) {
      window.location.href = href;
      return;
    }
    const slug = decodeURIComponent(m[1]);
    const hash = href.includes('#') ? decodeURIComponent(href.split('#')[1]) : null;
    fetchPostContent(slug).then(result => {
      if (result) {
        openViewer(result);
        // Scroll to anchor after content renders
        if (hash) {
          requestAnimationFrame(() => {
            const target = document.querySelector(`#${CSS.escape(hash)}`);
            target?.scrollIntoView({ behavior: 'smooth' });
          });
        }
      } else {
        window.location.href = href;
      }
    });
  }, [openViewer]);

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

  useEffect(() => {
    if (!viewer) return;

    const handleGlobalViewerKeys = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest('.vim-search-input')) return;

      const viewerBody = document.querySelector<HTMLElement>('.viewer-body');
      if (!viewerBody) return;
      const eventKey = typeof e.key === 'string' ? e.key : '';
      const noCommandModifier = !e.ctrlKey && !e.altKey && !e.metaKey;
      const isPlainKey = (key: string, code: string) =>
        noCommandModifier && !e.shiftKey && (
          eventKey.toLowerCase() === key ||
          e.code === code
        );
      const isShiftKey = (key: string, code: string) =>
        noCommandModifier && e.shiftKey && (
          eventKey === key ||
          e.code === code
        );

      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      };

      if (e.key === 'd' && e.ctrlKey) {
        consume();
        const lineHeight = getLineHeight(viewerBody);
        viewerBody.scrollTop += (viewerBody.clientHeight - lineHeight * 2) * 0.5;
        return;
      }

      if (e.key === 'u' && e.ctrlKey) {
        consume();
        const lineHeight = getLineHeight(viewerBody);
        viewerBody.scrollTop -= (viewerBody.clientHeight - lineHeight * 2) * 0.5;
        return;
      }

      if (isShiftKey('G', 'KeyG')) {
        consume();
        viewerBody.scrollTop = viewerBody.scrollHeight;
        return;
      }

      if (isPlainKey('g', 'KeyG')) {
        consume();
        const now = Date.now();
        if (viewerGBufferRef.current && now - viewerGBufferRef.current < 500) {
          viewerBody.scrollTop = 0;
          viewerGBufferRef.current = null;
        } else {
          viewerGBufferRef.current = now;
        }
        return;
      }

      if (eventKey === 'Escape' || isPlainKey('q', 'KeyQ')) {
        consume();
        closeViewer();
      }
    };

    window.addEventListener('keydown', handleGlobalViewerKeys, { capture: true });
    document.addEventListener('keydown', handleGlobalViewerKeys, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleGlobalViewerKeys, { capture: true });
      document.removeEventListener('keydown', handleGlobalViewerKeys, { capture: true });
      viewerGBufferRef.current = null;
    };
  }, [viewer, closeViewer]);

  const resizeDirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  return (
    <div
      ref={winRef}
      class={`terminal-window${maximized ? ' maximized' : ''}`}
      style={!maximized ? { left: `${winPos.x}px`, top: `${winPos.y}px`, width: `${winSize.w}px`, height: `${winSize.h}px` } : undefined}
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
        {ready && !viewer && (
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
      {viewer && (
        <ContentViewer
          title={viewer.title}
          html={viewer.html}
          date={viewer.date}
          tags={viewer.tags}
          readingTime={viewer.reading_time}
          slug={viewer.slug}
          onClose={closeViewer}
          onNavigate={handleViewerNavigate}
        />
      )}
      {!maximized && resizeDirs.map(dir => (
        <span key={dir} class={`resize-handle rh-${dir}`} onMouseDown={onResizeStart(dir)} />
      ))}
    </div>
  );
}
