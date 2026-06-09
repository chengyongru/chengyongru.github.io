import type { FileEntry } from './types';
import { parseCommandLine, quoteCommandArg } from './command-line';

export interface TabCycleState {
  matches: string[];
  idx: number;
  base: string;
  descs?: Record<string, string>;
}

interface CompleteInputOptions {
  input: string;
  cwd: string;
  tabCycle: TabCycleState | null;
  shiftKey?: boolean;
  commands: string[];
  listDir: (path: string) => FileEntry[] | undefined;
  resolvePath: (cwd: string, target: string) => string;
}

interface CompleteInputResult {
  input: string;
  tabCycle: TabCycleState | null;
}

function longestCommonPrefix(strs: string[]): string {
  if (strs.length < 2) return strs[0] || '';
  let i = 0;
  while (true) {
    const ch = strs[0][i];
    if (ch === undefined) break;
    if (!strs.every(s => s[i] === ch)) break;
    i++;
  }
  return strs[0].slice(0, i);
}

function fileDisplayName(file: FileEntry): string {
  const fallback = file.name.replace(/\.md$/i, '');
  if (!file.title) return fallback;
  if (!file.title.includes('/')) return file.title;
  return file.title.replace(/^.*\//, '').replace(/\.md$/i, '') || fallback;
}

function completionValue(dirPart: string, value: string): string {
  return quoteCommandArg(dirPart + value);
}

function replaceLastToken(parts: string[], replacement: string): string {
  const next = [...parts];
  next[next.length - 1] = replacement;
  return next.join(' ');
}

function pathCandidates(
  cmdName: string,
  word: string,
  cwd: string,
  listDir: CompleteInputOptions['listDir'],
  resolvePath: CompleteInputOptions['resolvePath'],
): { candidates: string[]; descs?: Record<string, string> } {
  const lastSlash = word.lastIndexOf('/');
  const dirPart = lastSlash >= 0 ? word.substring(0, lastSlash + 1) : '';
  const itemPrefix = word.substring(lastSlash + 1).toLowerCase();
  const resolvedDir = dirPart ? resolvePath(cwd, dirPart) : cwd;
  const files = listDir(resolvedDir) || [];

  const dirMatches = files.filter(f => f.type === 'dir' && f.name.toLowerCase().startsWith(itemPrefix));

  if (cmdName === 'cd') {
    const candidates = dirMatches.map(f => dirPart + f.name);
    return {
      candidates,
      descs: Object.fromEntries(dirMatches.map(f => [dirPart + f.name, f.desc || ''])),
    };
  }

  if (cmdName !== 'cat' && cmdName !== 'ls') {
    return { candidates: [] };
  }

  let fileMatches = files.filter(f =>
    f.type === 'file' && fileDisplayName(f).toLowerCase().startsWith(itemPrefix),
  );
  if (fileMatches.length === 0) {
    fileMatches = files.filter(f =>
      f.type === 'file' && f.name.toLowerCase().startsWith(itemPrefix),
    );
  }
  if (fileMatches.length === 0) {
    fileMatches = files.filter(f =>
      f.type === 'file' && fileDisplayName(f).toLowerCase().includes(itemPrefix),
    );
  }

  const candidates = [
    ...dirMatches.map(f => dirPart + f.name),
    ...fileMatches.map(f => completionValue(dirPart, fileDisplayName(f))),
  ];

  const descs = Object.fromEntries(
    [
      ...dirMatches.map(f => [dirPart + f.name, f.desc || ''] as const),
      ...fileMatches.map(f => [completionValue(dirPart, fileDisplayName(f)), f.desc || ''] as const),
    ],
  );

  return { candidates, descs };
}

export function completeTerminalInput(options: CompleteInputOptions): CompleteInputResult {
  const parts = parseCommandLine(options.input, true);
  const isCmd = parts.length <= 1;
  const cmdName = (parts[0] || '').toLowerCase();
  const word = isCmd ? (parts[0] || '') : (parts[parts.length - 1] || '');
  const lword = word.toLowerCase();

  let candidates: string[];
  let descs: Record<string, string> | undefined;

  if (isCmd) {
    candidates = options.commands.filter(c => c.startsWith(lword));
  } else {
    const result = pathCandidates(cmdName, word, options.cwd, options.listDir, options.resolvePath);
    candidates = result.candidates;
    descs = result.descs;
  }

  if (candidates.length === 0) {
    return { input: options.input, tabCycle: null };
  }

  if (candidates.length === 1) {
    const nextInput = isCmd
      ? `${candidates[0]} `
      : replaceLastToken(parts, candidates[0]);
    return { input: nextInput, tabCycle: null };
  }

  const dir = options.shiftKey ? -1 : 1;

  if (options.tabCycle && lword.startsWith(options.tabCycle.base)) {
    const matches = options.tabCycle.matches;
    const next = options.tabCycle.idx === -1
      ? (dir === 1 ? 0 : matches.length - 1)
      : (options.tabCycle.idx + dir + matches.length) % matches.length;
    const picked = matches[next];
    const nextInput = isCmd ? `${picked} ` : replaceLastToken(parts, picked);
    return {
      input: nextInput,
      tabCycle: { matches, idx: next, base: options.tabCycle.base, descs: options.tabCycle.descs },
    };
  }

  const common = longestCommonPrefix(candidates);
  const nextInput = common.length > lword.length
    ? (isCmd ? common : replaceLastToken(parts, common))
    : options.input;

  return {
    input: nextInput,
    tabCycle: { matches: candidates, idx: -1, base: lword, descs },
  };
}
