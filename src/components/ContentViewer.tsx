// ============================================================
// Content Viewer - Overlay panel for reading blog posts
// ============================================================

import { useEffect, useRef } from 'preact/hooks';

interface Props {
  title: string;
  html: string;
  onClose: () => void;
  onNavigate?: (url: string) => void;
}

let mermaidIdCounter = 0;

export default function ContentViewer({ title, html, onClose, onNavigate }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'q') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // Prevent background scrolling
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      // Re-focus terminal input when viewer closes
      document.querySelector<HTMLInputElement>('.input-field')?.focus();
    };
  }, [onClose]);

  // Scroll to top when content changes
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [html]);

  // Initialize mermaid diagrams after content loads
  useEffect(() => {
    if (!bodyRef.current) return;

    // Initialize mermaid diagrams
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

      // Handle #anchor links within the viewer
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
        <div class="viewer-hint">
          Press <kbd>q</kbd> or <kbd>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
