import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===== Module-level state reset helpers =====
// file-tree.ts uses module-level `index` and `fileSystem` variables.
// We need to reset them between tests. We do this by re-importing the module.

let listDir: typeof import('../file-tree').listDir;
let getAllPosts: typeof import('../file-tree').getAllPosts;
let getAllTags: typeof import('../file-tree').getAllTags;
let resolvePath: typeof import('../file-tree').resolvePath;
let getPostUrl: typeof import('../file-tree').getPostUrl;
let loadFileSystem: typeof import('../file-tree').loadFileSystem;
let fetchPostContent: typeof import('../file-tree').fetchPostContent;
let categorizeDir: typeof import('../file-tree').categorizeDir;

// Helper to reload the module fresh
async function reloadModule() {
  vi.resetModules();
  const mod = await import('../file-tree');
  listDir = mod.listDir;
  getAllPosts = mod.getAllPosts;
  getAllTags = mod.getAllTags;
  resolvePath = mod.resolvePath;
  getPostUrl = mod.getPostUrl;
  loadFileSystem = mod.loadFileSystem;
  fetchPostContent = mod.fetchPostContent;
  categorizeDir = mod.categorizeDir;
}

// ===== buildFS tests (requires index to be loaded) =====

// We inject a mock index by mocking fetch in loadFileSystem
const mockIndex = {
  posts: [
    { slug: 'index', title: 'About', date: '2025-01-01', tags: ['about'], reading_time: 2 },
    { slug: 'notebook/ARIMA', title: 'ARIMA', date: '2025-10-01', tags: ['ML'], reading_time: 5 },
    { slug: 'diary/2025-10-11', title: 'Diary', date: '2025-10-11', tags: ['diary'], reading_time: 3 },
    { slug: 'notebook/claude', title: 'Claude', date: '2025-10-01', tags: [], reading_time: 1 },
    { slug: 'clippings/test', title: 'Clipping', date: '2025-10-01', tags: [], reading_time: 1 },
  ],
  tags: ['ML', 'diary', 'about'],
  directories: { 'diary/': 'Journal', 'notebook/': 'Notes', 'clippings/': 'Clips' },
};

function mockFetchIndex(indexData: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(indexData),
  });
}

describe('loadFileSystem', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetchIndex(mockIndex));
    await reloadModule();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load index and build file system', async () => {
    await loadFileSystem();
    const root = listDir('/');
    expect(root).toBeDefined();
    expect(root!.length).toBeGreaterThan(0);
  });

  it('should be idempotent (skip if already loaded)', async () => {
    await loadFileSystem();
    await loadFileSystem();
    // Should not throw, just return early
    const root = listDir('/');
    expect(root).toBeDefined();
  });

  it('should handle fetch failure gracefully', async () => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await reloadModule();
    await loadFileSystem();
    // Should not throw, index falls back to empty
    expect(getAllPosts()).toEqual([]);
    expect(getAllTags()).toEqual([]);
  });

  it('should handle non-ok HTTP response', async () => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await reloadModule();
    await loadFileSystem();
    expect(getAllPosts()).toEqual([]);
  });

  it('should handle invalid JSON response', async () => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
    }));
    await reloadModule();
    await loadFileSystem();
    expect(getAllPosts()).toEqual([]);
  });
});

describe('buildFS (via loadFileSystem)', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetchIndex(mockIndex));
    await reloadModule();
    await loadFileSystem();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('root should contain directory entries and index.md', () => {
    const root = listDir('/')!;
    expect(root.some(f => f.name === 'notebook/' && f.type === 'dir')).toBe(true);
    expect(root.some(f => f.name === 'diary/' && f.type === 'dir')).toBe(true);
    // clippings/ should be filtered by BLOCKED_DIRS
    expect(root.some(f => f.name === 'clippings/')).toBe(false);
    expect(root.some(f => f.name === 'index.md' && f.type === 'file')).toBe(true);
  });

  it('index.md should have correct metadata', () => {
    const root = listDir('/')!;
    const indexFile = root.find(f => f.name === 'index.md');
    expect(indexFile).toBeDefined();
    expect(indexFile!.title).toBe('About');
    expect(indexFile!.slug).toBe('index');
  });

  it('notebook directory should contain files (excluding claude)', () => {
    const notebook = listDir('/notebook/')!;
    expect(notebook.some(f => f.name === 'ARIMA.md')).toBe(true);
    expect(notebook.some(f => f.slug === 'notebook/claude')).toBe(false);
  });

  it('diary directory should contain diary entries', () => {
    const diary = listDir('/diary/')!;
    expect(diary.some(f => f.name === '2025-10-11.md')).toBe(true);
  });

  it('clippings directory should not exist', () => {
    expect(listDir('/clippings/')).toBeUndefined();
  });
});

