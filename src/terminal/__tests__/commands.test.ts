import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileEntry, ContentIndex } from '../types';

// ===== Mock file-tree module for command tests =====

const mockFS: Record<string, FileEntry[] | undefined> = {};
const mockIndex: ContentIndex = {
  posts: [
    { slug: 'index', title: 'About', date: '2025-01-01', tags: ['about'], reading_time: 2 },
    { slug: 'notebook/ARIMA', title: 'ARIMA Model', date: '2025-01-15', tags: ['ML', 'time-series'], reading_time: 5 },
    { slug: 'diary/2025-10-11', title: 'Diary Entry', date: '2025-10-11', tags: ['diary'], reading_time: 3 },
    { slug: 'notebook/Dropout', title: 'Dropout Techniques', date: '2025-02-20', tags: ['ML', 'deep-learning'], reading_time: 8 },
    { slug: 'notebook/KL散度', title: 'KL Divergence', date: '2025-03-01', tags: ['ML', 'math'], reading_time: 6 },
    { slug: 'notebook/git bare worktree workflow', title: 'git bare worktree workflow', date: '2026-01-22', tags: ['git'], reading_time: 3 },
  ],
  tags: ['ML', 'diary', 'time-series', 'deep-learning', 'math'],
  directories: { 'notebook/': 'Notes', 'diary/': 'Journal' },
};

vi.mock('../file-tree', () => ({
  listDir: vi.fn((path: string) => mockFS[path]),
  getAllPosts: vi.fn(() => mockIndex.posts),
  getAllTags: vi.fn(() => mockIndex.tags),
  resolvePath: vi.fn((cwd: string, target: string) => {
    if (target === '~' || target === '') return '/';
    if (target.startsWith('/')) return target;
    const joined = cwd.replace(/\/$/, '') + '/' + target.replace(/^\//, '');
    const parts = joined.split('/').filter(Boolean);
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === '..') resolved.pop();
      else if (part !== '.') resolved.push(part);
    }
    const path = '/' + resolved.join('/') || '/';
    return target.endsWith('/') ? path + '/' : path;
  }),
  getPostUrl: vi.fn((slug: string) => `/blog/${slug}/`),
  loadFileSystem: vi.fn(),
  fetchPostContent: vi.fn(),
}));

// Mock fetch for commands that load content (cat, about)
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock DOMParser for legacy tests that still need it
const mockQuerySelector = vi.fn();
globalThis.DOMParser = vi.fn().mockImplementation(() => ({
  parseFromString: () => ({
    querySelector: mockQuerySelector,
    querySelectorAll: () => [],
  }),
}));

// Must import AFTER vi.mock
import { executeCommand, getPrompt, getAllCommands } from '../commands';
import { fetchPostContent as _fetchPostContent } from '../file-tree';
const mockFetchPostContent = _fetchPostContent as unknown as ReturnType<typeof vi.fn>;

function createMockCtx(overrides?: Partial<Record<string, any>>): any {
  const outputLines: string[] = [];
  let cwd = '/';
  return {
    cwd,
    output: vi.fn((html: string) => outputLines.push(html)),
    appendInputLine: vi.fn(),
    openViewer: vi.fn(),
    getCurrentFiles: vi.fn(() => []),
    setCwd: vi.fn((path: string) => { cwd = path; }),
    _history: [],
    get _cwd() { return cwd; },
    get _output() { return outputLines; },
    ...overrides,
  };
}

function getOutputText(ctx: any): string {
  return ctx.output.mock.calls.map((c: any[]) => c[0]).join('\n');
}

// ===== cmdCD tests =====

