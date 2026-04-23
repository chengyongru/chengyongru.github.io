import { visit } from 'unist-util-visit';

/**
 * Remark plugin: converts .md file embeds (![](img/file.md)) to placeholder text.
 * Converts /img/ images to raw <img> HTML to bypass Astro's asset pipeline,
 * which can't handle complex SVGs (e.g. draw.io exports).
 */
export function remarkImagePath() {
  return (tree: any) => {
    visit(tree, 'image', (node: any, index: number | undefined, parent: any) => {
      const url: string = node.url || '';

      // Skip external URLs and data URIs
      if (url.startsWith('http') || url.startsWith('data:')) return;

      // Convert /img/ images to raw <img> HTML to bypass Astro asset pipeline
      if (url.startsWith('/img/') && index !== undefined && parent) {
        const alt = node.alt || '';
        parent.children[index] = {
          type: 'html',
          value: `<img src="${url}" alt="${alt}" />`,
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
