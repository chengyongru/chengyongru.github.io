import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { remarkObsidian } from '../remark-obsidian';

async function process(md: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkObsidian)
    .use(remarkStringify, { bullet: '-', fences: true })
    .process(md);
  return String(result);
}

async function processAst(md: string) {
  const tree = unified().use(remarkParse).parse(md);
  await unified().use(remarkObsidian).run(tree);
  return tree;
}

// ===== %%comments%% removal =====

describe('%%comments%% removal', () => {
  it('should remove inline comments', async () => {
    const md = 'Hello %%this is hidden%% world';
    const result = await process(md);
    expect(result).not.toContain('%%');
    expect(result).toContain('Hello');
    expect(result).toContain('world');
  });

  it('should remove multi-line comments', async () => {
    const md = 'Before %%line1\nline2%% after';
    const result = await process(md);
    expect(result).not.toContain('%%');
    expect(result).toContain('Before');
    expect(result).toContain('after');
  });

  it('should handle multiple comments in one line', async () => {
    const md = 'a %%x%% b %%y%% c';
    const result = await process(md);
    expect(result).not.toContain('%%');
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
  });

  it('should leave text without comments unchanged', async () => {
    const md = 'No comments here';
    const result = await process(md);
    expect(result).toContain('No comments here');
  });
});

// ===== ==highlights== → <mark> =====

describe('==highlights== conversion', () => {
  it('should convert ==text== to <mark>text</mark>', async () => {
    const tree = await processAst('This is ==highlighted== text');
    const html = findHtmlNodes(tree);
    expect(html.some((h: string) => h.includes('<mark>highlighted</mark>'))).toBe(true);
  });

  it('should handle multiple highlights', async () => {
    const tree = await processAst('==one== and ==two==');
    const html = findHtmlNodes(tree);
    const combined = html.join('');
    expect(combined).toContain('<mark>one</mark>');
    expect(combined).toContain('<mark>two</mark>');
  });

  it('should handle = in highlight content', async () => {
    const tree = await processAst('==a=b== test');
    const html = findHtmlNodes(tree);
    expect(html.some((h: string) => h.includes('<mark>a=b</mark>'))).toBe(true);
  });

  it('should leave text without highlights unchanged', async () => {
    const md = 'No highlights here';
    const tree = await processAst(md);
    const html = findHtmlNodes(tree);
    expect(html.join('')).not.toContain('<mark>');
  });
});

// ===== Callout transformation =====

describe('callout transformation', () => {
  it('should transform > [!note] to callout with data attribute', async () => {
    const tree = await processAst('> [!note] Title\n> Body text');
    const blockquote = tree.children.find(
      (c: any) => c.type === 'blockquote',
    ) as any;
    expect(blockquote).toBeDefined();
    expect(blockquote.data?.hProperties?.['data-callout']).toBe('note');
  });

  it('should transform > [!warning] callout', async () => {
    const tree = await processAst('> [!warning] Caution\n> Be careful');
    const blockquote = tree.children.find(
      (c: any) => c.type === 'blockquote',
    ) as any;
    expect(blockquote.data?.hProperties?.['data-callout']).toBe('warning');
  });

  it('should transform > [!tip] callout', async () => {
    const tree = await processAst('> [!tip] Hint\n> Try this');
    const blockquote = tree.children.find(
      (c: any) => c.type === 'blockquote',
    ) as any;
    expect(blockquote.data?.hProperties?.['data-callout']).toBe('tip');
  });

  it('should transform > [!danger] callout', async () => {
    const tree = await processAst('> [!danger] Stop\n> Do not proceed');
    const blockquote = tree.children.find(
      (c: any) => c.type === 'blockquote',
    ) as any;
    expect(blockquote.data?.hProperties?.['data-callout']).toBe('danger');
  });

  it('should include emoji icon in title', async () => {
    const tree = await processAst('> [!note] My Title\n> Body');
    const blockquote = tree.children.find(
      (c: any) => c.type === 'blockquote',
    ) as any;
    const titlePara = blockquote.children[0];
    const titleText = titlePara.children[0]?.value || '';
    // Should contain an emoji
    expect(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1FFFF}]/u.test(titleText)).toBe(true);
  });

  it('should handle callout without body', async () => {
    const tree = await processAst('> [!info] Just a title');
    const blockquote = tree.children.find(
      (c: any) => c.type === 'blockquote',
    ) as any;
    expect(blockquote).toBeDefined();
    expect(blockquote.data?.hProperties?.['data-callout']).toBe('info');
  });

  it('should not transform regular blockquote', async () => {
    const tree = await processAst('> Regular quote');
    const blockquote = tree.children.find(
      (c: any) => c.type === 'blockquote',
    ) as any;
    expect(blockquote?.data?.hProperties?.['data-callout']).toBeUndefined();
  });
});