describe('listDir', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetchIndex(mockIndex));
    await reloadModule();
    await loadFileSystem();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return undefined before loadFileSystem', async () => {
    vi.resetModules();
    const mod = await import('../file-tree');
    expect(mod.listDir('/')).toBeUndefined();
  });

  it('should normalize ~ to /', () => {
    expect(listDir('~')).toBe(listDir('/'));
  });

  it('should normalize empty string to /', () => {
    expect(listDir('')).toBe(listDir('/'));
  });

  it('should return undefined for non-existent directory', () => {
    expect(listDir('/nonexistent/')).toBeUndefined();
  });
});

describe('getAllPosts', () => {
  it('should return empty array before loadFileSystem', async () => {
    vi.resetModules();
    const mod = await import('../file-tree');
    expect(mod.getAllPosts()).toEqual([]);
  });

  it('should return posts after loading', async () => {
    vi.stubGlobal('fetch', mockFetchIndex(mockIndex));
    await reloadModule();
    await loadFileSystem();
    const posts = getAllPosts();
    expect(posts.length).toBe(5);
  });
});

describe('getAllTags', () => {
  it('should return empty array before loadFileSystem', async () => {
    vi.resetModules();
    const mod = await import('../file-tree');
    expect(mod.getAllTags()).toEqual([]);
  });

  it('should return tags after loading', async () => {
    vi.stubGlobal('fetch', mockFetchIndex(mockIndex));
    await reloadModule();
    await loadFileSystem();
    const tags = getAllTags();
    expect(tags).toContain('ML');
    expect(tags).toContain('diary');
  });
});

describe('fetchPostContent', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetchIndex(mockIndex));
    await reloadModule();
    await loadFileSystem();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract article content from HTML page', async () => {
    const pageHtml = `
      <html><body>
        <article>
          <div class="post-header"><h1>Test Title</h1></div>
          <p>Content paragraph</p>
          <div class="post-footer"><a href="/">back</a></div>
        </article>
      </body></html>
    `;
    const MockDOMParser = vi.fn().mockImplementation(function(this: any) {
      this.parseFromString = () => ({
        querySelector: (sel: string) => {
          if (sel === 'article') return {
            querySelector: (s: string) => {
              if (s === 'h1') return { textContent: 'Test Title' };
              if (s === '.post-header') return { remove: vi.fn() };
              if (s === '.post-footer') return { remove: vi.fn() };
              return null;
            },
            innerHTML: '<p>Content paragraph</p>',
          };
          return null;
        },
      });
    });
    vi.stubGlobal('DOMParser', MockDOMParser);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(pageHtml),
    }));

    const result = await fetchPostContent('notebook/ARIMA');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Title');
    expect(result!.html).toContain('Content paragraph');
    expect(result!.html).not.toContain('post-header');
    expect(result!.html).not.toContain('post-footer');
  });

  it('should fetch URL-encoded post paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body><article><h1>Encoded</h1><p>Content</p></article></body></html>'),
    });
    const MockDOMParser = vi.fn().mockImplementation(function(this: any) {
      this.parseFromString = () => ({
        querySelector: (sel: string) => {
          if (sel === 'article') return {
            querySelector: (s: string) => {
              if (s === 'h1') return { textContent: 'Encoded' };
              if (s === '.post-header') return null;
              if (s === '.post-footer') return null;
              return null;
            },
            innerHTML: '<p>Content</p>',
          };
          return null;
        },
      });
    });
    vi.stubGlobal('DOMParser', MockDOMParser);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchPostContent('notebook/nanobot websocket channel 安全加固与工程化');
    expect(result).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/blog/notebook/nanobot%20websocket%20channel%20%E5%AE%89%E5%85%A8%E5%8A%A0%E5%9B%BA%E4%B8%8E%E5%B7%A5%E7%A8%8B%E5%8C%96/');
  });

  it('should return null on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('<html><body>Not found</body></html>'),
    }));

    const result = await fetchPostContent('missing');
    expect(result).toBeNull();
  });

  it('should return null when no article element found', async () => {
    const MockDOMParser = vi.fn().mockImplementation(function(this: any) {
      this.parseFromString = () => ({
        querySelector: () => null,
      });
    });
    vi.stubGlobal('DOMParser', MockDOMParser);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body></body></html>'),
    }));

    const result = await fetchPostContent('nonexistent');
    expect(result).toBeNull();
  });

  it('should fallback to slug when no h1 found', async () => {
    const MockDOMParser = vi.fn().mockImplementation(function(this: any) {
      this.parseFromString = () => ({
        querySelector: () => ({
          querySelector: (s: string) => {
            if (s === 'h1') return null;
            if (s === '.post-header') return { remove: vi.fn() };
            if (s === '.post-footer') return { remove: vi.fn() };
            return null;
          },
          innerHTML: '<p>Content</p>',
        }),
      });
    });
    vi.stubGlobal('DOMParser', MockDOMParser);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html></html>'),
    }));

    const result = await fetchPostContent('test-slug');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('test-slug');
  });

  it('should return null on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await fetchPostContent('any');
    expect(result).toBeNull();
  });
});

