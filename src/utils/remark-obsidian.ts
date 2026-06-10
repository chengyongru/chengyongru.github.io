import fs from 'node:fs';
import path from 'node:path';
import { visit } from 'unist-util-visit';
import type { Root, Parent, BlockContent, Link, Image } from 'mdast';
import { shouldFilterSlug } from '../terminal/constants';

/**
 * Remark plugin: unified Obsidian syntax transformations.
 *
 * Handles:
 * 1. %%comments%% → removed
 * 2. ==highlights== → <mark> elements
 * 3. > [!type] callouts → data-callout attributes + terminal labels (supports +/- for fold)
 * 4. [[wiki links]] → /blog/{resolved-slug}/
 * 5. Internal .md links → /blog/{slug}/ (SEO-friendly, server-side)
 *
 * Execution order matters: comments → highlights → callouts → wiki links → .md links.
 */

interface RemarkObsidianOptions {
  /**
   * Root directory for resolving bare wiki links such as [[梯度下降]].
   * Set to false in tests to disable file-system lookup.
   */
  contentRoot?: string | false;
  /** Optional deterministic map for tests or non-file-system renderers. */
  wikiLinkMap?: Record<string, string>;
}

type WikiLinkIndex = Map<string, string | null>;

const CALLOUT_LABELS: Record<string, string> = {
  note: 'NOTE',
  info: 'INFO',
  tip: 'TIP',
  todo: 'TODO',
  summary: 'SUM',
  abstract: 'ABS',
  tldr: 'TLDR',
  seealso: 'REF',
  question: 'Q',
  warning: 'WARN',
  danger: 'DANGER',
  bug: 'BUG',
  failure: 'FAIL',
  success: 'OK',
  example: 'EXAMPLE',
  quote: 'QUOTE',
  theorem: 'THM',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function calloutLabel(type: string): string {
  return CALLOUT_LABELS[type] || type.toUpperCase();
}

/**
 * Slugify to match Astro's generateId in content.config.ts:
 * decodeURIComponent → remove .md → lowercase → spaces→hyphens → remove double quotes
 */
function slugify(name: string): string {
  return decodeURIComponent(name)
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/"/g, '');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeWikiKey(value: string): string {
  return safeDecode(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.md$/i, '')
    .toLowerCase();
}

function slugifyHeading(value: string): string {
  return safeDecode(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/"/g, '');
}

function addWikiIndexEntry(index: WikiLinkIndex, key: string, slug: string) {
  const normalized = normalizeWikiKey(key);
  if (!normalized) return;

  const existing = index.get(normalized);
  if (existing === undefined) {
    index.set(normalized, slug);
  } else if (existing !== slug) {
    // Ambiguous basenames should fall back to the literal target instead of
    // silently linking to the wrong article.
    index.set(normalized, null);
  }
}

function collectMarkdownFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

const wikiIndexCache = new Map<string, WikiLinkIndex>();

function buildWikiLinkIndex(options: RemarkObsidianOptions): WikiLinkIndex {
  if (options.wikiLinkMap) {
    const index: WikiLinkIndex = new Map();
    for (const [key, slug] of Object.entries(options.wikiLinkMap)) {
      addWikiIndexEntry(index, key, normalizeWikiKey(slug));
    }
    return index;
  }

  if (options.contentRoot === false) return new Map();

  const root = path.resolve(process.cwd(), options.contentRoot || 'content');
  const cached = wikiIndexCache.get(root);
  if (cached) return cached;

  const index: WikiLinkIndex = new Map();
  for (const file of collectMarkdownFiles(root)) {
    const relativePath = path.relative(root, file).split(path.sep).join('/');
    const slug = relativePath.replace(/\.md$/i, '').toLowerCase();
    if (shouldFilterSlug(slug)) continue;

    const basename = path.posix.basename(slug);
    addWikiIndexEntry(index, slug, slug);
    addWikiIndexEntry(index, basename, slug);
  }

  wikiIndexCache.set(root, index);
  return index;
}

function splitFirst(value: string, delimiter: string): [string, string | undefined] {
  const index = value.indexOf(delimiter);
  if (index === -1) return [value, undefined];
  return [value.slice(0, index), value.slice(index + delimiter.length)];
}

function parseWikiLink(raw: string) {
  const [targetWithHash, alias] = splitFirst(raw.trim(), '|');
  const [target, hash] = splitFirst(targetWithHash.trim(), '#');
  const cleanTarget = target.trim();
  const cleanHash = hash?.trim();
  const cleanAlias = alias?.trim();
  const fallbackLabel = cleanTarget
    ? path.posix.basename(cleanTarget.replace(/\\/g, '/').replace(/\.md$/i, ''))
    : cleanHash;

  return {
    target: cleanTarget,
    hash: cleanHash,
    label: cleanAlias || fallbackLabel || raw,
  };
}

function wikiHref(target: string, hash: string | undefined, index: WikiLinkIndex): string {
  const fragment = hash ? `#${slugifyHeading(hash)}` : '';
  if (!target) return fragment;

  const key = normalizeWikiKey(target);
  const slug = index.get(key) ?? key;
  return `/blog/${slug}/${fragment}`;
}

function isImageTarget(target: string): boolean {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(target);
}

function wikiEmbedNode(target: string, label: string): Image | { type: 'html'; value: string } {
  if (isImageTarget(target)) {
    return {
      type: 'image',
      url: target,
      alt: label,
    };
  }

  return {
    type: 'html',
    value: `<div class="embed-missing"><span class="embed-missing-hint">[embedded: ${escapeHtml(label)}]</span></div>`,
  };
}

function replaceWikiLinks(parent: Parent, index: WikiLinkIndex) {
  const nextChildren: any[] = [];
  let changed = false;
  const wikiLinkPattern = /(!?)\[\[([^\]\n]+?)\]\]/g;

  for (const child of parent.children) {
    if (child.type !== 'text') {
      nextChildren.push(child);
      continue;
    }

    const value = child.value;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    wikiLinkPattern.lastIndex = 0;

    while ((match = wikiLinkPattern.exec(value)) !== null) {
      const [raw, bang, rawTarget] = match;
      if (match.index > lastIndex) {
        nextChildren.push({ type: 'text', value: value.slice(lastIndex, match.index) });
      }

      const parsed = parseWikiLink(rawTarget);
      if (bang) {
        nextChildren.push(wikiEmbedNode(parsed.target, parsed.label));
      } else {
        const link: Link = {
          type: 'link',
          url: wikiHref(parsed.target, parsed.hash, index),
          data: { hProperties: { class: 'link-page' } },
          children: [{ type: 'text', value: parsed.label }],
        };
        nextChildren.push(link);
      }

      changed = true;
      lastIndex = match.index + raw.length;
    }

    if (lastIndex < value.length) {
      nextChildren.push({ type: 'text', value: value.slice(lastIndex) });
    }
  }

  if (changed) {
    parent.children = nextChildren;
  }
}

export function remarkObsidian(options: RemarkObsidianOptions = {}) {
  const wikiIndex = buildWikiLinkIndex(options);

  return (tree: Root) => {
    // 1. Remove %%comments%%
    const toRemove: Array<{ parent: Parent; index: number }> = [];

    visit(tree, 'html', (node, index, parent) => {
      if (index === undefined || !parent) return;
      node.value = node.value.replace(/%%[\s\S]*?%%/g, '');
      if (!node.value.trim()) {
        toRemove.push({ parent, index });
      }
    });

    visit(tree, 'text', (node, index, parent) => {
      if (index === undefined || !parent) return;
      node.value = node.value.replace(/%%[\s\S]*?%%/g, '');
      if (!node.value) {
        toRemove.push({ parent, index });
      }
    });

    // Remove empty nodes in reverse order to preserve indices
    toRemove.reverse().forEach(({ parent, index }) => {
      parent.children.splice(index, 1);
    });

    // 2. ==highlights== → <mark>
    const highlightReplacements: Array<{ parent: Parent; index: number; nodes: any[] }> = [];

    visit(tree, 'text', (node, index, parent) => {
      if (index === undefined || !parent) return;
      if (typeof node.value !== 'string') return;

      const parts: any[] = [];
      let lastIndex = 0;
      let hasMatch = false;

      node.value.replace(/==(.+?)==/g, (match: string, content: string, offset: number) => {
        hasMatch = true;
        if (offset > lastIndex) {
          parts.push({ type: 'text', value: node.value.slice(lastIndex, offset) });
        }
        parts.push({
          type: 'html',
          value: `<mark>${content}</mark>`,
        });
        lastIndex = offset + match.length;
        return match;
      });

      if (!hasMatch) return;

      if (lastIndex < node.value.length) {
        parts.push({ type: 'text', value: node.value.slice(lastIndex) });
      }

      if (parts.length > 0) {
        highlightReplacements.push({ parent, index, nodes: parts });
      }
    });

    highlightReplacements.reverse().forEach(({ parent, index, nodes }) => {
      parent.children.splice(index, 1, ...nodes);
    });

    // 3. Transform > [!type] callout blockquotes
    visit(tree, 'blockquote', (node) => {
      const firstChild = node.children?.[0];
      if (!firstChild || firstChild.type !== 'paragraph') return;

      const firstText = firstChild.children?.[0];
      if (!firstText || firstText.type !== 'text') return;

      const match = firstText.value.match(/^\[!(\w+)\]([+-]?)[ \t]*([\s\S]*)/);
      if (!match) return;

      const [, type, fold, rest] = match;
      const calloutType = type.toLowerCase();
      const label = calloutLabel(calloutType);
      const isFoldable = fold === '-' || fold === '+';
      const defaultOpen = fold === '+';

      // Split title from body at first newline
      const nlIdx = rest.search(/\r?\n/);
      let titleText: string;
      let bodyText: string | null = null;
      if (nlIdx > -1) {
        titleText = rest.substring(0, nlIdx).trim();
        bodyText = rest.substring(nlIdx).trim();
      } else {
        titleText = rest.trim();
      }
      node.data = node.data || {};
      node.data.hProperties = { 'data-callout': calloutType };

      const titleEl = {
        type: 'paragraph',
        children: [{ type: 'text', value: titleText }],
        data: { hProperties: { 'data-callout-title': '', 'data-callout-label': label } },
      };

      const otherChildren = node.children.slice(1);
      // Remaining inline elements in the declaration paragraph (handles markdown lazy continuation
      // where body content stays in the same paragraph as the [!type] line)
      const remainingInline = firstChild.children.slice(1);

      const bodyChildren = bodyText
        ? [{ type: 'paragraph' as const, children: [{ type: 'text' as const, value: bodyText }] }, ...otherChildren, ...remainingInline]
        : [...otherChildren, ...remainingInline];

      if (isFoldable) {
        const summaryEl = {
          type: 'html' as const,
          value: `<summary data-callout-label="${escapeHtml(label)}"><span class="callout-token">[${escapeHtml(label)}]</span>${escapeHtml(titleText)}</summary>`,
        };
        node.children = [
          { type: 'html' as const, value: `<details${defaultOpen ? ' open' : ''}>` },
          summaryEl,
          ...bodyChildren,
          { type: 'html' as const, value: '</details>' },
        ] as BlockContent[];
        node.data.hProperties = { 'data-callout': calloutType, 'data-callout-fold': '' };
      } else {
        node.children = [titleEl, ...bodyChildren] as BlockContent[];
      }
    });

    // 4. Rewrite Obsidian wiki links → /blog/{slug}/
    visit(tree, (node: any) => {
      if (!Array.isArray(node.children)) return;
      if (node.type === 'link' || node.type === 'linkReference') return;
      replaceWikiLinks(node as Parent, wikiIndex);
    });

    // 5. Rewrite internal .md links → /blog/{slug}/
    visit(tree, 'link', (node) => {
      const href: string = node.url || '';
      if (!href.endsWith('.md') && !/\.md#/.test(href)) return;
      if (href.startsWith('http') || href.startsWith('/') || href.startsWith('data:')) return;

      const [path, hash] = href.split('#');
      const slug = slugify(path);
      node.url = `/blog/${slug}/${hash ? `#${hash}` : ''}`;
    });
  };
}
