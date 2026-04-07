// ============================================================
// Content Viewer - Overlay panel for reading blog posts
// Supports vim-style keybindings: j/k/Ctrl+d/u/G/gg// /n/N
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'preact/hooks';

interface Props {
  title: string;
  html: string;
  onClose: () => void;
  onNavigate?: (url: string) => void;
}

let mermaidIdCounter = 0;

/** Get computed line-height in px, fallback to 24 */
export function getLineHeight(el: HTMLElement): number {
  const computed = getComputedStyle(el).lineHeight;
  if (computed === 'normal') return 24;
  const px = parseFloat(computed);
  return isNaN(px) ? 24 : px;
}

/** Highlight all text matches in the viewer body, return mark elements */
export function highlightMatches(container: HTMLElement, query: string): HTMLElement[] {
  clearHighlights(container);
  if (!query) return [];

  const marks: HTMLElement[] = [];
  const lowerQuery = query.toLowerCase();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip code blocks and their contents
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('pre, code, style, script, .katex, .mermaid')) {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.textContent && node.textContent.toLowerCase().includes(lowerQuery)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const textNode of nodes) {
    const text = textNode.textContent || '';
    const lowerText = text.toLowerCase();
    let idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) continue;

    const frag = document.createDocumentFragment();
    let lastIdx = 0;

    while (idx !== -1) {
      // Text before match
      if (idx > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
      }
      // Highlighted match
      const mark = document.createElement('mark');
      mark.className = 'vim-search-match';
      mark.textContent = text.slice(idx, idx + query.length);
      frag.appendChild(mark);
      marks.push(mark);

      lastIdx = idx + query.length;
      idx = lowerText.indexOf(lowerQuery, lastIdx);
    }

    // Remaining text
    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }

    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return marks;
}

/** Remove all vim search highlight marks */
export function clearHighlights(container: HTMLElement) {
  const marks = container.querySelectorAll('mark.vim-search-match');
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
    parent.normalize(); // merge adjacent text nodes
  }
}