describe('cmdCD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up a valid file system
    mockFS['/'] = [
      { name: 'notebook/', type: 'dir', desc: 'Notes' },
      { name: 'diary/', type: 'dir', desc: 'Journal' },
    ];
    mockFS['/notebook/'] = [
      { name: 'ARIMA.md', type: 'file', slug: 'notebook/ARIMA', title: 'ARIMA' },
    ];
    mockFS['/diary/'] = [
      { name: '2025-10-11.md', type: 'file', slug: 'diary/2025-10-11', title: 'Diary' },
    ];
  });

  it('should cd into a valid directory', () => {
    const ctx = createMockCtx();
    executeCommand('cd notebook/', ctx);
    expect(ctx.setCwd).toHaveBeenCalledWith('/notebook/');
  });

  it('should not cd into a file (non-existent directory)', () => {
    const ctx = createMockCtx();
    executeCommand('cd ARIMA.md', ctx);
    expect(ctx.setCwd).not.toHaveBeenCalled();
    expect(ctx.output).toHaveBeenCalledWith(
      expect.stringContaining('No such directory'),
    );
  });

  it('should not cd into a completely non-existent path', () => {
    const ctx = createMockCtx();
    executeCommand('cd nonexistent/', ctx);
    expect(ctx.setCwd).not.toHaveBeenCalled();
    expect(ctx.output).toHaveBeenCalledWith(
      expect.stringContaining('No such directory'),
    );
  });

  it('should cd .. from subdirectory to root', () => {
    const ctx = createMockCtx();
    ctx.cwd = '/notebook/';
    executeCommand('cd ..', ctx);
    expect(ctx.setCwd).toHaveBeenCalledWith('/');
  });

  it('should reject cd .. from root', () => {
    const ctx = createMockCtx();
    executeCommand('cd ..', ctx);
    expect(ctx.setCwd).not.toHaveBeenCalled();
    expect(ctx.output).toHaveBeenCalledWith(
      expect.stringContaining('Already at root'),
    );
  });

  it('should cd ~ to root', () => {
    const ctx = createMockCtx();
    ctx.cwd = '/notebook/';
    executeCommand('cd ~', ctx);
    expect(ctx.setCwd).toHaveBeenCalledWith('/');
  });
});

// ===== cmdCAT tests =====

describe('cmdCAT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPostContent.mockResolvedValue({
      title: 'Test Post',
      html: '<p>content</p>',
    });
  });

  it('should find file by exact nested slug (cat notebook/ARIMA)', () => {
    const ctx = createMockCtx();
    executeCommand('cat notebook/ARIMA', ctx);

    // Should show "Loading..."
    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('Loading'));
  });

  it('should find file by short name when cwd matches (cat ARIMA in /notebook/)', () => {
    const ctx = createMockCtx();
    ctx.cwd = '/notebook/';
    executeCommand('cat ARIMA.md', ctx);

    // Should show "Loading..." (found via cwd prefix: notebook/ + arima = notebook/arima)
    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('Loading'));
  });

  it('should report error for non-existent file', () => {
    const ctx = createMockCtx();
    executeCommand('cat nonexistent', ctx);

    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('No such file'));
  });

  it('should report error with no arguments', () => {
    const ctx = createMockCtx();
    executeCommand('cat', ctx);

    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('missing operand'));
  });

  it('should fuzzy match by slug substring (ARIMA matches notebook/ARIMA from root)', () => {
    const ctx = createMockCtx();
    ctx.cwd = '/';
    executeCommand('cat ARIMA', ctx);
    // Fuzzy match finds notebook/ARIMA via slug substring
    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('Loading'));
  });

  it('should resolve relative path with .. (cat ../index.md from /notebook/)', () => {
    const ctx = createMockCtx();
    ctx.cwd = '/notebook/';
    executeCommand('cat ../index.md', ctx);
    // resolvePath(/notebook/, ../index) → /index → slug "index"
    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('Loading'));
  });

  it('should resolve relative path with .. from root (cat ../notebook/ARIMA from /diary/)', () => {
    const ctx = createMockCtx();
    ctx.cwd = '/diary/';
    executeCommand('cat ../notebook/ARIMA', ctx);
    // resolvePath(/diary/, ../notebook/ARIMA) → /notebook/ARIMA
    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('Loading'));
  });

  it('should handle filenames with spaces via quoted arguments', () => {
    const ctx = createMockCtx();
    executeCommand('cat "notebook/git bare worktree workflow"', ctx);
    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('Loading'));
  });
});

