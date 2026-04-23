import { visit } from 'unist-util-visit';

/**
 * Remark plugin: converts ```mermaid code blocks into
 * <pre class="mermaid">...</pre> elements so that:
 * 1. Shiki doesn't try to syntax-highlight them
 * 2. The mermaid library can render them client-side
 */
export function remarkMermaid() {
  return (tree: any) => {
    visit(tree, 'code', (node: any, index: number | undefined, parent: any) => {
      if (index === undefined || !parent) return;
      if (node.lang !== 'mermaid') return;

      // Replace the code node with a raw HTML node
      parent.children[index] = {
        type: 'html',
        value: `<pre class="mermaid">${node.value}</pre>`,
      };
    });
  };
}