// ===== Collapsible callouts =====

describe('collapsible callouts', () => {
  it('should transform > [!note]- as collapsed callout', async () => {
    const tree = await processAst('> [!note]- Title\n> Body');
    const bq = tree.children.find((c: any) => c.type === 'blockquote') as any;
    expect(bq).toBeDefined();
    expect(bq.data?.hProperties?.['data-callout']).toBe('note');
    expect(bq.data?.hProperties?.['data-callout-fold']).toBeDefined();
    const htmlNodes = findHtmlNodes(bq);
    expect(htmlNodes.some((h: string) => h.includes('<details>') && !h.includes('<details open'))).toBe(true);
    expect(htmlNodes.some((h: string) => h.includes('<summary>'))).toBe(true);
  });

  it('should transform > [!tip]+ as expanded callout', async () => {
    const tree = await processAst('> [!tip]+ Title\n> Body');
    const blockquote = tree.children.find(
      (c: any) => c.type === 'blockquote',
    ) as any;
    expect(blockquote.data?.hProperties?.['data-callout-fold']).toBeDefined();
    const htmlNodes = findHtmlNodes(blockquote);
    expect(htmlNodes.some((h: string) => h.includes('<details open>'))).toBe(true);
  });

  it('should leave non-foldable callout unchanged (no details)', async () => {
    const tree = await processAst('> [!note] Title\n> Body');
    const blockquote = tree.children.find(
      (c: any) => c.type === 'blockquote',
    ) as any;
    const htmlNodes = findHtmlNodes(blockquote);
    expect(htmlNodes.some((h: string) => h.includes('<details'))).toBe(false);
  });
});

// ===== Internal .md link rewriting =====

describe('internal .md link rewriting', () => {
  it('should rewrite .md links to /blog/{slug}/', async () => {
    const tree = await processAst('[link](notebook/ARIMA.md)');
    const link = tree.children[0]?.children?.[0] as any;
    expect(link.type).toBe('link');
    expect(link.url).toBe('/blog/notebook/arima/');
  });

  it('should rewrite .md links with hash', async () => {
    const tree = await processAst('[link](notebook/ARIMA.md#section)');
    const link = tree.children[0]?.children?.[0] as any;
    expect(link.url).toBe('/blog/notebook/arima/#section');
  });

  it('should not rewrite http links', async () => {
    const tree = await processAst('[external](https://example.com/doc.md)');
    const link = tree.children[0]?.children?.[0] as any;
    expect(link.url).toBe('https://example.com/doc.md');
  });

  it('should not rewrite absolute path links', async () => {
    const tree = await processAst('[absolute](/path/to/page)');
    const link = tree.children[0]?.children?.[0] as any;
    expect(link.url).toBe('/path/to/page');
  });

  it('should not rewrite non-.md links', async () => {
    const tree = await processAst('[image](img/photo.png)');
    const link = tree.children[0]?.children?.[0] as any;
    expect(link.url).toBe('img/photo.png');
  });

  it('should lowercase the slug', async () => {
    const tree = await processAst('[link](notebook/Dropout.md)');
    const link = tree.children[0]?.children?.[0] as any;
    expect(link.url).toBe('/blog/notebook/dropout/');
  });
});

// ===== Helper =====

function findHtmlNodes(node: any): string[] {
  const results: string[] = [];
  if (node.type === 'html') {
    results.push(node.value);
  }
  if (node.children) {
    for (const child of node.children) {
      results.push(...findHtmlNodes(child));
    }
  }
  return results;
}