// ===== cmdLS tests =====

describe('cmdLS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFS['/'] = [
      { name: 'notebook/', type: 'dir', desc: 'Notes' },
      { name: 'diary/', type: 'dir', desc: 'Journal' },
      { name: 'index.md', type: 'file', slug: 'index', title: '随笔' },
    ];
    mockFS['/notebook/'] = [
      { name: 'ARIMA.md', type: 'file', slug: 'notebook/ARIMA', title: 'ARIMA', date: '2025-10-01', tags: ['ML'] },
    ];
  });

  it('should list root directory', () => {
    const ctx = createMockCtx();
    executeCommand('ls', ctx);

    expect(ctx.output).toHaveBeenCalledTimes(1);
    const output = ctx.output.mock.calls[0][0];
    expect(output).toContain('notebook/');
    expect(output).toContain('diary/');
    expect(output).toContain('随笔');
  });

  it('should list subdirectory', () => {
    const ctx = createMockCtx();
    executeCommand('ls notebook/', ctx);

    const output = ctx.output.mock.calls[0][0];
    expect(output).toContain('ARIMA');
  });

  it('should report error for non-existent directory', () => {
    const ctx = createMockCtx();
    executeCommand('ls nonexistent/', ctx);

    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('No such directory'));
  });
});

// ===== cmdGREP tests =====

describe('cmdGREP', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should find posts by title', () => {
    const ctx = createMockCtx();
    executeCommand('grep ARIMA', ctx);
    expect(getOutputText(ctx)).toContain('ARIMA Model');
    expect(getOutputText(ctx)).toContain('Found');
  });

  it('should find posts by tag', () => {
    const ctx = createMockCtx();
    executeCommand('grep deep-learning', ctx);
    expect(getOutputText(ctx)).toContain('Dropout Techniques');
  });

  it('should find posts by slug substring', () => {
    const ctx = createMockCtx();
    executeCommand('grep KL', ctx);
    expect(getOutputText(ctx)).toContain('KL Divergence');
  });

  it('should report no results for non-matching query', () => {
    const ctx = createMockCtx();
    executeCommand('grep xyznonexistent', ctx);
    expect(getOutputText(ctx)).toContain('No results');
  });

  it('should report error with no query', () => {
    const ctx = createMockCtx();
    executeCommand('grep', ctx);
    expect(getOutputText(ctx)).toContain('missing query');
  });

  it('should handle multi-word query', () => {
    const ctx = createMockCtx();
    executeCommand('grep Dropout Techniques', ctx);
    expect(getOutputText(ctx)).toContain('Dropout Techniques');
  });
});

// ===== cmdTAG tests =====

describe('cmdTAG', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should list all tags with counts', () => {
    const ctx = createMockCtx();
    executeCommand('tag', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('ML');
    expect(output).toContain('diary');
    expect(output).toContain('All Tags');
  });

  it('should filter posts by tag', () => {
    const ctx = createMockCtx();
    executeCommand('tag time-series', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('ARIMA Model');
    expect(output).toContain('time-series');
  });

  it('should report no posts for unused tag', () => {
    const ctx = createMockCtx();
    executeCommand('tag nonexistent', ctx);
    expect(getOutputText(ctx)).toContain('No posts tagged');
  });

  it('should be case-insensitive for tag matching', () => {
    const ctx = createMockCtx();
    executeCommand('tag ML', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('ARIMA Model');
    expect(output).toContain('Dropout Techniques');
  });
});

// ===== cmdRECENT tests =====

describe('cmdRECENT', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should show most recent posts', () => {
    const ctx = createMockCtx();
    executeCommand('recent', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('Most Recent');
    // Should contain at least the first post
    expect(output).toContain('Diary Entry');
  });
});

// ===== cmdABOUT tests =====

