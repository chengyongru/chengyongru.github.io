import { describe, expect, it } from 'vitest';
import { selectHomePosts } from '../home';
import type { PostMeta } from '../types';

function post(overrides: Partial<PostMeta> & Pick<PostMeta, 'slug'>): PostMeta {
  return {
    title: overrides.slug,
    date: '2026-01-01T00:00:00.000Z',
    tags: [],
    reading_time: 1,
    ...overrides,
  };
}

const samplePosts: PostMeta[] = [
  post({ slug: 'index', title: 'About', date: '2026-01-07T00:00:00.000Z' }),
  post({ slug: 'notes/recent', title: 'Recent', date: '2026-01-06T00:00:00.000Z' }),
  post({ slug: 'notes/manual', title: 'Manual', date: '2026-01-01T00:00:00.000Z' }),
  post({ slug: 'notes/ranked-b', title: 'Ranked B', date: '2026-01-04T00:00:00.000Z', featured: true, featuredRank: 2 }),
  post({ slug: 'notes/ranked-a', title: 'Ranked A', date: '2026-01-03T00:00:00.000Z', featured: true, featuredRank: 1 }),
  post({ slug: 'notes/unranked-new', title: 'Unranked New', date: '2026-01-05T00:00:00.000Z', featured: true }),
  post({ slug: 'notes/unranked-old', title: 'Unranked Old', date: '2026-01-02T00:00:00.000Z', featured: true }),
];

function slugs(posts: PostMeta[]): string[] {
  return posts.map(item => item.slug);
}

describe('selectHomePosts', () => {
  it('pins valid manual slugs first and ignores missing slugs', () => {
    const result = selectHomePosts(
      samplePosts,
      ['missing/post', 'notes/manual', 'NOTES/RANKED-B'],
      { featuredLimit: 3, recentLimit: 2 },
    );

    expect(slugs(result.featured)).toEqual([
      'notes/manual',
      'notes/ranked-b',
      'notes/ranked-a',
    ]);
    expect(slugs(result.recent)).toEqual([
      'notes/recent',
      'notes/unranked-new',
    ]);
  });

  it('uses frontmatter featured posts ordered by rank then date', () => {
    const result = selectHomePosts(samplePosts, [], { featuredLimit: 4, recentLimit: 1 });

    expect(slugs(result.featured)).toEqual([
      'notes/ranked-a',
      'notes/ranked-b',
      'notes/unranked-new',
      'notes/unranked-old',
    ]);
    expect(slugs(result.recent)).toEqual(['notes/recent']);
  });

  it('falls back to recent posts when no featured sources exist', () => {
    const posts = [
      post({ slug: 'index', title: 'About' }),
      post({ slug: 'notes/first', date: '2026-01-03T00:00:00.000Z' }),
      post({ slug: 'notes/second', date: '2026-01-02T00:00:00.000Z' }),
    ];

    const result = selectHomePosts(posts, [], { featuredLimit: 3, recentLimit: 4 });

    expect(slugs(result.featured)).toEqual(['notes/first', 'notes/second']);
    expect(result.recent).toEqual([]);
  });

  it('falls through missing manual slugs to frontmatter and recent fallback', () => {
    const result = selectHomePosts(samplePosts, ['missing/post'], { featuredLimit: 5, recentLimit: 4 });

    expect(slugs(result.featured)).toEqual([
      'notes/ranked-a',
      'notes/ranked-b',
      'notes/unranked-new',
      'notes/unranked-old',
      'notes/recent',
    ]);
  });

  it('handles an empty post list', () => {
    const result = selectHomePosts([], ['missing/post']);

    expect(result.featured).toEqual([]);
    expect(result.recent).toEqual([]);
  });
});
