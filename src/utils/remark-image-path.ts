import { visit } from 'unist-util-visit';
import type { Root, Image, Parent } from 'mdast';

function escAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Remark plugin: converts .md file embeds (![](img/file.md)) to placeholder text.
 * Converts /img/ images to raw <img> HTML to bypass Astro's asset pipeline,
 * which can't handle complex SVGs (e.g. draw.io exports).
 */
export function remarkImagePath() {
  return (tree: Root) => {
    visit(tree, 'image', (node: Image, index: number | undefined, parent: Parent | undefined) => {
      const url: string = node.url || '';

      // Skip external URLs and data URIs
      if (url.startsWith('http') || url.startsWith('data:')) return;

      // Convert /img/ images to raw <img> HTML to bypass Astro asset pipeline
      if ((url.startsWith('/img/') || url.startsWith('img/')) && index !== undefined && parent) {
        const src = url.startsWith('/') ? url : `/${url}`;
        const alt = escAttr(node.alt || '');
        parent.children[index] = {
          type: 'html',
          value: `<img src="${src}" alt="${alt}" />`,
        };
        return;
      }

      // Handle .md file embeds (Obsidian transclusion)
      if (url.endsWith('.md')) {
        if (index === undefined || !parent) return;
        const altText = node.alt || url;
        parent.children[index] = {
          type: 'html',
          value: `<div class="embed-missing"><span class="embed-missing-hint">[embedded: ${altText}]</span></div>`,
        };
        return;
      }
    });
  };
}
