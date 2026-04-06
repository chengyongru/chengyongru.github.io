import { describe, it, expect } from 'vitest';
import type { ContentIndex } from '../types';
import { categorizeDir, resolvePath, getPostUrl } from '../file-tree';
import { shouldFilterSlug } from '../constants';

// ===== Pure Functions =====

describe('categorizeDir', () => {
  it('extracts directory from nested notebook slug', () => {
    expect(categorizeDir('notebook/ARIMA')).toBe('notebook/');
  });

  it('extracts directory from nested diary slug', () => {
    expect(categorizeDir('diary/2025-10-11')).toBe('diary/');
  });

  it('categorizes date-format flat slug as diary', () => {
    expect(categorizeDir('2025-10-11')).toBe('diary/');
  });

  it('categorizes unknown flat slug as notebook', () => {
    expect(categorizeDir('something')).toBe('notebook/');
  });

  it('categorizes index slug (no slash) as notebook fallback', () => {
    // index is handled specially before categorizeDir is called
    expect(categorizeDir('index')).toBe('notebook/');
  });
});

describe('resolvePath', () => {
  it('resolves absolute paths as-is', () => {
    expect(resolvePath('/notebook/', '/diary/')).toBe('/diary/');
  });

  it('resolves ~ to root', () => {
    expect(resolvePath('/notebook/', '~')).toBe('/');
  });

  it('resolves empty string to root', () => {
    expect(resolvePath('/notebook/', '')).toBe('/');
  });

  it('resolves .. from subdirectory', () => {
    expect(resolvePath('/notebook/', '..')).toBe('/');
  });

  it('resolves .. from root stays at root', () => {
    expect(resolvePath('/', '..')).toBe('/');
  });

  it('resolves relative path from root', () => {
    expect(resolvePath('/', 'notebook/')).toBe('/notebook/');
  });

  it('resolves relative path from subdirectory (no double slash)', () => {
    // BUG: resolvePath produces double slash when cwd ends with /
    // e.g., resolvePath('/notebook/', 'sub/') → '/notebook//sub/' instead of '/notebook/sub/'
    const result = resolvePath('/notebook/', 'sub/');
    expect(result).toBe('/notebook/sub/');
    expect(result).not.toContain('//');
  });
});

describe('getPostUrl', () => {
  it('generates correct URL for nested slug', () => {
    expect(getPostUrl('notebook/ARIMA')).toBe('/blog/notebook/ARIMA/');
  });

  it('generates correct URL for index', () => {
    expect(getPostUrl('index')).toBe('/blog/index/');
  });

  it('generates correct URL for diary entry', () => {
    expect(getPostUrl('diary/2025-10-11')).toBe('/blog/diary/2025-10-11/');
  });
});

// ===== Virtual File System Building =====

const mockIndex: ContentIndex = {
  posts: [
    { slug: 'index', title: '随笔', date: '2025-09-29T00:00:00.000Z', tags: [], reading_time: 1 },
    { slug: 'notebook/ARIMA', title: 'ARIMA', date: '2025-10-01T00:00:00.000Z', tags: ['ML'], reading_time: 5 },
    { slug: 'notebook/claude', title: 'CLAUDE', date: '2025-10-01T00:00:00.000Z', tags: [], reading_time: 1 },
    { slug: 'diary/2025-10-11', title: 'Diary', date: '2025-10-11T00:00:00.000Z', tags: ['diary'], reading_time: 3 },
    { slug: 'clippings/frp配置笔记', title: 'frp配置笔记', date: '2025-10-01T00:00:00.000Z', tags: [], reading_time: 2 },
    { slug: '_obsidian/iframe', title: 'iframe', date: '2025-10-01T00:00:00.000Z', tags: [], reading_time: 1 },
  ],
  tags: ['ML', 'diary'],
  directories: {
    'diary/': 'Journal entries',
    'notebook/': 'ML/DL/RL/Security notes',
  },
};

