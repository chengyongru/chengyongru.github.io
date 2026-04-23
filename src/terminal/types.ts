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
  text?: string;
}

export interface ContentIndex {
  posts: PostMeta[];
  tags: string[];
  directories: Record<string, string>; // dir slug -> description
}

export interface CommandContext {
  cwd: string;
  output: (html: string, className?: string) => void;
  appendInputLine: (cmd: string) => void;
  openViewer: (title: string, html: string) => void;
  getCurrentFiles: () => FileEntry[];
  setCwd: (path: string) => void;
  _history?: string[];
}
