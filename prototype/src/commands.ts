// ============================================================
// Command Implementations
// ============================================================

import type { CommandContext, FileEntry } from './types';
import { FILE_SYSTEM, POST_CONTENTS, ALL_TAGS } from './file-system';

/** Escape HTML entities */
function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Resolve a path relative to current working directory */
function resolvePath(path: string, cwd: string): string {
  if (path === '~' || path === '') return '/';
  if (path === '..') {
    if (cwd === '/') return '/';
    const parts = cwd.replace(/\/$/, '').split('/');
    parts.pop();
    return parts.join('/') || '/';
  }
  if (!path.startsWith('/')) {
    path = cwd.replace(/\/$/, '') + '/' + path;
  }
  return path.endsWith('/') ? path : path + '/';
}

export function getPrompt(cwd: string): string {
  if (cwd === '/') return 'visitor@chengyongru:~$ ';
  const dir = cwd.replace(/^\//, '').replace(/\/$/, '');
  return `visitor@chengyongru:~/${dir}$ `;
}

/** List all available commands */
export function getAllCommands(): string[] {
  return [
    'ls', 'cd', 'cat', 'grep', 'tag', 'recent',
    'about', 'neofetch', 'theme', 'help', 'clear',
    'whoami', 'echo', 'date', 'history', 'pwd',
  ];
}

/** Execute a command */
export function executeCommand(cmd: string, ctx: CommandContext): void {
  if (!cmd) return;

  // Tokenize: respect quoted strings
  const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case 'ls': cmdLS(args, ctx); break;
    case 'cd': cmdCD(args, ctx); break;
    case 'cat': cmdCAT(args, ctx); break;
    case 'help': cmdHELP(ctx); break;
    case 'clear': cmdCLEAR(ctx); break;
    case 'grep': cmdGREP(args, ctx); break;
    case 'tag': cmdTAG(args, ctx); break;
    case 'recent': cmdRECENT(ctx); break;
    case 'about': cmdABOUT(ctx); break;
    case 'neofetch': cmdNEOFETCH(ctx); break;
    case 'whoami': cmdWHOAMI(ctx); break;
    case 'echo': cmdECHO(args, ctx); break;
    case 'date': cmdDATE(ctx); break;
    case 'history': cmdHISTORY(ctx); break;
    case 'pwd': cmdPWD(ctx); break;
    case 'sudo':
      ctx.output(
        '<span class="error-msg">[sudo] password for visitor: </span><span class="dim">Nice try.</span>'
      );
      break;
    default:
      ctx.output(
        `<span class="error-msg">command not found: ${esc(command)}. Type 'help' for available commands.</span>`
      );
  }
}

// ---- ls ----
function cmdLS(args: string[], ctx: CommandContext): void {
  let targetDir = ctx.cwd;
  let page = 1;

  for (const arg of args) {
    if (/^\d+$/.test(arg)) {
      page = parseInt(arg);
    } else if (arg.endsWith('/')) {
      targetDir = resolvePath(arg, ctx.cwd);
    }
  }

  const files = FILE_SYSTEM[targetDir];
  if (!files) {
    ctx.output(`<span class="error-msg">ls: cannot access '${esc(targetDir)}': No such directory</span>`);
    return;
  }

  if (files.length === 0) {
    ctx.output('<span class="dim">(empty)</span>');
    return;
  }

  const perPage = 12;
  const totalPages = Math.ceil(files.length / perPage);
  page = Math.max(1, Math.min(page, totalPages));
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const pageFiles = files.slice(start, end);

  let output = '';
  for (const f of pageFiles) {
    if (f.type === 'dir') {
      output += `<div><a class="clickable dir-item" data-path="${targetDir}${f.name}" onclick="handleClick(this)">${esc(f.name)}</a>  <span class="dim">${esc(f.desc || '')}</span></div>`;
    } else if (f.title) {
      output += `<div><a class="clickable file-item" data-file="${f.name}" onclick="handleClick(this)">${esc(f.name)}</a>  <span class="dim">${f.date || ''}</span> ${f.tags ? f.tags.map(t => `<span class="tag-badge">${t}</span>`).join('') : ''}</div>`;
    } else {
      output += `<div><a class="clickable file-item" data-file="${f.name}" onclick="handleClick(this)">${esc(f.name)}</a>  <span class="dim">${esc(f.desc || '')}</span></div>`;
    }
  }

  if (totalPages > 1) {
    output += `<div class="dim" style="margin-top:8px;">-- page ${page}/${totalPages} --  <a class="clickable" onclick="executeCommandFromOutput('ls ${targetDir === '/' ? '~' : targetDir} ${(page + 1)}')">next &rarr;</a></div>`;
  }

  ctx.output(output);
}