describe('cmdABOUT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPostContent.mockResolvedValue({
      title: 'About Me',
      html: '<p>About content</p>',
    });
  });

  it('should show loading then fetch about page', () => {
    const ctx = createMockCtx();
    executeCommand('about', ctx);
    expect(getOutputText(ctx)).toContain('Loading');
    expect(mockFetchPostContent).toHaveBeenCalled();
  });
});

// ===== cmdNEOFETCH tests =====

describe('cmdNEOFETCH', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should display system info', () => {
    const ctx = createMockCtx();
    executeCommand('neofetch', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('ChengYongruOS');
    expect(output).toContain('Astro');
    expect(output).toContain('Terminal');
  });
});

// ===== cmdWHOAMI tests =====

describe('cmdWHOAMI', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should display visitor identity', () => {
    const ctx = createMockCtx();
    executeCommand('whoami', ctx);
    expect(getOutputText(ctx)).toContain('visitor');
    expect(getOutputText(ctx)).toContain('Cheng Yongru');
  });
});

// ===== cmdECHO tests =====

describe('cmdECHO', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should echo text', () => {
    const ctx = createMockCtx();
    executeCommand('echo hello world', ctx);
    expect(ctx.output).toHaveBeenCalledWith('hello world');
  });

  it('should echo empty string with no args', () => {
    const ctx = createMockCtx();
    executeCommand('echo', ctx);
    expect(ctx.output).toHaveBeenCalledWith('');
  });
});

// ===== cmdDATE tests =====

describe('cmdDATE', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should display current date/time', () => {
    const ctx = createMockCtx();
    executeCommand('date', ctx);
    expect(ctx.output).toHaveBeenCalledTimes(1);
    const output = ctx.output.mock.calls[0][0];
    // Should contain year-like number
    expect(output).toMatch(/20\d\d/);
  });
});

// ===== cmdHISTORY tests =====

describe('cmdHISTORY', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should show (no commands yet) for empty history', () => {
    const ctx = createMockCtx();
    executeCommand('history', ctx);
    expect(getOutputText(ctx)).toContain('no commands yet');
  });

  it('should list command history', () => {
    const ctx = createMockCtx();
    ctx._history = ['ls', 'cd notebook/', 'cat ARIMA'];
    executeCommand('history', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('ls');
    expect(output).toContain('cd notebook/');
    expect(output).toContain('cat ARIMA');
  });
});

// ===== cmdPWD tests =====

describe('cmdPWD', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should print root as /', () => {
    const ctx = createMockCtx();
    ctx.cwd = '/';
    executeCommand('pwd', ctx);
    expect(ctx.output).toHaveBeenCalledWith('/');
  });

  it('should print current directory', () => {
    const ctx = createMockCtx();
    ctx.cwd = '/notebook/';
    executeCommand('pwd', ctx);
    expect(ctx.output).toHaveBeenCalledWith('/notebook');
  });
});

// ===== cmdTHEME tests =====

describe('cmdTHEME', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((k: string) => store[k] || null),
      setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    });
    // Mock document.documentElement
    vi.stubGlobal('document', {
      documentElement: { setAttribute: vi.fn(), getAttribute: vi.fn() },
    });
  });

  it('should list available themes', () => {
    const ctx = createMockCtx();
    executeCommand('theme', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('Available Themes');
    expect(output).toContain('Catppuccin');
    expect(output).toContain('Dracula');
    expect(output).toContain('Gruvbox');
    expect(output).toContain('Solarized');
  });

  it('should switch to a valid theme', () => {
    const ctx = createMockCtx();
    executeCommand('theme dracula', ctx);
    expect(getOutputText(ctx)).toContain('Dracula');
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dracula');
  });

  it('should report error for unknown theme', () => {
    const ctx = createMockCtx();
    executeCommand('theme neon', ctx);
    expect(getOutputText(ctx)).toContain('Unknown theme');
  });
});

// ===== cmdHELP tests =====

describe('cmdHELP', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should display help with all commands', () => {
    const ctx = createMockCtx();
    executeCommand('help', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('Available Commands');
    expect(output).toContain('ls');
    expect(output).toContain('cd');
    expect(output).toContain('cat');
    expect(output).toContain('grep');
    expect(output).toContain('tag');
    expect(output).toContain('clear');
  });
});

