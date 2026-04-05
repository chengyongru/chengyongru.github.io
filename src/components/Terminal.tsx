// ============================================================
// Terminal Component - Preact Island
// Core terminal UI with command input, output, and history
// ============================================================

import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import ContentViewer from './ContentViewer';
import { executeCommand, getPrompt, getAllCommands } from '../terminal/commands';
import { loadFileSystem, listDir, getPostUrl, resolvePath } from '../terminal/file-tree';
import type { FileEntry } from '../terminal/types';

interface OutputLine {
  html: string;
  isInput?: boolean;
}

interface ViewerState {
  title: string;
  html: string;
}

// Boot sequence
const BANNER = [
  `<div style="margin:4px 0 6px;font-family:'JetBrains Mono',monospace;">
    <div style="font-size:20px;font-weight:800;letter-spacing:2px;line-height:1.3;">
      <span style="color:var(--green)">CYR</span><span style="color:var(--surface2)">.</span><span style="color:var(--mauve)">ML</span>
      <span style="font-size:12px;font-weight:400;color:var(--subtext);margin-left:8px;letter-spacing:0.5px;"><a href="mailto:chengyongru.ai@gmail.com" style="color:var(--subtext);text-decoration:none;">chengyongru.ai@gmail.com</a></span>
    </div>
    <div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--surface1);font-size:13px;color:var(--overlay);">
      Type <span style="color:var(--yellow)">'help'</span> for commands, or click anything to explore.
    </div>
  </div>`,
  '',
];

const MIN_W = 480;
const MIN_H = 360;

function longestCommonPrefix(strs: string[]): string {
  if (strs.length < 2) return strs[0] || '';
  let i = 0;
  while (true) {
    const ch = strs[0][i];
    if (ch === undefined) break;
    if (!strs.every(s => s[i] === ch)) break;
    i++;
  }
  return strs[0].slice(0, i);
}