describe('getPostUrl', () => {
  it('should generate correct URL', async () => {
    await reloadModule();
    expect(getPostUrl('notebook/arima')).toBe('/blog/notebook/arima/');
  });

  it('should encode slug path segments', async () => {
    await reloadModule();
    expect(getPostUrl('notebook/nanobot websocket channel 安全加固与工程化')).toBe('/blog/notebook/nanobot%20websocket%20channel%20%E5%AE%89%E5%85%A8%E5%8A%A0%E5%9B%BA%E4%B8%8E%E5%B7%A5%E7%A8%8B%E5%8C%96/');
  });
});

describe('categorizeDir', () => {
  beforeEach(async () => {
    await reloadModule();
  });

  it('should extract directory from nested slug', () => {
    expect(categorizeDir('notebook/test')).toBe('notebook/');
  });

  it('should categorize date-format slug as diary', () => {
    expect(categorizeDir('2025-10-11')).toBe('diary/');
  });

  it('should categorize unknown flat slug as notebook', () => {
    expect(categorizeDir('random')).toBe('notebook/');
  });
});

describe('resolvePath', () => {
  beforeEach(async () => {
    await reloadModule();
  });

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

  it('resolves relative path without double slash', () => {
    const result = resolvePath('/notebook/', 'sub/');
    expect(result).toBe('/notebook/sub/');
    expect(result).not.toContain('//');
  });

  it('preserves trailing slash', () => {
    expect(resolvePath('/', 'notebook/')).toBe('/notebook/');
  });

  it('does not add trailing slash when target has none', () => {
    expect(resolvePath('/', 'notebook')).toBe('/notebook');
  });

  it('handles . segments', () => {
    expect(resolvePath('/notebook/', './test')).toBe('/notebook/test');
  });

  it('handles multiple .. segments', () => {
    expect(resolvePath('/a/b/c/', '../../')).toBe('/a/');
  });

  it('handles path that resolves to root via ..', () => {
    expect(resolvePath('/a/', '../..')).toBe('/');
  });
});

describe('buildFS without index post', () => {
  it('should handle index without index.md post', async () => {
    const noIndexMock = {
      posts: [
        { slug: 'notebook/test', title: 'Test', date: '2025-01-01', tags: [], reading_time: 1 },
      ],
      tags: [],
      directories: { 'notebook/': 'Notes' },
    };
    vi.stubGlobal('fetch', mockFetchIndex(noIndexMock));
    await reloadModule();
    await loadFileSystem();
    const root = listDir('/')!;
    expect(root.some(f => f.name === 'index.md')).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('buildFS flat slug', () => {
  it('should handle flat slug (no /) for file name', async () => {
    const flatMock = {
      posts: [
        { slug: 'standalone', title: 'Standalone', date: '2025-01-01', tags: [], reading_time: 1 },
      ],
      tags: [],
      directories: {},
    };
    vi.stubGlobal('fetch', mockFetchIndex(flatMock));
    await reloadModule();
    await loadFileSystem();
    const notebook = listDir('/notebook/')!;
    expect(notebook.some(f => f.name === 'standalone.md')).toBe(true);
    vi.restoreAllMocks();
  });
});
