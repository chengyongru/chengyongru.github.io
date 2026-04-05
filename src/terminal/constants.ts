// ============================================================
// Shared Constants — used by both build-time (content-index.ts)
// and runtime (file-tree.ts) to keep filter logic in sync
// ============================================================

/** Directories excluded from the virtual file system */
export const BLOCKED_DIRS = [
  'clippings', '_obsidian', '.obsidian', '.trash', '.claude', 'img', 'src',
] as const;

/** Returns true if a slug should be hidden (claude file or blocked dir) */
export function shouldFilterSlug(slug: string): boolean {
  const parts = slug.split('/');
  const filename = parts[parts.length - 1]?.toLowerCase() || '';
  if (filename === 'claude') return true;
  const firstDir = parts[0]?.toLowerCase() || '';
  if (BLOCKED_DIRS.includes(firstDir as any)) return true;
  return false;
}