export default function ContentViewer({ title, html, onClose, onNavigate }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const matchElementsRef = useRef<HTMLElement[]>([]);
  const matchIndexRef = useRef(-1);

  // gg double-press detection
  const gBufferRef = useRef<number | null>(null);

  const scrollToMatch = useCallback((direction: 'next' | 'prev') => {
    const matches = matchElementsRef.current;
    if (matches.length === 0) return;

    let idx: number;
    if (matchIndexRef.current === -1) {
      // First navigation — find the match closest below current scroll
      const body = bodyRef.current!;
      const scrollMid = body.scrollTop + body.clientHeight / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < matches.length; i++) {
        const rect = matches[i].getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        const elTop = rect.top - bodyRect.top + body.scrollTop;
        const dist = direction === 'next'
          ? elTop - scrollMid
          : scrollMid - elTop;
        if (dist >= 0 && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      idx = bestIdx;
    } else {
      const len = matches.length;
      idx = direction === 'next'
        ? (matchIndexRef.current + 1) % len
        : (matchIndexRef.current - 1 + len) % len;
    }

    matchIndexRef.current = idx;
    matches[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Open search bar
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchQuery('');
    matchIndexRef.current = -1;
    if (bodyRef.current) clearHighlights(bodyRef.current);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  // Close search bar and clear highlights
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    matchIndexRef.current = -1;
    matchElementsRef.current = [];
    if (bodyRef.current) clearHighlights(bodyRef.current);
  }, []);

  // Search query changed — re-highlight (debounced 150ms)
  useEffect(() => {
    if (!bodyRef.current) return;
    if (!searchOpen || !searchQuery) {
      if (!searchQuery) {
        matchElementsRef.current = [];
        matchIndexRef.current = -1;
        clearHighlights(bodyRef.current);
      }
      return;
    }
    const timer = setTimeout(() => {
      if (!bodyRef.current) return;
      matchElementsRef.current = highlightMatches(bodyRef.current, searchQuery);
      matchIndexRef.current = -1;
      if (matchElementsRef.current.length > 0) {
        matchIndexRef.current = 0;
        matchElementsRef.current[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen]);

  // Keyboard handler — vim keybindings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If search is open, only handle search-specific keys
      if (searchOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSearch();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          // Jump to next match (same as n)
          scrollToMatch('next');
          return;
        }
        // Don't intercept typing in search input
        return;
      }

      const body = bodyRef.current;
      if (!body) return;

      // j/k — scroll by 3 lines
      if (e.key === 'j') {
        e.preventDefault();
        body.scrollTop += getLineHeight(body) * 3;
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        body.scrollTop -= getLineHeight(body) * 3;
        return;
      }

      // Ctrl+d — half page down
      if (e.key === 'd' && e.ctrlKey) {
        e.preventDefault();
        const lh = getLineHeight(body);
        body.scrollTop += (body.clientHeight - lh * 2) * 0.5;
        return;
      }

      // Ctrl+u — half page up
      if (e.key === 'u' && e.ctrlKey) {
        e.preventDefault();
        const lh = getLineHeight(body);
        body.scrollTop -= (body.clientHeight - lh * 2) * 0.5;
        return;
      }

      // G — scroll to bottom
      if (e.key === 'G') {
        e.preventDefault();
        body.scrollTop = body.scrollHeight;
        return;
      }

      // g — first press buffers, second press (gg) scrolls to top
      if (e.key === 'g') {
        e.preventDefault();
        const now = Date.now();
        if (gBufferRef.current && now - gBufferRef.current < 500) {
          body.scrollTop = 0;
          gBufferRef.current = null;
        } else {
          gBufferRef.current = now;
        }
        return;
      }

      // / — open search
      if (e.key === '/') {
        e.preventDefault();
        openSearch();
        return;
      }

      // n — next search match (only when matches exist)
      if (e.key === 'n' && matchElementsRef.current.length > 0) {
        e.preventDefault();
        scrollToMatch('next');
        return;
      }

      // N — previous search match (only when matches exist)
      if (e.key === 'N' && matchElementsRef.current.length > 0) {
        e.preventDefault();
        scrollToMatch('prev');
        return;
      }

      // q or Esc — close viewer
      if (e.key === 'Escape' || e.key === 'q') {
        onClose();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      document.querySelector<HTMLInputElement>('.input-field')?.focus();
    };
  }, [onClose, searchOpen, closeSearch, scrollToMatch, openSearch]);

  // Scroll to top when content changes
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
    // Reset search state when content changes
    closeSearch();
  }, [html]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize mermaid diagrams after content loads
  useEffect(() => {
    if (!bodyRef.current) return;

    const mermaidBlocks = bodyRef.current.querySelectorAll('pre.mermaid');
    if (mermaidBlocks.length === 0) return;

    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#89b4fa',
          primaryTextColor: '#cdd6f4',
          primaryBorderColor: '#89b4fa',
          lineColor: '#bac2de',
          secondaryColor: '#45475a',
          tertiaryColor: '#313244',
          background: '#1e1e2e',
          mainBkg: '#313244',
          nodeBorder: '#89b4fa',
          clusterBkg: '#45475a',
          titleColor: '#cdd6f4',
          edgeLabelBackground: '#1e1e2e',
        },
      });

      mermaidBlocks.forEach((block) => {
        const id = `mermaid-${++mermaidIdCounter}`;
        const source = block.textContent || '';
        mermaid.render(id, source).then(({ svg }) => {
          const container = document.createElement('div');
          container.className = 'mermaid';
          container.innerHTML = svg;
          block.replaceWith(container);
        });
      });
    });
  }, [html]);

  // Add copy buttons to code blocks
  useEffect(() => {
    if (!bodyRef.current) return;

    const codeBlocks = bodyRef.current.querySelectorAll('pre.astro-code');
    codeBlocks.forEach((pre) => {
      const htmlPre = pre as HTMLElement;
      if (htmlPre.querySelector('.copy-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async () => {
        const code = htmlPre.querySelector('code');
        const text = code?.textContent || htmlPre.textContent || '';
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        } catch {
          btn.textContent = 'Failed';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        }
      });
      htmlPre.style.position = 'relative';
      htmlPre.appendChild(btn);
    });
  }, [html]);

  // Intercept internal links
  useEffect(() => {
    if (!bodyRef.current) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http')) return;

      e.preventDefault();

      if (href.startsWith('#')) {
        const targetEl = bodyRef.current?.querySelector(href);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
        return;
      }

      if (onNavigate) {
        onNavigate(href);
      } else {
        window.location.href = href;
      }
    };

    bodyRef.current.addEventListener('click', handleClick);
    return () => {
      bodyRef.current?.removeEventListener('click', handleClick);
    };
  }, [onNavigate, onClose]);

  const matchCount = matchElementsRef.current.length;
  const matchInfo = searchOpen && searchQuery && matchCount > 0
    ? `[${matchIndexRef.current + 1}/${matchCount}]`
    : '';

  return (
    <div class="content-viewer" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div class="content-viewer-panel">
        <div class="viewer-header">
          <div class="title-dots">
            <span class="dot dot-red"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
          </div>
          <span class="viewer-title">{title}</span>
          <span class="viewer-close" onClick={onClose}>[q]</span>
        </div>
        <div
          class="viewer-body prose"
          ref={bodyRef}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {searchOpen && (
          <div class="vim-search-bar">
            <span class="vim-search-prompt">/</span>
            <input
              ref={searchInputRef}
              class="vim-search-input"
              type="text"
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              spellcheck={false}
              autocomplete="off"
              autocapitalize="off"
            />
            {matchInfo && <span class="vim-search-info">{matchInfo}</span>}
          </div>
        )}
        <div class="viewer-hint">
          <kbd>j</kbd><kbd>k</kbd> scroll
          {' '}
          <kbd>Ctrl+d</kbd><kbd>Ctrl+u</kbd> half-page
          {' '}
          <kbd>/</kbd> search
          {' '}
          <kbd>q</kbd> close
        </div>
      </div>
    </div>
  );
}
