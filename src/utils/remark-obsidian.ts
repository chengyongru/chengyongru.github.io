import { visit } from 'unist-util-visit';
import type { Root, Parent, BlockContent } from 'mdast';

/**
 * Remark plugin: unified Obsidian syntax transformations.
 *
 * Handles:
 * 1. %%comments%% → removed
 * 2. ==highlights== → <mark> elements
 * 3. > [!type] callouts → data-callout attributes + emoji titles (supports +/- for fold)
 * 4. Internal .md links → /blog/{slug}/ (SEO-friendly, server-side)
 *
 * Execution order matters: comments → highlights → callouts → links.
 */

const CALLOUT_ICONS: Record<string, string> = {
  note: '\u2139\uFE0F', tip: '\uD83D\uDCA1', summary: '\uD83D\uDCCB', seealso: '\uD83D\uDD17',
  abstract: '\uD83D\uDCDD', info: '\u2139\uFE0F', todo: '\u2611\uFE0F', warning: '\u26A0\uFE0F',
  danger: '\uD83D\uDEAB', bug: '\uD83D\uDC1B', example: '\uD83D\uDCA1', quote: '\uD83D\uDCAC',
  success: '\u2705', question: '\u2753', failure: '\u274C', theorem: '\u25B3',
};

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

export function remarkObsidian() {
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
      const icon = CALLOUT_ICONS[calloutType] || '\uD83D\uDCCC';
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
        children: [{ type: 'text', value: `${icon} ${titleText}` }],
        data: { hProperties: { 'data-callout-title': '' } },
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
          value: `<summary>${icon} ${titleText}</summary>`,
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

    // 4. Rewrite internal .md links → /blog/{slug}/
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