export default function Terminal() {
  const [cwd, setCwd] = useState('/');
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [ready, setReady] = useState(false);
  const [tabOptions, setTabOptions] = useState<string[]>([]);
  const [tabCycle, setTabCycle] = useState<{matches: string[]; idx: number; base: string} | null>(null);

  // Window management
  const [winPos, setWinPos] = useState({ x: 0, y: 0 });
  const [winSize, setWinSize] = useState({ w: 960, h: 600 });
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
  const preMaxRef = useRef({ pos: { x: 0, y: 0 }, size: { w: 960, h: 600 } });

  // Center window on mount
  useEffect(() => {
    setWinPos({
      x: Math.max(20, Math.round((window.innerWidth - 960) / 2)),
      y: Math.max(20, Math.round((window.innerHeight - 600) / 2)),
    });
  }, []);

  // Load file system on mount
  useEffect(() => {
    // Restore saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    loadFileSystem().then(() => {
      // Check if user prefers reduced motion
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const hasVisited = localStorage.getItem('terminal-booted');

      if (prefersReducedMotion || hasVisited) {
        // Skip animation — show all at once
        setLines(BANNER.map(html => ({ html })));
        setReady(true);
      } else {
        // Typing animation for first visit
        const typedLines: OutputLine[] = [];
        let idx = 0;
        const animate = () => {
          if (idx < BANNER.length) {
            typedLines.push({ html: BANNER[idx] });
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
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
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
    setLines(prev => [...prev, { html }]);
    scrollToBottom();
  }, [scrollToBottom]);

  const appendInputLine = useCallback((cmd: string) => {
    setLines(prev => [...prev, { html: `<span class="terminal-prompt">${getPrompt(cwd)}</span>${cmd}`, isInput: true }]);
  }, [cwd]);

  const openViewer = useCallback((title: string, html: string) => {
    setViewer({ title, html });
  }, []);

  const handleViewerNavigate = useCallback((href: string) => {
    // Extract slug from /blog/{slug}/
    const m = href.match(/^\/blog\/(.+?)\/$/);
    if (!m) {
      window.location.href = href;
      return;
    }
    const slug = m[1];
    fetch(getPostUrl(slug))
      .then(res => res.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const article = doc.querySelector('article');
        if (article) {
          // Strip blog page header/footer — viewer has its own title bar
          article.querySelector('.post-header')?.remove();
          article.querySelector('.post-footer')?.remove();
          openViewer(article.querySelector('h1')?.textContent || slug, article.innerHTML);
        }
      })
      .catch(() => {
        window.location.href = href;
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
        executeCommand(`cat ${slug}`, {
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
      setHistory(prev => [...prev, cmd]);
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

    setHistory(prev => [...prev, cmd]);
    setInput('');
    setHistoryIndex(-1);
    setTabOptions([]);
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
      const parts = input.split(' ');
      const isCmd = parts.length <= 1;
      const word = isCmd ? parts[0] : parts[parts.length - 1];
      const lword = word.toLowerCase();

      let candidates: string[];

      if (isCmd) {
        candidates = getAllCommands().filter(c => c.startsWith(lword));
      } else {
        // Path-aware file completion
        const lastSlash = word.lastIndexOf('/');
        const dirPart = lastSlash >= 0 ? word.substring(0, lastSlash + 1) : '';
        const filePrefix = word.substring(lastSlash + 1).toLowerCase();
        const resolvedDir = dirPart ? resolvePath(cwd, dirPart) : cwd;
        const files = listDir(resolvedDir) || [];
        candidates = files
          .filter(f => f.name.toLowerCase().startsWith(filePrefix))
          .map(f => dirPart + f.name + (f.type === 'dir' && !f.name.endsWith('/') ? '/' : ''));
      }

      if (candidates.length === 0) { setTabCycle(null); setTabOptions([]); return; }

      if (candidates.length === 1) {
        if (isCmd) setInput(candidates[0] + ' ');
        else { parts[parts.length - 1] = candidates[0]; setInput(parts.join(' ')); }
        setTabCycle(null); setTabOptions([]);
        return;
      }

      // Multiple candidates — cycling Tab completion
      const dir = e.shiftKey ? -1 : 1;

      if (tabCycle && lword.startsWith(tabCycle.base)) {
        // Continue cycling through matches
        const next = tabCycle.idx === -1
          ? (dir === 1 ? 0 : candidates.length - 1)
          : (tabCycle.idx + dir + candidates.length) % candidates.length;
        const picked = candidates[next];
        if (isCmd) setInput(picked + ' ');
        else { parts[parts.length - 1] = picked; setInput(parts.join(' ')); }
        setTabCycle({ matches: candidates, idx: next, base: tabCycle.base });
        setTabOptions(candidates);
      } else {
        // First Tab: extend to common prefix, show options
        const common = longestCommonPrefix(candidates);
        if (common.length > lword.length) {
          if (isCmd) setInput(common);
          else { parts[parts.length - 1] = common; setInput(parts.join(' ')); }
        }
        setTabCycle({ matches: candidates, idx: -1, base: lword });
        setTabOptions(candidates);
      }
      return;
    }

    if (e.key === 'Escape') {
      setTabOptions([]);
      setTabCycle(null);
    }
  }, [input, history, historyIndex, handleCommand, getCurrentFiles, cwd]);

  // Update cwd from command context
  const handleSetCwd = useCallback((newCwd: string) => {
    setCwd(newCwd);
  }, []);

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
        <span class="title-text">visitor@chengyongru:~</span>
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
        {tabOptions.length > 0 && (
          <div class="terminal-line" style="color:var(--overlay)">
            {tabOptions.join('  ')}
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
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
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
          onClose={() => {
            setViewer(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          onNavigate={handleViewerNavigate}
        />
      )}
      {!maximized && resizeDirs.map(dir => (
        <span key={dir} class={`resize-handle rh-${dir}`} onMouseDown={onResizeStart(dir)} />
      ))}
    </div>
  );
}
