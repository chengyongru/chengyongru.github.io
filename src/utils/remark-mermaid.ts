import { visit } from 'unist-util-visit';
import type { Root, Code, Parent } from 'mdast';

/**
 * Remark plugin: converts ```mermaid code blocks into
 * <pre class="mermaid">...</pre> elements so that:
 * 1. Shiki doesn't try to syntax-highlight them
 * 2. The mermaid library can render them client-side
 */
export function remarkMermaid() {
  return (tree: Root) => {
    visit(tree, 'code', (node: Code, index: number | undefined, parent: Parent | undefined) => {
      if (index === undefined || !parent) return;
      if (node.lang !== 'mermaid') return;

      parent.children[index] = {
        type: 'html',
        value: `<pre class="mermaid">${node.value}</pre>`,
      };
    });
  };
}
