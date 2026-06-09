import { describe, expect, it } from 'vitest';
import { completeTerminalInput } from '../autocomplete';
import { parseCommandLine, quoteCommandArg } from '../command-line';
import type { FileEntry } from '../types';

const fs: Record<string, FileEntry[]> = {
  '/': [
    { name: 'notebook/', type: 'dir', desc: 'Notes' },
  ],
  '/notebook/': [
    {
      name: 'mc-dropout.md',
      type: 'file',
      slug: 'notebook/mc-dropout',
      title: 'MC Dropout:利用 Dropout 进行近似贝叶斯推断',
    },
    {
      name: 'mc-dropout-standard.md',
      type: 'file',
      slug: 'notebook/mc-dropout-standard',
      title: 'MC Dropout vs. 标准 Dropout',
    },
    {
      name: 'arima.md',
      type: 'file',
      slug: 'notebook/arima',
      title: 'ARIMA Model',
    },
  ],
};

function listDir(path: string): FileEntry[] | undefined {
  return fs[path];
}

function resolvePath(cwd: string, target: string): string {
  if (target === '~' || target === '') return '/';
  if (target.startsWith('/')) return target;
  const joined = cwd.replace(/\/$/, '') + '/' + target.replace(/^\//, '');
  const parts = joined.split('/').filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.') resolved.push(part);
  }
  const path = '/' + resolved.join('/');
  return target.endsWith('/') && path !== '/' ? path + '/' : path || '/';
}

const commands = ['ls', 'cd', 'cat', 'grep'];

describe('command line parsing', () => {
  it('preserves a quoted title as one argument even when the quote is unfinished', () => {
    expect(parseCommandLine('cat "MC Dropout', true)).toEqual(['cat', 'MC Dropout']);
  });

  it('quotes arguments with spaces', () => {
    expect(quoteCommandArg('notebook/ARIMA Model')).toBe('"notebook/ARIMA Model"');
  });
});

describe('terminal autocomplete', () => {
  it('continues cycling after completing a quoted multi-word cat title prefix', () => {
    const first = completeTerminalInput({
      input: 'cat MC',
      cwd: '/notebook/',
      tabCycle: null,
      commands,
      listDir,
      resolvePath,
    });

    expect(first.input).toBe('cat "MC Dropout');
    expect(first.tabCycle?.matches).toHaveLength(2);

    const second = completeTerminalInput({
      input: first.input,
      cwd: '/notebook/',
      tabCycle: first.tabCycle,
      commands,
      listDir,
      resolvePath,
    });

    expect(second.input).toBe('cat "MC Dropout:利用 Dropout 进行近似贝叶斯推断"');
    expect(second.tabCycle?.idx).toBe(0);
  });

  it('completes ls file targets by article title', () => {
    const result = completeTerminalInput({
      input: 'ls AR',
      cwd: '/notebook/',
      tabCycle: null,
      commands,
      listDir,
      resolvePath,
    });

    expect(result.input).toBe('ls "ARIMA Model"');
  });

  it('does not complete file titles for cd', () => {
    const result = completeTerminalInput({
      input: 'cd AR',
      cwd: '/notebook/',
      tabCycle: null,
      commands,
      listDir,
      resolvePath,
    });

    expect(result.input).toBe('cd AR');
    expect(result.tabCycle).toBeNull();
  });

  it('completes nested cat targets by title after a directory prefix', () => {
    const result = completeTerminalInput({
      input: 'cat notebook/AR',
      cwd: '/',
      tabCycle: null,
      commands,
      listDir,
      resolvePath,
    });

    expect(result.input).toBe('cat "notebook/ARIMA Model"');
  });
});
