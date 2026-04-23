// ============================================================
// Type Definitions for Terminal Prototype
// ============================================================

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  title?: string;
  date?: string;
  tags?: string[];
  desc?: string;
}

export interface PostContent {
  title: string;
  date: string;
  tags: string[];
  html: string;
}

export interface CommandContext {
  cwd: string;
  output: (html: string, className?: string) => void;
  appendInputLine: (cmd: string) => void;
  openViewer: (title: string, html: string) => void;
  getCurrentFiles: () => FileEntry[];
  setCwd: (path: string) => void;
}
