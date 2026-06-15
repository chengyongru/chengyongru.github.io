// ============================================================
// Build-time Content Index Generator
// Generates content-index.json from Astro Content Collections
// ============================================================

import type { CollectionEntry } from 'astro:content';
import type { ContentIndex, FileEntry } from '../terminal/types';
import config from '../config';
import { isPublishablePost } from './publication';

export function estimateReadingTime(text: string): number {
  // Chinese: ~300 chars/min, English: ~200 words/min
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = text.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(chineseChars / 300 + englishWords / 200));
}

const DIR_DESCS: Record<string, string> = config.dirs;

function categorizePost(id: string): { dir: string; desc: string } {
  if (id === 'index') return { dir: '/', desc: '' };

  // Extract directory from nested id (e.g., 'projects/research/note' → 'projects/research/')
  const slashIdx = id.lastIndexOf('/');
  if (slashIdx > -1) {
    const dir = id.substring(0, slashIdx + 1);
    return { dir, desc: DIR_DESCS[dir] || '' };
  }

  // Flat id fallback
  const dirKeys = Object.keys(config.dirs);
  const defaultDir = dirKeys[0] || 'notes/';
  if (id.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const diaryDir = dirKeys.find(k => k.includes('diary')) || defaultDir;
    return { dir: diaryDir, desc: config.dirs[diaryDir] || '' };
  }
  return { dir: defaultDir, desc: config.dirs[defaultDir] || '' };
}

function getDirectoryChain(dir: string): string[] {
  if (dir === '/') return [];
  const parts = dir.replace(/\/$/, '').split('/').filter(Boolean);
  return parts.map((_, index) => `${parts.slice(0, index + 1).join('/')}/`);
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

function makeExcerpt(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

export async function generateContentIndex(posts: CollectionEntry<'blog'>[]): Promise<ContentIndex> {
  const allPosts: ContentIndex['posts'] = [];
  const directories: ContentIndex['directories'] = {};
  const tagSet = new Set<string>();

  for (const post of posts) {
    const id = post.id;
    if (!isPublishablePost(post)) continue;

    const body = (post as any).body || '';

    const { dir, desc } = categorizePost(id);
    for (const currentDir of getDirectoryChain(dir)) {
      if (!(currentDir in directories)) {
        directories[currentDir] = DIR_DESCS[currentDir] || (currentDir === dir ? desc : '');
      }
    }

    const text = extractPlainText(body);

    const entry = {
      slug: id,
      title: post.data.title || id,
      date: post.data.date?.toISOString() || '',
      modify_date: post.data.modify_date?.toISOString(),
      tags: post.data.tags || [],
      reading_time: estimateReadingTime(body),
      featured: post.data.featured,
      featuredRank: post.data.featuredRank,
      excerpt: makeExcerpt(text),
    };
    allPosts.push(entry);

    for (const tag of post.data.tags || []) {
      tagSet.add(tag);
    }
  }

  // Sort by date descending
  allPosts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Build background text: first ~300 chars from each post, concatenated
  const backgroundParts: string[] = [];
  let bgLen = 0;
  const BG_MAX = 8000;
  const SNIPPET_LEN = 500;
  for (const post of allPosts) {
    if (bgLen >= BG_MAX) break;
    let snippet = (post.excerpt || '').replace(/\n+/g, ' ').slice(0, SNIPPET_LEN);
    // Strip LaTeX: $...$, $$...$$, \(\), \[\], and common commands
    snippet = snippet.replace(/\$\$[\s\S]*?\$\$/g, '');
    snippet = snippet.replace(/\$[^\$\n]+?\$/g, '');
    snippet = snippet.replace(/\\[\(\)][^\\]*?\\[\)\)]/g, '');
    snippet = snippet.replace(/\\[[\s\S]*?\\]/g, '');
    snippet = snippet.replace(/\\(frac|sum|prod|int|sqrt|lim|alpha|beta|gamma|delta|theta|lambda|mu|sigma|phi|omega|infty|partial|nabla|pm|mp|times|div|cdot|leq|geq|neq|approx|equiv|sim|subset|supset|cup|cap|in|notin|forall|exists|emptyset|varnothing|nabla|ldots|cdots|vdots|ddots)[\s{]*/g, '');
    snippet = snippet.trim();
    if (snippet.length > 20) {
      backgroundParts.push(snippet);
      bgLen += snippet.length;
    }
  }
  const backgroundText = backgroundParts.join(' ').slice(0, BG_MAX);

  return {
    posts: allPosts,
    tags: [...tagSet].sort(),
    directories,
    backgroundText,
  };
}

export function buildFileSystem(index: ContentIndex): Record<string, FileEntry[]> {
  const fs: Record<string, FileEntry[]> = {};

  const ensureDir = (path: string) => {
    if (!fs[path]) fs[path] = [];
    return fs[path];
  };

  const addDirEntry = (dir: string, desc: string) => {
    const normalizedDir = dir.endsWith('/') ? dir : `${dir}/`;
    const trimmed = normalizedDir.replace(/\/$/, '');
    const slashIdx = trimmed.lastIndexOf('/');
    const parentPath = slashIdx === -1 ? '/' : `/${trimmed.substring(0, slashIdx + 1)}`;
    const name = slashIdx === -1 ? normalizedDir : `${trimmed.substring(slashIdx + 1)}/`;
    const parent = ensureDir(parentPath);
    if (!parent.some(entry => entry.type === 'dir' && entry.name === name)) {
      parent.push({ name, type: 'dir', desc });
    }
    ensureDir(`/${normalizedDir}`);
  };

  ensureDir('/');
  for (const [dir, desc] of Object.entries(index.directories)) {
    addDirEntry(dir, desc);
  }
  // index.md at root
  const indexPost = index.posts.find(p => p.slug === 'index');
  if (indexPost) {
    ensureDir('/').push({
      name: 'index.md',
      type: 'file',
      title: indexPost.title,
      date: indexPost.date,
      tags: indexPost.tags,
      slug: indexPost.slug,
    });
  }

  // Build per-directory file lists
  for (const post of index.posts) {
    if (post.slug === 'index') continue;

    const { dir } = categorizePost(post.slug);
    const dirPath = '/' + dir;

    ensureDir(dirPath);

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
