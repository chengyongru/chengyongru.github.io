import { h, render } from 'preact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ContentViewer, { getLineHeight, highlightMatches, clearHighlights } from '../ContentViewer';

const renderRoots: HTMLElement[] = [];

afterEach(() => {
  for (const root of renderRoots) {
    render(null, root);
  }
  renderRoots.length = 0;
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('getLineHeight', () => {
  it('returns computed line-height in px', () => {
    const el = document.createElement('div');
    el.style.lineHeight = '32px';
    document.body.appendChild(el);
    expect(getLineHeight(el)).toBe(32);
  });

  it('returns fallback 24 for "normal"', () => {
    const el = document.createElement('div');
    el.style.lineHeight = 'normal';
    document.body.appendChild(el);
    expect(getLineHeight(el)).toBe(24);
  });

  it('returns fallback 24 for invalid values', () => {
    const el = document.createElement('div');
    el.style.lineHeight = 'auto';
    document.body.appendChild(el);
    const result = getLineHeight(el);
    // parseFloat('auto') is NaN, so should fallback
    expect(result).toBe(24);
  });
});

describe('highlightMatches', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('returns empty array for empty query', () => {
    container.innerHTML = '<p>Hello World</p>';
    const marks = highlightMatches(container, '');
    expect(marks).toHaveLength(0);
  });

  it('highlights single match', () => {
    container.innerHTML = '<p>Hello World</p>';
    const marks = highlightMatches(container, 'World');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('World');
    expect(marks[0].className).toBe('vim-search-match');
  });

  it('highlights multiple matches', () => {
    container.innerHTML = '<p>foo bar foo baz foo</p>';
    const marks = highlightMatches(container, 'foo');
    expect(marks).toHaveLength(3);
  });

  it('is case-insensitive', () => {
    container.innerHTML = '<p>Hello HELLO hello</p>';
    const marks = highlightMatches(container, 'hello');
    expect(marks).toHaveLength(3);
  });

  it('preserves text around matches', () => {
    container.innerHTML = '<p>Hello World</p>';
    highlightMatches(container, 'World');
    expect(container.textContent).toBe('Hello World');
  });

  it('skips code blocks (pre)', () => {
    container.innerHTML = '<p>Hello</p><pre><code>Hello from code</code></pre>';
    const marks = highlightMatches(container, 'Hello');
    // Only the <p> Hello should match, not the one inside <pre>
    expect(marks).toHaveLength(1);
    expect(marks[0].closest('pre')).toBeNull();
  });

  it('skips inline code', () => {
    container.innerHTML = '<p>Hello <code>Hello</code> World</p>';
    const marks = highlightMatches(container, 'Hello');
    expect(marks).toHaveLength(1);
    expect(marks[0].closest('code')).toBeNull();
  });

  it('skips katex and mermaid elements', () => {
    container.innerHTML = '<p>Hello</p><span class="katex">Hello</span><div class="mermaid">Hello</div>';
    const marks = highlightMatches(container, 'Hello');
    expect(marks).toHaveLength(1);
  });

  it('clears previous highlights before applying new ones', () => {
    container.innerHTML = '<p>foo bar baz</p>';
    highlightMatches(container, 'foo');
    expect(container.querySelectorAll('mark.vim-search-match')).toHaveLength(1);

    highlightMatches(container, 'bar');
    expect(container.querySelectorAll('mark.vim-search-match')).toHaveLength(1);
    expect(container.querySelector('mark.vim-search-match')?.textContent).toBe('bar');
  });

  it('returns empty array when no match found', () => {
    container.innerHTML = '<p>Hello World</p>';
    const marks = highlightMatches(container, 'xyz');
    expect(marks).toHaveLength(0);
  });
});

describe('clearHighlights', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('removes all vim-search-match marks', () => {
    container.innerHTML = '<p>foo bar foo</p>';
    highlightMatches(container, 'foo');
    expect(container.querySelectorAll('mark.vim-search-match')).toHaveLength(2);

    clearHighlights(container);
    expect(container.querySelectorAll('mark.vim-search-match')).toHaveLength(0);
  });

  it('restores original text content after clearing', () => {
    container.innerHTML = '<p>Hello World</p>';
    highlightMatches(container, 'World');
    clearHighlights(container);
    expect(container.textContent).toBe('Hello World');
  });

  it('merges adjacent text nodes after unwrapping', () => {
    container.innerHTML = '<p>foobar</p>';
    highlightMatches(container, 'bar');
    clearHighlights(container);
    // After clearing, text nodes should be normalized
    const textNodes = Array.from(container.querySelectorAll('p'))
      .flatMap(p => Array.from(p.childNodes))
      .filter(n => n.nodeType === Node.TEXT_NODE);
    expect(textNodes.length).toBe(1);
    expect(textNodes[0].textContent).toBe('foobar');
  });

  it('is a no-op when no highlights exist', () => {
    container.innerHTML = '<p>Hello World</p>';
    clearHighlights(container);
    expect(container.innerHTML).toBe('<p>Hello World</p>');
  });
});

describe('ContentViewer controls', () => {
  it('renders as an independent positioned terminal window', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderRoots.push(host);

    render(h(ContentViewer, {
      title: 'Test Post',
      html: '<p>Hello</p>',
      windowId: 7,
      initialPosition: { x: 120, y: 80 },
      initialSize: { w: 720, h: 540 },
      zIndex: 42,
      onClose: vi.fn(),
    }), host);

    const viewer = host.querySelector<HTMLElement>('.content-viewer');
    expect(viewer?.dataset.viewerId).toBe('7');
    expect(viewer?.style.left).toBe('120px');
    expect(viewer?.style.top).toBe('80px');
    expect(viewer?.style.width).toBe('720px');
    expect(viewer?.style.height).toBe('540px');
    expect(viewer?.style.zIndex).toBe('42');
    expect(host.querySelector('.viewer-title')?.textContent).toBe('cat · Test Post');
    expect(document.body.style.overflow).toBe('');
  });

  it('closes from the red window control', () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderRoots.push(host);

    render(h(ContentViewer, {
      title: 'Test Post',
      html: '<p>Hello</p>',
      onClose,
    }), host);

    const closeButton = host.querySelector<HTMLElement>('.dot.dot-red');
    expect(closeButton).not.toBeNull();

    closeButton?.click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('highlightMatches edge cases', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('handles match at start of text', () => {
    container.innerHTML = '<p>Hello World</p>';
    const marks = highlightMatches(container, 'Hello');
    expect(marks).toHaveLength(1);
    expect(container.querySelector('p')?.firstChild?.nodeName).toBe('MARK');
  });

  it('handles match at end of text', () => {
    container.innerHTML = '<p>Hello World</p>';
    const marks = highlightMatches(container, 'World');
    expect(marks).toHaveLength(1);
    expect(container.querySelector('p')?.lastChild?.nodeName).toBe('MARK');
  });

  it('handles Chinese text search', () => {
    container.innerHTML = '<p>这是中文测试文本</p>';
    const marks = highlightMatches(container, '中文');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('中文');
  });

  it('handles overlapping patterns (adjacent matches)', () => {
    container.innerHTML = '<p>aaaa</p>';
    const marks = highlightMatches(container, 'aa');
    expect(marks).toHaveLength(2);
  });

  it('handles nested elements correctly', () => {
    container.innerHTML = '<div><span>Hello</span> <strong>World</strong></div>';
    const marks = highlightMatches(container, 'Hello');
    expect(marks).toHaveLength(1);
  });
});
