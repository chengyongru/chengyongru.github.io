// ============================================================
// Virtual File System - Client-side
// Loads content-index.json and provides file navigation
// ============================================================

import type { ContentIndex, FileEntry } from './types';

let index: ContentIndex | null = null;
let fileSystem: Record<string, FileEntry[]> | null = null;

// Directories to exclude from the virtual file system
const BLOCKED_DIRS = ['clippings', '_obsidian', '.obsidian', '.trash', '.claude', 'img', 'src'];

function shouldFilterSlug(slug: string): boolean {
  const parts = slug.split('/');
  const filename = parts[parts.length - 1]?.toLowerCase() || '';
  if (filename === 'claude') return true;
  const firstDir = parts[0]?.toLowerCase() || '';
  if (BLOCKED_DIRS.includes(firstDir)) return true;
  return false;
}

export async function loadFileSystem(): Promise<void> {
  if (index) return;

  const res = await fetch('/content-index.json');
  index = await res.json();

  // Build file system from index
  fileSystem = buildFS();
}

export function buildFS(): Record<string, FileEntry[]> {
  const fs: Record<string, FileEntry[]> = {};

  // Root directory
  const root: FileEntry[] = [];
  for (const [dir, desc] of Object.entries(index!.directories)) {
    const firstDir = dir.replace(/\/$/, '').toLowerCase();
    if (BLOCKED_DIRS.includes(firstDir)) continue;
    root.push({ name: dir, type: 'dir', desc });
  }
  const indexPost = index!.posts.find(p => p.slug === 'index');
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

  // Per-directory file lists
  for (const post of index!.posts) {
    if (post.slug === 'index' || shouldFilterSlug(post.slug)) continue;
    const dir = categorizeDir(post.slug, post.tags);
    const dirPath = '/' + dir;
    if (!fs[dirPath]) fs[dirPath] = [];
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

export function categorizeDir(slug: string, _tags: string[]): string {
  const slashIdx = slug.indexOf('/');
  if (slashIdx > -1) return slug.substring(0, slashIdx + 1);
  if (slug.match(/^\d{4}-\d{2}-\d{2}$/)) return 'diary/';
  return 'notebook/';
}

export function listDir(path: string): FileEntry[] | undefined {
  if (!fileSystem) return undefined;
  const normalized = path === '~' || path === '' ? '/' : path;
  return fileSystem[normalized];
}

export function getFile(slug: string): FileEntry | undefined {
  if (!index) return undefined;
  return index.posts.find(p => p.slug === slug);
}

export function getAllPosts() {
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
  return `/blog/${slug}/`;
}
