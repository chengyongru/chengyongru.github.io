import { visit } from 'unist-util-visit';

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
  success: '\u2705', question: '\u2753', failure: '\u274C',
};

/**
 * Slugify to match Astro's generateId in content.config.ts:
 * decodeURIComponent → remove .md → lowercase → spaces→hyphens → remove double quotes
 * Note: generateId does NOT replace spaces with hyphens, but the content filenames
 * themselves don't contain spaces (they use hyphens), so this is safe in practice.
 */
function slugify(name: string): string {
  return decodeURIComponent(name)
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/"/g, '');
}

export function remarkObsidian() {
  return (tree: any) => {
    // 1. Remove %%comments%%
    // Collect indices to remove, then splice in reverse to avoid index shifts
    const toRemove: Array<{ parent: any; index: number }> = [];

    visit(tree, 'html', (node: any, index: number | undefined, parent: any) => {
      if (index === undefined || !parent) return;
      node.value = node.value.replace(/%%[\s\S]*?%%/g, '');
      if (!node.value.trim()) {
        toRemove.push({ parent, index });
      }
    });

    visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
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

    // 2. ==highlights== → <mark> (single-pass with direct splice)
    const highlightReplacements: Array<{ parent: any; index: number; nodes: any[] }> = [];

    visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
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

    // Apply replacements in reverse order to preserve indices
    highlightReplacements.reverse().forEach(({ parent, index, nodes }) => {
      parent.children.splice(index, 1, ...nodes);
    });

    // 3. Transform > [!type] callout blockquotes
    // Supports: > [!type] (default), > [!type]+ (expanded), > [!type]- (collapsed)
    visit(tree, 'blockquote', (node: any) => {
      const firstChild = node.children?.[0];
      if (!firstChild || firstChild.type !== 'paragraph') return;

      const firstText = firstChild.children?.[0];
      if (!firstText || firstText.type !== 'text') return;

      const match = firstText.value.match(/^\[!(\w+)\]([+-]?)\s*([\s\S]*)/);
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

      // Rebuild children: title paragraph + optional body paragraphs
      const titleEl: any = {
        type: 'paragraph',
        children: [{ type: 'text', value: `${icon} ${titleText}` }],
        data: { hProperties: { 'data-callout-title': '' } },
      };

      const otherChildren = node.children.slice(1);
      const bodyChildren = bodyText
        ? [{ type: 'paragraph' as const, children: [{ type: 'text' as const, value: bodyText }] }, ...otherChildren]
        : otherChildren;

      if (isFoldable) {
        // Wrap in <details>/<summary> for collapsible callouts
        const summaryEl: any = {
          type: 'html',
          value: `<summary>${icon} ${titleText}</summary>`,
        };
        // Insert opening/closing details tags
        node.children = [
          { type: 'html', value: `<details${defaultOpen ? ' open' : ''}>` },
          summaryEl,
          ...bodyChildren,
          { type: 'html', value: '</details>' },
        ];
        node.data.hProperties = { 'data-callout': calloutType, 'data-callout-fold': '' };
      } else {
        node.children = [titleEl, ...bodyChildren];
      }
    });

    // 4. Rewrite internal .md links → /blog/{slug}/
    visit(tree, 'link', (node: any) => {
      const href: string = node.url || '';
      if (!href.endsWith('.md') && !/\.md#/.test(href)) return;
      if (href.startsWith('http') || href.startsWith('/') || href.startsWith('data:')) return;

      const [path, hash] = href.split('#');
      const slug = slugify(path);
      node.url = `/blog/${slug}/${hash ? `#${hash}` : ''}`;
    });
  };
}
