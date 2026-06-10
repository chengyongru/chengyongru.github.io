// ============================================================
// Shared Constants — used by both build-time (content-index.ts)
// and runtime (file-tree.ts) to keep filter logic in sync
// ============================================================

/** Directories excluded from the virtual file system */
export const BLOCKED_DIRS = [
  'clippings', '_obsidian', '.obsidian', '.trash', '.claude', 'img', 'src',
] as const;

function isPrivatePathPart(part: string): boolean {
  return part.startsWith('.');
}

/** Returns true if a slug should be hidden from generated routes and terminal output. */
export function shouldFilterSlug(slug: string): boolean {
  const parts = slug.split('/').filter(Boolean);
  const filename = parts[parts.length - 1]?.toLowerCase() || '';
  if (filename === 'claude' || isPrivatePathPart(filename)) return true;
  if (parts.some(isPrivatePathPart)) return true;
  if (parts.some(part => BLOCKED_DIRS.includes(part.toLowerCase() as any))) return true;
  return false;
}