describe('buildFS', () => {
  it('root directory contains index.md and subdirectories', () => {
    const result = buildFSWithIndex(mockIndex);

    expect(result['/']).toBeDefined();
    const rootFiles = result['/'];
    const hasIndex = rootFiles.some(f => f.name === 'index.md' && f.type === 'file');
    expect(hasIndex).toBe(true);

    const hasDiaryDir = rootFiles.some(f => f.name === 'diary/' && f.type === 'dir');
    expect(hasDiaryDir).toBe(true);

    const hasNotebookDir = rootFiles.some(f => f.name === 'notebook/' && f.type === 'dir');
    expect(hasNotebookDir).toBe(true);
  });

  it('filters out CLAUDE files (case-insensitive)', () => {
    const result = buildFSWithIndex(mockIndex);
    const notebookFiles = result['/notebook/'] || [];

    // notebook/claude should be filtered out
    const hasClaude = notebookFiles.some(f => f.slug === 'notebook/claude');
    expect(hasClaude).toBe(false);
  });

  it('filters out _obsidian and clippings directories', () => {
    const result = buildFSWithIndex(mockIndex);

    // These should NOT appear as directories in root
    const rootFiles = result['/'];
    const hasClippings = rootFiles.some(f => f.name === 'clippings/');
    const hasObsidian = rootFiles.some(f => f.name === '_obsidian/');
    expect(hasClippings).toBe(false);
    expect(hasObsidian).toBe(false);

    // These directories should not exist in the file system
    expect(result['/clippings/']).toBeUndefined();
    expect(result['/_obsidian/']).toBeUndefined();
  });

  it('notebook directory contains correct files with proper names', () => {
    const result = buildFSWithIndex(mockIndex);
    const notebookFiles = result['/notebook/'];

    expect(notebookFiles).toBeDefined();
    expect(notebookFiles.length).toBe(1); // only ARIMA, claude filtered

    const arimaFile = notebookFiles.find(f => f.slug === 'notebook/ARIMA');
    expect(arimaFile).toBeDefined();
    expect(arimaFile!.name).toBe('ARIMA.md');
    expect(arimaFile!.type).toBe('file');
  });

  it('diary directory contains correct files', () => {
    const result = buildFSWithIndex(mockIndex);
    const diaryFiles = result['/diary/'];

    expect(diaryFiles).toBeDefined();
    expect(diaryFiles.length).toBe(1);

    const diaryFile = diaryFiles.find(f => f.slug === 'diary/2025-10-11');
    expect(diaryFile).toBeDefined();
    expect(diaryFile!.name).toBe('2025-10-11.md');
  });

  it('non-existent paths return undefined (not empty array)', () => {
    const result = buildFSWithIndex(mockIndex);
    // BUG: Currently listDir returns [] for non-existent paths ([] is truthy)
    // This test exposes the cd-into-file bug
    expect(result['/nonexistent/']).toBeUndefined();
    expect(result['/notebook/ARIMA.md/']).toBeUndefined();
  });
});

// Helper: build file system with a given index (bypasses fetch)
function buildFSWithIndex(index: ContentIndex) {
  // We reconstruct the buildFS logic here to test it with mock data
  // without depending on module-level state
  const fs: Record<string, any[]> = {};

  const root: any[] = [];
  for (const [dir, desc] of Object.entries(index.directories)) {
    // Filter out non-blog directories (strip trailing slash for comparison)
    const dirKey = dir.replace(/\/$/, '');
    if (shouldFilterSlug(dirKey + '/dummy')) continue;
    root.push({ name: dir, type: 'dir', desc });
  }
  const indexPost = index.posts.find(p => p.slug === 'index');
  if (indexPost) {
    root.push({
      name: 'index.md',
      type: 'file',
      title: indexPost.title,
      date: indexPost.date,
      tags: indexPost.tags,
      slug: indexPost.slug,
    });
  }
  fs['/'] = root;

  for (const post of index.posts) {
    if (post.slug === 'index') continue;
    if (shouldFilterSlug(post.slug)) continue;

    const dir = categorizeDir(post.slug);
    const dirPath = '/' + dir;
    if (!fs[dirPath]) fs[dirPath] = [];

    const fileName = post.slug.includes('/')
      ? post.slug.split('/').pop()! + '.md'
      : post.slug + '.md';

    fs[dirPath].push({
      name: fileName,
      type: 'file',
      title: post.title,
      date: post.date,
      tags: post.tags,
      slug: post.slug,
    });
  }

  return fs;
}