// ===== cmdSUDO tests =====

describe('cmdSUDO', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should deny sudo access', () => {
    const ctx = createMockCtx();
    executeCommand('sudo rm -rf /', ctx);
    expect(getOutputText(ctx)).toContain('Nice try');
  });
});

// ===== cmdCLEAR tests =====

describe('cmdCLEAR', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should report unknown command for clear (handled by Terminal component)', () => {
    // clear is intercepted by Terminal.tsx before reaching executeCommand
    // If it reaches here, it should be "command not found"
    const ctx = createMockCtx();
    executeCommand('clear', ctx);
    expect(getOutputText(ctx)).toContain('command not found');
  });
});

// ===== Unknown command =====

describe('unknown command', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should report command not found', () => {
    const ctx = createMockCtx();
    executeCommand('foobar', ctx);
    expect(getOutputText(ctx)).toContain('command not found');
    expect(getOutputText(ctx)).toContain('help');
  });
});

// ===== Additional branch coverage =====

describe('cmdCAT additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report error when fetchPostContent returns null', async () => {
    mockFetchPostContent.mockResolvedValue(null);
    const ctx = createMockCtx();
    executeCommand('cat ARIMA', ctx);
    // Wait for async
    await vi.waitFor(() => {
      expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('Failed to load'));
    });
  });

  it('should show ambiguous candidates for fuzzy match', () => {
    const ctx = createMockCtx();
    // "Model" matches "ARIMA Model" by title and "Dropout Techniques" doesn't match
    // Let's use a query that matches multiple: "time" matches slug "time-series" tag
    // Actually use title fuzzy: "Technique" is unique. Use partial: "Dro" matches only one.
    // Best approach: add duplicate-matching posts
    mockIndex.posts.push({
      slug: 'notebook/test-model',
      title: 'Another ARIMA Model',
      date: '2025-06-01',
      tags: ['ML'],
      reading_time: 3,
    });
    executeCommand('cat ARIMA Model', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('Ambiguous');
    mockIndex.posts.pop();
  });
});

describe('cmdGREP additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show truncation when more than 20 results', () => {
    // Add many posts to mock index to exceed 20 results
    for (let i = 0; i < 25; i++) {
      mockIndex.posts.push({
        slug: `notebook/test-${i}`,
        title: `Test Post ${i}`,
        date: '2025-01-01',
        tags: ['test'],
        reading_time: 1,
        text: 'common search term',
      });
    }
    const ctx = createMockCtx();
    executeCommand('grep common search term', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('more');
    // Clean up
    mockIndex.posts.splice(5, 25);
  });

  it('should search full text when available', () => {
    // Add a post with text that doesn't match title/slug/tags
    mockIndex.posts.push({
      slug: 'notebook/hidden-gem',
      title: 'Hidden Gem',
      date: '2025-06-01',
      tags: ['rare'],
      reading_time: 2,
      text: 'unique pineapple keyword here',
    });
    const ctx = createMockCtx();
    executeCommand('grep pineapple', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('Hidden Gem');
    expect(output).toContain('[content]');
    mockIndex.posts.pop();
  });
});

describe('cmdABOUT additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report error when about page fails to load', async () => {
    mockFetchPostContent.mockResolvedValue(null);
    const ctx = createMockCtx();
    executeCommand('about', ctx);
    await vi.waitFor(() => {
      expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('Failed to load about page'));
    });
  });
});

describe('cmdLS pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Create a directory with many files to test pagination
    const manyFiles: FileEntry[] = [];
    for (let i = 1; i <= 15; i++) {
      manyFiles.push({
        name: `file${i}.md`,
        type: 'file',
        slug: `notebook/file${i}`,
        title: `File ${i}`,
        date: '2025-01-01',
        tags: [],
      });
    }
    mockFS['/notebook/'] = manyFiles;
  });

  it('should show pagination for large directories', () => {
    const ctx = createMockCtx();
    executeCommand('ls notebook/', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('page 1/2');
    expect(output).toContain('next');
  });

  it('should navigate to second page', () => {
    const ctx = createMockCtx();
    executeCommand('ls notebook/ 2', ctx);
    const output = getOutputText(ctx);
    expect(output).toContain('page 2/2');
  });
});