// ---- cd ----
function cmdCD(args: string[], ctx: CommandContext): void {
  if (args.length === 0) {
    ctx.setCwd('/');
    ctx.output('<span class="dim">Changed to home directory.</span>');
    return;
  }

  const target = args[0];

  if (target === '..') {
    if (ctx.cwd === '/') {
      ctx.output('<span class="info-msg">Already at root.</span>');
      return;
    }
    const parts = ctx.cwd.replace(/\/$/, '').split('/');
    parts.pop();
    ctx.setCwd(parts.join('/') || '/');
    ctx.output('');
    return;
  }

  if (target === '~' || target === '/') {
    ctx.setCwd('/');
    ctx.output('');
    return;
  }

  const newPath = resolvePath(target, ctx.cwd);
  if (FILE_SYSTEM[newPath]) {
    ctx.setCwd(newPath);
    ctx.output('');
  } else {
    ctx.output(`<span class="error-msg">cd: ${esc(target)}: No such directory</span>`);
  }
}

// ---- cat ----
function cmdCAT(args: string[], ctx: CommandContext): void {
  if (args.length === 0) {
    ctx.output('<span class="error-msg">cat: missing operand</span>');
    ctx.output("<span class='dim'>Usage: cat &lt;filename&gt;</span>");
    return;
  }

  const filename = args[0];

  // Search across ALL directories (like a real terminal)
  const allFiles: Array<FileEntry & { title?: string; date?: string; tags?: string[] }> =
    Object.values(FILE_SYSTEM).flat().filter((f) => f.type !== 'dir');

  // Exact match first, then partial match
  let found = allFiles.find((f) => f.name.toLowerCase() === filename.toLowerCase());
  if (!found) {
    found = allFiles.find((f) => f.name.toLowerCase().includes(filename.toLowerCase()));
  }

  if (!found) {
    ctx.output(`<span class="error-msg">cat: ${esc(filename)}: No such file</span>`);
    return;
  }

  // File found — check if we have full content or need placeholder
  const post = POST_CONTENTS[found.name];
  if (post) {
    ctx.openViewer(post.title, post.html);
  } else {
    ctx.openViewer(found.title || found.name.replace('.md', ''), makePlaceholder(found));
  }
}

/** Generate a placeholder article for prototype files without full content */
function makePlaceholder(file: FileEntry & { title?: string; date?: string; tags?: string[] }): string {
  const title = file.title || file.name.replace('.md', '');
  const tagsHtml = file.tags?.map((t) => `<span class="tag-badge">${t}</span>`).join('') || '';
  const dateStr = file.date || 'TBD';

  return `
    <h1>${esc(title)}</h1>
    <p>${tagsHtml}</p>
    <div style="border-left:3px solid var(--mauve);padding:12px 16px;margin:16px 0;background:rgba(203,166,247,0.08);border-radius:0 6px 6px 0;">
      <p style="margin:0;color:var(--subtext);">
        <span class="mauve" style="font-weight:bold;">[Prototype Mode]</span> This article exists in the file system but full content has not been migrated yet.
        The complete version will be available after Phase 1 (Astro scaffold) is built with real markdown rendering.
      </p>
    </div>
    <h2>Metadata</h2>
    <table>
      <tr><th>File</th><td><code>${esc(file.name)}</code></td></tr>
      <tr><th>Date</th><td>${esc(dateStr)}</td></tr>
      <tr><th>Tags</th><td>${file.tags?.map((t) => esc(t)).join(', ') || '<span class="dim">none</span>'}</td></tr>
    </table>
  `;
}