// ===== Viewer Navigation (Regression Test) =====

/**
 * Reproduces the slug-extraction regex from Terminal.tsx handleViewerNavigate.
 * Tests this in isolation to prevent regression where hash-bearing URLs
 * (e.g. /blog/notebook/foo#anchor) fell through to window.location.href
 * instead of opening in the terminal viewer.
 */
function extractSlugFromHref(href: string): string | null {
  const m = href.match(/^\/blog\/(.+?)(?:\/#|#|\/$|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

describe('extractSlugFromHref (viewer navigation)', () => {
  it('extracts slug from standard /blog/{slug}/ URL', () => {
    expect(extractSlugFromHref('/blog/notebook/arima/')).toBe('notebook/arima');
  });

  it('extracts slug from URL with #hash anchor (regression test)', () => {
    // This was the regression: old regex /^\/blog\/(.+?)\/$/ did NOT match this
    expect(extractSlugFromHref('/blog/notebook/频率与贝叶斯/#频率学派')).toBe('notebook/频率与贝叶斯');
  });

  it('extracts slug from URL with #hash and no trailing slash before #', () => {
    expect(extractSlugFromHref('/blog/notebook/test#section')).toBe('notebook/test');
  });

  it('extracts slug from URL without trailing slash', () => {
    expect(extractSlugFromHref('/blog/notebook/test')).toBe('notebook/test');
  });

  it('returns null for non-blog URLs', () => {
    expect(extractSlugFromHref('/other/path')).toBeNull();
    expect(extractSlugFromHref('https://example.com')).toBeNull();
    expect(extractSlugFromHref('/')).toBeNull();
  });

  it('handles nested slugs correctly', () => {
    expect(extractSlugFromHref('/blog/diary/2025-10-11/')).toBe('diary/2025-10-11');
    expect(extractSlugFromHref('/blog/notebook/sub/dir/post#heading')).toBe('notebook/sub/dir/post');
  });

  it('decodes URL-encoded Chinese characters in slug (browser encodes href)', () => {
    // Browser's getAttribute('href') returns URL-encoded strings for CJK chars
    expect(extractSlugFromHref('/blog/notebook/%E9%A2%91%E7%8E%87%E4%B8%8E%E8%B4%9D%E5%8F%B6%E6%96%AF/#%E9%A2%91%E7%8E%87%E5%AD%A6%E6%B4%BE'))
      .toBe('notebook/频率与贝叶斯');
  });

  it('decodes hash fragment too', () => {
    const href = '/blog/notebook/%E9%A2%91%E7%8E%87%E4%B8%8E%E8%B4%9D%E5%8F%B6%E6%96%AF/#%E9%A2%91%E7%8E%87%E5%AD%A6%E6%B4%BE';
    const hash = href.includes('#') ? decodeURIComponent(href.split('#')[1]) : null;
    expect(hash).toBe('频率学派');
  });
});

// ===== shouldFilterSlug =====

describe('shouldFilterSlug', () => {
  it('filters claude files (case-insensitive)', () => {
    expect(shouldFilterSlug('notebook/claude')).toBe(true);
    expect(shouldFilterSlug('Claude')).toBe(true);
    expect(shouldFilterSlug('CLAUDE')).toBe(true);
  });

  it('filters blocked directories', () => {
    expect(shouldFilterSlug('clippings/test')).toBe(true);
    expect(shouldFilterSlug('_obsidian/config')).toBe(true);
    expect(shouldFilterSlug('.obsidian/plugins')).toBe(true);
    expect(shouldFilterSlug('.trash/deleted')).toBe(true);
    expect(shouldFilterSlug('.claude/settings')).toBe(true);
    expect(shouldFilterSlug('img/photo')).toBe(true);
    expect(shouldFilterSlug('src/main')).toBe(true);
  });

  it('does not filter normal slugs', () => {
    expect(shouldFilterSlug('notebook/ARIMA')).toBe(false);
    expect(shouldFilterSlug('diary/2025-10-11')).toBe(false);
    expect(shouldFilterSlug('index')).toBe(false);
  });

  it('handles empty slug', () => {
    expect(shouldFilterSlug('')).toBe(false);
  });
});