describe('cmdLS empty directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFS['/empty/'] = [];
  });

  it('should show (empty) for empty directory', () => {
    const ctx = createMockCtx();
    executeCommand('ls empty/', ctx);
    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('(empty)'));
  });
});

describe('cmdLS with file that has slug-like title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFS['/'] = [
      {
        name: 'test.md',
        type: 'file',
        slug: 'notebook/test-post',
        title: 'notebook/test-post', // slug-like title (contains /)
        date: '2025-01-01',
        tags: [],
      },
    ];
  });

  it('should extract basename from slug-like title via displayName', () => {
    const ctx = createMockCtx();
    executeCommand('ls', ctx);
    const output = getOutputText(ctx);
    // displayName extracts "test-post" from "notebook/test-post"
    expect(output).toContain('test-post');
  });
});

describe('cmdLS with empty title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFS['/'] = [
      {
        name: 'notitle.md',
        type: 'file',
        slug: 'notebook/notitle',
        title: '', // empty title
        date: '2025-01-01',
        tags: [],
      },
    ];
  });

  it('should fall back to filename when title is empty', () => {
    const ctx = createMockCtx();
    executeCommand('ls', ctx);
    const output = getOutputText(ctx);
    // displayName falls back to "notitle.md" basename → "notitle"
    expect(output).toContain('notitle');
  });
});

describe('empty command', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should do nothing for empty command', () => {
    const ctx = createMockCtx();
    executeCommand('', ctx);
    expect(ctx.output).not.toHaveBeenCalled();
  });

  it('should do nothing for whitespace-only command', () => {
    const ctx = createMockCtx();
    executeCommand('   ', ctx);
    expect(ctx.output).not.toHaveBeenCalled();
  });
});

describe('cmdTHEME current theme marker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store: Record<string, string> = { theme: 'dracula' };
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((k: string) => store[k] || null),
      setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    });
    vi.stubGlobal('document', {
      documentElement: { setAttribute: vi.fn(), getAttribute: vi.fn() },
    });
  });

  it('should mark current theme with <<', () => {
    const ctx = createMockCtx();
    executeCommand('theme', ctx);
    const output = getOutputText(ctx);
    // HTML entities: << is rendered as &lt;&lt; in the HTML output
    expect(output).toContain('&lt;&lt;');
  });
});

// ===== getPrompt =====

describe('getPrompt', () => {
  it('should return root prompt for /', () => {
    expect(getPrompt('/')).toBe('visitor@chengyongru:~$ ');
  });

  it('should return directory prompt for subdirectory', () => {
    expect(getPrompt('/notebook/')).toBe('visitor@chengyongru:~/notebook$ ');
  });
});

// ===== getAllCommands =====

describe('getAllCommands', () => {
  it('should return array of command names', () => {
    const cmds = getAllCommands();
    expect(cmds).toContain('ls');
    expect(cmds).toContain('cd');
    expect(cmds).toContain('cat');
    expect(cmds).toContain('help');
  });
});

// ===== cmdCAT cwd-prefix miss =====

describe('cmdCAT cwd-prefix miss branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPostContent.mockResolvedValue({
      title: 'Test',
      html: '<p>test</p>',
    });
  });

  it('should not find file via cwd-prefix from wrong directory', () => {
    const ctx = createMockCtx();
    ctx.cwd = '/diary/';
    executeCommand('cat xyznoexist', ctx);
    // From /diary/, cwd-prefix = diary/xyznoexist — no match
    // Fuzzy: "xyznoexist" matches nothing
    expect(ctx.output).toHaveBeenCalledWith(expect.stringContaining('No such file'));
  });
});
