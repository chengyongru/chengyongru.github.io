import { describe, expect, it } from 'vitest';
import type { PublishConfig } from '../../config';
import {
  isPublishableByTags,
  isPublishablePost,
  normalizePublishTags,
} from '../publication';

const rules: PublishConfig = {
  requireTags: true,
  blockedTags: ['todo'],
  alwaysPublishSlugs: ['index'],
};

describe('publication rules', () => {
  it('normalizes tags for publication comparisons', () => {
    expect(normalizePublishTags([' ML ', '#Todo', ''])).toEqual(['ml', 'todo']);
  });

  it('rejects posts with no tags when requireTags is enabled', () => {
    expect(isPublishableByTags([], rules)).toBe(false);
    expect(isPublishableByTags(undefined, rules)).toBe(false);
  });

  it('rejects posts with blocked tags case-insensitively', () => {
    expect(isPublishableByTags(['ML', 'ToDo'], rules)).toBe(false);
    expect(isPublishableByTags(['#todo'], rules)).toBe(false);
  });

  it('allows posts with non-blocked tags', () => {
    expect(isPublishableByTags(['ML'], rules)).toBe(true);
  });

  it('keeps configured slugs public even when they have no tags', () => {
    expect(isPublishablePost({ id: 'index', data: { tags: [] } }, rules)).toBe(true);
  });

  it('still rejects drafts and blocked paths', () => {
    expect(isPublishablePost({ id: 'notebook/test', data: { draft: true, tags: ['ML'] } }, rules)).toBe(false);
    expect(isPublishablePost({ id: 'clippings/test', data: { tags: ['ML'] } }, rules)).toBe(false);
  });

  it('rejects private dotfiles and dot-directories even with publishable tags', () => {
    expect(isPublishablePost({ id: '.wiki-schema', data: { tags: ['docs'] } }, rules)).toBe(false);
    expect(isPublishablePost({ id: 'notebook/.private', data: { tags: ['docs'] } }, rules)).toBe(false);
    expect(isPublishablePost({ id: '.obsidian/plugins/config', data: { tags: ['docs'] } }, rules)).toBe(false);
    expect(isPublishablePost({ id: 'projects/.drafts/post', data: { tags: ['docs'] } }, rules)).toBe(false);
  });

  it('is safe to use as an Array.filter predicate', () => {
    const posts = [
      { id: 'notebook/public', data: { tags: ['ML'] } },
      { id: 'notebook/private', data: { tags: ['todo'] } },
    ];

    expect(posts.filter(isPublishablePost).map(post => post.id)).toEqual(['notebook/public']);
  });
});
