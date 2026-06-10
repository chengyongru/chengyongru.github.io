// ============================================================
// Virtual File System - Client-side
// Loads content-index.json and provides file navigation
// ============================================================

import type { ContentIndex, FileEntry, PostContent, PostMeta, SearchResult } from './types';
import { shouldFilterSlug } from './constants';

let index: ContentIndex | null = null;
let fileSystem: Record<string, FileEntry[]> | null = null;
const postContentCache = new Map<string, PostContent | null>();
const postTextCache = new Map<string, string>();

export async function loadFileSystem(): Promise<void> {
  if (index) return;

  try {
    const res = await fetch('/content-index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    index = await res.json();
    // Build file system from index
    fileSystem = buildFS();
  } catch (err) {
    console.error('Failed to load content index:', err);
    index = { posts: [], tags: [], directories: {} };
    fileSystem = {};
  }
}

export function buildFS(): Record<string, FileEntry[]> {
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
  for (const [dir, desc] of Object.entries(index!.directories)) {
    if (shouldFilterSlug(`${dir}index`)) continue;
    addDirEntry(dir, desc);
  }
  const indexPost = index!.posts.find(p => p.slug === 'index');
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

  // Per-directory file lists
  for (const post of index!.posts) {
    if (post.slug === 'index' || shouldFilterSlug(post.slug)) continue;
    const dir = categorizeDir(post.slug);
    const dirPath = '/' + dir;
    ensureDir(dirPath);
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

export function categorizeDir(slug: string): string {
  const slashIdx = slug.lastIndexOf('/');
  if (slashIdx > -1) return slug.substring(0, slashIdx + 1);
  if (slug.match(/^\d{4}-\d{2}-\d{2}$/)) return 'diary/';
  return 'notebook/';
}

export function listDir(path: string): FileEntry[] | undefined {
  if (!fileSystem) return undefined;
  const normalized = path === '~' || path === '' ? '/' : path;
  return fileSystem[normalized];
}

export function getAllPosts(): PostMeta[] {
  if (!index) return [];
  return index.posts;
}

export function getAllTags(): string[] {
  if (!index) return [];
  return index.tags;
}

export function resolvePath(cwd: string, target: string): string {
  if (target === '~' || target === '') return '/';
  if (target.startsWith('/')) return target;
  // Join cwd + target, then normalize .. segments
  const joined = cwd.replace(/\/$/, '') + '/' + target.replace(/^\//, '');
  const parts = joined.split('/').filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.') {
      resolved.push(part);
    }
  }
  // Preserve trailing slash if target ended with one
  const path = '/' + resolved.join('/') || '/';
  return target.endsWith('/') && path !== '/' ? path + '/' : path;
}

export function getPostUrl(slug: string): string {
  const encodedSlug = slug.split('/').map(encodeURIComponent).join('/');
  return `/blog/${encodedSlug}/`;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase();
}

function postMatchesMetadata(post: PostMeta, query: string): SearchResult | null {
  if (post.title.toLowerCase().includes(query)) return { post, matchedIn: 'metadata' };
  if (post.slug.toLowerCase().includes(query)) return { post, matchedIn: 'metadata' };
  if (post.tags.some(t => t.toLowerCase().includes(query))) return { post, matchedIn: 'metadata' };

  const excerpt = post.excerpt || post.text || '';
  if (excerpt.toLowerCase().includes(query)) return { post, matchedIn: 'excerpt' };

  return null;
}

function htmlToText(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const parsedText = doc.body?.textContent?.replace(/\s+/g, ' ').trim();
    if (parsedText) return parsedText;
  }
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function removePostChrome(html: string): string {
  return html
    .replace(/<([a-z0-9-]+)\b[^>]*class=["'][^"']*\bpost-header\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<([a-z0-9-]+)\b[^>]*class=["'][^"']*\bpost-footer\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, '');
}

function extractArticleFromHtml(html: string, slug: string): { title: string; html: string } | null {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const article = doc.querySelector('article');
    if (article) {
      const title = article.querySelector('h1')?.textContent || slug;
      article.querySelector('.post-header')?.remove();
      article.querySelector('.post-footer')?.remove();
      return { title, html: article.innerHTML };
    }
  }

  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (!articleMatch) return null;

  const rawArticle = articleMatch[1];
  const title = rawArticle.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim() || slug;

  return {
    title,
    html: removePostChrome(rawArticle),
  };
}

async function fetchPostText(slug: string): Promise<string> {
  const key = slug.toLowerCase();
  const cached = postTextCache.get(key);
  if (cached !== undefined) return cached;

  const content = await fetchPostContent(slug);
  const text = content ? htmlToText(content.html) : '';
  postTextCache.set(key, text);
  return text;
}

/** Fetch a blog post's content by extracting the article from the rendered page */
export async function fetchPostContent(slug: string): Promise<PostContent | null> {
  const cacheKey = slug.toLowerCase();
  if (postContentCache.has(cacheKey)) {
    return postContentCache.get(cacheKey) || null;
  }

  const url = getPostUrl(slug);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      postContentCache.set(cacheKey, null);
      return null;
    }
    const html = await res.text();
    const article = extractArticleFromHtml(html, slug);
    if (!article) {
      postContentCache.set(cacheKey, null);
      return null;
    }
    const meta = index?.posts.find(p => p.slug.toLowerCase() === slug.toLowerCase());
    const content = {
      title: article.title,
      html: article.html,
      slug,
      date: meta?.date,
      tags: meta?.tags,
      reading_time: meta?.reading_time,
    };
    postContentCache.set(cacheKey, content);
    postTextCache.set(cacheKey, htmlToText(content.html));
    return content;
  } catch {
    postContentCache.set(cacheKey, null);
    return null;
  }
}

export async function searchPosts(rawQuery: string): Promise<SearchResult[]> {
  const query = normalizeSearchText(rawQuery.trim());
  if (!query || !index) return [];

  const results: SearchResult[] = [];
  const matched = new Set<string>();

  for (const post of index.posts) {
    const metadataMatch = postMatchesMetadata(post, query);
    if (metadataMatch) {
      results.push(metadataMatch);
      matched.add(post.slug.toLowerCase());
    }
  }

  for (const post of index.posts) {
    const key = post.slug.toLowerCase();
    if (matched.has(key)) continue;
    const text = await fetchPostText(post.slug);
    if (text.toLowerCase().includes(query)) {
      results.push({ post, matchedIn: 'content' });
      matched.add(key);
    }
  }

  return results;
}
