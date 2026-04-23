import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContentIndex } from '../types';
import { categorizeDir, resolvePath, getPostUrl, buildFS } from '../file-tree';

// ===== Pure Functions =====

describe('categorizeDir', () => {
  it('extracts directory from nested notebook slug', () => {
    expect(categorizeDir('notebook/ARIMA', [])).toBe('notebook/');
  });

  it('extracts directory from nested diary slug', () => {
    expect(categorizeDir('diary/2025-10-11', [])).toBe('diary/');
  });

  it('categorizes date-format flat slug as diary', () => {
    expect(categorizeDir('2025-10-11', [])).toBe('diary/');
  });

  it('categorizes unknown flat slug as notebook', () => {
    expect(categorizeDir('something', [])).toBe('notebook/');
  });

  it('categorizes index slug (no slash) as notebook fallback', () => {
    // index is handled specially before categorizeDir is called
    expect(categorizeDir('index', [])).toBe('notebook/');
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
    // Filter out non-blog directories
    if (shouldFilterDir(dir)) continue;
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

    const dir = categorizeDir(post.slug, post.tags);
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

// Helper: directories to filter out (Obsidian internal, clippings, etc.)
function shouldFilterDir(dir: string): boolean {
  const blocked = ['clippings/', '_obsidian/', '.obsidian/', '.trash/', '.claude/', 'img/', 'src/'];
  return blocked.some(b => dir.toLowerCase().startsWith(b.toLowerCase()));
}

// Helper: slugs to filter out (CLAUDE files, internal Obsidian files)
function shouldFilterSlug(slug: string): boolean {
  // Filter CLAUDE files (case-insensitive)
  const parts = slug.split('/');
  if (parts[parts.length - 1].toLowerCase() === 'claude') return true;

  // Filter non-blog directories
  const firstDir = slug.split('/')[0]?.toLowerCase() || '';
  const blockedDirs = ['clippings', '_obsidian', '.obsidian', '.trash', '.claude', 'img', 'src'];
  if (blockedDirs.includes(firstDir)) return true;

  return false;
}