// ---- help ----
function cmdHELP(ctx: CommandContext): void {
  const helpContent = `
<div class="bold peach" style="margin-bottom:8px;">═══ Available Commands ═══</div>
<table class="help-table">
<tr><td>ls [dir] [page]</td><td>List directory contents</td></tr>
<tr><td>cd &lt;dir&gt;</td><td>Change directory (.. for parent, ~ for home)</td></tr>
<tr><td>cat &lt;file&gt;</td><td>Read a post</td></tr>
<tr><td>grep &lt;query&gt;</td><td>Search across all posts</td></tr>
<tr><td>tag [name]</td><td>List all tags / filter by tag</td></tr>
<tr><td>recent</td><td>Show 10 most recent posts</td></tr>
<tr><td>about</td><td>About me</td></tr>
<tr><td>neofetch</td><td>System info (ASCII art)</td></tr>
<tr><td>theme [name]</td><td>Switch color scheme</td></tr>
<tr><td>whoami</td><td>Who am I?</td></tr>
<tr><td>echo &lt;text&gt;</td><td>Print text</td></tr>
<tr><td>date</td><td>Show current date/time</td></tr>
<tr><td>history</td><td>Command history</td></tr>
<tr><td>pwd</td><td>Print working directory</td></tr>
<tr><td>clear</td><td>Clear terminal</td></tr>
</table>
<div class="dim" style="margin-top:8px;">Tip: Everything in blue is clickable. Try clicking a filename!</div>`;
  ctx.output(helpContent);
}

// ---- clear ----
function cmdCLEAR(ctx: CommandContext): void {
  const body = document.getElementById('terminal-body');
  if (body) body.innerHTML = '';
}

// ---- grep ----
function cmdGREP(args: string[], ctx: CommandContext): void {
  if (args.length === 0) {
    ctx.output('<span class="error-msg">grep: missing query</span>');
    return;
  }

  const query = args.join(' ').toLowerCase();
  const results: Array<{ name: string; title?: string; date?: string; tags?: string[] }> = [];

  for (const [dirPath, files] of Object.entries(FILE_SYSTEM)) {
    for (const f of files) {
      if (
        f.type !== 'dir' &&
        (f.title?.toLowerCase().includes(query) ||
          f.name?.toLowerCase().includes(query) ||
          f.tags?.some(t => t.toLowerCase().includes(query)))
      ) {
        results.push({ ...f });
      }
    }
  }

  if (results.length === 0) {
    ctx.output(`<span class="dim">No results for "${esc(query)}"</span>`);
    return;
  }

  let output = `<div class="bold teal">Found ${results.length} result(s) for "${esc(query)}":</div>\n`;
  for (const r of results.slice(0, 20)) {
    output += `<div><a class="clickable file-item" data-file="${r.name}" onclick="handleClick(this)">${esc(r.title || r.name)}</a> <span class="dim">${r.date || ''}</span></div>`;
  }
  if (results.length > 20) {
    output += `<div class="dim">...and ${results.length - 20} more</div>`;
  }
  ctx.output(output);
}

