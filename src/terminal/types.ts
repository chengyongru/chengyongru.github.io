// ============================================================
// Type Definitions for Terminal
// ============================================================

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  title?: string;
  date?: string;
  tags?: string[];
  desc?: string;
  slug?: string;
}

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  modify_date?: string;
  tags: string[];
  reading_time: number;
  featured?: boolean;
  featuredRank?: number;
  excerpt?: string;
  /** Backward-compatible legacy field; generated indexes should prefer excerpt. */
  text?: string;
}

export interface SearchResult {
  post: PostMeta;
  matchedIn: 'metadata' | 'excerpt' | 'content';
}

export interface PostContent {
  title: string;
  html: string;
  slug: string;
  date?: string;
  tags?: string[];
  reading_time?: number;
}

export interface ContentIndex {
  posts: PostMeta[];
  tags: string[];
  directories: Record<string, string>; // dir slug -> description
  backgroundText?: string; // concatenated first ~300 chars from each post for background effect
}

export interface CommandContext {
  cwd: string;
  output: (html: string, className?: string) => void;
  appendInputLine: (cmd: string) => void;
  openViewer: (post: PostContent) => void;
  getCurrentFiles: () => FileEntry[];
  setCwd: (path: string) => void;
  _history?: string[];
}
