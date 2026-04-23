// ============================================================
// Build-time Content Index Generator
// Generates content-index.json from Astro Content Collections
// ============================================================

import type { CollectionEntry } from 'astro:content';
import type { ContentIndex, FileEntry } from '../terminal/types';

// Directories to exclude (Obsidian internals, non-blog content)
const BLOCKED_DIRS = ['clippings', '_obsidian', '.obsidian', '.trash', '.claude', 'img', 'src'];

function shouldFilterId(id: string): boolean {
  const parts = id.split('/');
  const filename = parts[parts.length - 1]?.toLowerCase() || '';
  if (filename === 'claude') return true;
  const firstDir = parts[0]?.toLowerCase() || '';
  if (BLOCKED_DIRS.includes(firstDir)) return true;
  return false;
}

function estimateReadingTime(text: string): number {
  // Chinese: ~300 chars/min, English: ~200 words/min
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = text.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(chineseChars / 300 + englishWords / 200));
}

const DIR_DESCS: Record<string, string> = {
  'diary/': 'Journal entries',
  'notebook/': 'ML/DL/RL/Security notes',
};

function categorizePost(id: string, _tags: string[]): { dir: string; desc: string } {
  if (id === 'index') return { dir: '/', desc: '' };

  // Extract directory from nested id (e.g., 'notebook/arima' → 'notebook/')
  const slashIdx = id.indexOf('/');
  if (slashIdx > -1) {
    const dir = id.substring(0, slashIdx + 1);
    return { dir, desc: DIR_DESCS[dir] || '' };
  }

  // Flat id fallback
  if (id.match(/^\d{4}-\d{2}-\d{2}$/)) return { dir: 'diary/', desc: 'Journal entries' };
  return { dir: 'notebook/', desc: 'ML/DL/RL/Security notes' };
}

function extractPlainText(body: string): string {
  // Remove frontmatter
  let text = body.replace(/^---[\s\S]*?---\n*/, '');
  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  text = text.replace(/`[^`]+`/g, '');
  // Remove markdown syntax: headers, links, images, bold, italic
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/(\*{1,3}|_{1,3})(.+?)\1/g, '$2');
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Remove callout syntax
  text = text.replace(/^\[!\w+\][+-]?\s*/gm, '');
  // Remove blockquote markers
  text = text.replace(/^>\s?/gm, '');
  // Collapse whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export async function generateContentIndex(posts: CollectionEntry<'blog'>[]): Promise<ContentIndex> {
  const allPosts: ContentIndex['posts'] = [];
  const directories: ContentIndex['directories'] = {};
  const tagSet = new Set<string>();

  for (const post of posts) {
    const id = post.id;
    if (post.data.draft) continue;
    if (shouldFilterId(id)) continue;

    const body = (post as any).body || '';

    const { dir, desc } = categorizePost(id, post.data.tags || []);
    if (desc && !directories[dir]) {
      directories[dir] = desc;
    }

    const entry = {
      slug: id,
      title: post.data.title || id,
      date: post.data.date?.toISOString() || '',
      modify_date: post.data.modify_date?.toISOString(),
      tags: post.data.tags || [],
      reading_time: estimateReadingTime(body),
      text: extractPlainText(body),
    };
    allPosts.push(entry);

    for (const tag of post.data.tags || []) {
      tagSet.add(tag);
    }
  }

  // Sort by date descending
  allPosts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    posts: allPosts,
    tags: [...tagSet].sort(),
    directories,
  };
}

export function buildFileSystem(index: ContentIndex): Record<string, FileEntry[]> {
  const fs: Record<string, FileEntry[]> = {};

  // Root directory
  const rootEntries: FileEntry[] = [];
  for (const [dir, desc] of Object.entries(index.directories)) {
    rootEntries.push({
      name: dir,
      type: 'dir',
      desc,
    });
  }
  // index.md at root
  const indexPost = index.posts.find(p => p.slug === 'index');
  if (indexPost) {
    rootEntries.push({
      name: 'index.md',
      type: 'file',
      title: indexPost.title,
      date: indexPost.date,
      tags: indexPost.tags,
      slug: indexPost.slug,
    });
  }
  fs['/'] = rootEntries;

  // Build per-directory file lists
  for (const post of index.posts) {
    if (post.slug === 'index') continue;

    const { dir } = categorizePost(post.slug, post.tags);
    const dirPath = '/' + dir;

    if (!fs[dirPath]) {
      fs[dirPath] = [];
    }

    // Extract filename from nested slug (e.g., 'notebook/arima' → 'arima.md')
    const fileName = post.slug.includes('/') ? post.slug.split('/').pop()! + '.md' : post.slug + '.md';

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
