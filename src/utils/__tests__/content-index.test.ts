import { describe, expect, it } from 'vitest';
import { generateContentIndex } from '../content-index';

describe('generateContentIndex', () => {
  it('emits featured metadata from frontmatter', async () => {
    const index = await generateContentIndex([
      {
        id: 'notebook/featured-note',
        data: {
          publish: true,
          title: 'Featured Note',
          date: new Date('2026-01-01T00:00:00.000Z'),
          tags: ['docs'],
          draft: false,
          featured: true,
          featuredRank: 7,
        },
        body: 'A reusable featured note.',
      },
    ] as any);

    expect(index.posts).toHaveLength(1);
    expect(index.posts[0]).toMatchObject({
      slug: 'notebook/featured-note',
      featured: true,
      featuredRank: 7,
      excerpt: 'A reusable featured note.',
    });
    expect(index.posts[0]).not.toHaveProperty('text');
  });

  it('keeps the public index slim by emitting excerpts instead of full text', async () => {
    const longBody = `${'Searchable content '.repeat(80)}tail marker`;
    const index = await generateContentIndex([
      {
        id: 'notebook/long-note',
        data: {
          publish: true,
          title: 'Long Note',
          date: new Date('2026-01-03T00:00:00.000Z'),
          tags: ['perf'],
          draft: false,
          featured: false,
        },
        body: longBody,
      },
    ] as any);

    expect(index.posts[0].excerpt).toBeDefined();
    expect(index.posts[0].excerpt!.length).toBeLessThanOrEqual(240);
    expect(index.posts[0].excerpt).not.toContain('tail marker');
    expect(index.posts[0]).not.toHaveProperty('text');
  });

  it('indexes arbitrary nested content directories with empty descriptions', async () => {
    const index = await generateContentIndex([
      {
        id: 'projects/research/deep-note',
        data: {
          publish: true,
          title: 'Deep Note',
          date: new Date('2026-01-02T00:00:00.000Z'),
          tags: ['docs'],
          draft: false,
          featured: false,
        },
        body: 'A note in a custom nested directory.',
      },
    ] as any);

    expect(index.posts.map(post => post.slug)).toEqual(['projects/research/deep-note']);
    expect(index.directories).toMatchObject({
      'projects/': '',
      'projects/research/': '',
    });
  });
});