// ---- tag ----
function cmdTAG(args: string[], ctx: CommandContext): void {
  if (args.length === 0) {
    const tagCounts: Record<string, number> = {};
    Object.values(FILE_SYSTEM)
      .flat()
      .filter((f): f is { tags: string[] } => Array.isArray(f.tags))
      .forEach(f => {
        (f.tags || []).forEach(t => {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
      });

    let output = `<div class="bold mauve">All Tags (${Object.keys(tagCounts).length}):</div>\n`;
    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    for (const [tag, count] of sortedTags) {
      output += `<div><a class="clickable" onclick="executeCommandFromOutput('tag ${esc(tag)}')"><span class="tag-badge">${esc(tag)}</span></a> <span class="dim">(${count})</span></div>`;
    }
    ctx.output(output);
  } else {
    const tagName = args[0];
    const results = Object.values(FILE_SYSTEM)
      .flat()
      .filter(
        (f): f is { name: string; title?: string; date?: string; tags: string[] } =>
          f.type !== 'dir' && f.tags?.some(t => t.toLowerCase() === tagName.toLowerCase()),
      );

    if (results.length === 0) {
      ctx.output(`<span class="dim">No posts tagged with "${esc(tagName)}"</span>`);
      return;
    }

    let output = `<div class="bold mauve">Posts tagged "<span class="tag-badge">${esc(tagName)}"</span>" (${results.length}):</div>\n`;
    for (const r of results) {
      output += `<div><a class="clickable file-item" data-file="${r.name}" onclick="handleClick(this)">${esc(r.title || r.name)}</a> <span class="dim">${r.date || ''}</span></div>`;
    }
    ctx.output(output);
  }
}

// ---- recent ----
function cmdRECENT(ctx: CommandContext): void {
  const allPosts = Object.values(FILE_SYSTEM)
    .flat()
    .filter((f): f is { name: string; title?: string; date: string } => f.type !== 'dir' && !!f.date);

  allPosts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  let output = '<div class="bold teal">10 Most Recent Posts:</div>\n';
  for (const p of allPosts.slice(0, 10)) {
    output += `<div><a class="clickable file-item" data-file="${p.name}" onclick="handleClick(this)">${esc(p.title || p.name)}</a> <span class="yellow">${p.date || ''}</span></div>`;
  }
  ctx.output(output);
}

// ---- about ----
function cmdABOUT(ctx: CommandContext): void {
  const about = POST_CONTENTS['about.md'];
  if (about) ctx.openViewer(about.title, about.html);
}

// ---- neofetch ----
function cmdNEOFETCH(ctx: CommandContext): void {
  const asciiArt = `
        <span class="green">.-.-.</span>   <span class="dim">-----------------------------</span>
        <span class="green">/ o o \\</span>  <span class="peach">OS:</span>       ChengYongruOS v4.0
        <span class="green">\\  ^  /</span>  <span class="peach">Host:</span>     Digital Garden
        <span class="green">\`-/-'</span>   <span class="peach">Kernel:</span>   Astro + Preact
        <span class="green"> |  |</span>    <span class="peach">Shell:</span>    Terminal UI
        <span class="green">|_|_|</span>    <span class="peach">Editor:</span>   VS Code + Obsidian
                  <span class="peach">Languages:</span> Python, C++, TypeScript
                  <span class="peach">Focus:</span>    ML, Security, Reverse Engineering
                  <span class="peach">Uptime:</span>   Since 2025
                  <span class="peach">Theme:</span>    Catppuccin Mocha`;

  ctx.output(`<pre style="line-height:1.4;font-size:13px;">${asciiArt}</pre>`);
}

// ---- whoami ----
function cmdWHOAMI(ctx: CommandContext): void {
  ctx.output(
    `<span class="green">visitor</span> — an explorer of this digital garden.\n` +
    '<span class="dim">You are reading the notes of Cheng Yongru, algorithm engineer.</span>',
  );
}

// ---- echo ----
function cmdECHO(args: string[], ctx: CommandContext): void {
  ctx.output(args.join(' '));
}

// ---- date ----
function cmdDATE(ctx: CommandContext): void {
  const now = new Date();
  const formatted = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
  });
  ctx.output(formatted);
}

// ---- history ----
function cmdHISTORY(ctx: CommandContext): void {
  const history = (window as unknown as { __cmdHistory?: string[] }).__cmdHistory || [];
  if (history.length === 0) {
    ctx.output('<span class="dim">(no commands yet)</span>');
    return;
  }
  let output = '';
  history.forEach((cmd: string, i: number) => {
    output += `<div><span class="dim">${String(i + 1).padStart(4, ' ')}</span>  ${esc(cmd)}</div>`;
  });
  ctx.output(output);
}

// ---- pwd ----
function cmdPWD(ctx: CommandContext): void {
  ctx.output(ctx.cwd === '/' ? '/' : ctx.cwd.replace(/\/$/, ''));
}
