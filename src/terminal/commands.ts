// ============================================================
// Command Implementations - Preact Version
// Uses file-tree.ts for data instead of hardcoded FILE_SYSTEM
// ============================================================

import type { CommandContext } from './types';
import {
  listDir,
  getFile,
  getAllPosts,
  getAllTags,
  resolvePath,
  getPostUrl,
} from './file-tree';

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getPrompt(cwd: string): string {
  if (cwd === '/') return 'visitor@chengyongru:~$ ';
  const dir = cwd.replace(/^\//, '').replace(/\/$/, '');
  return `visitor@chengyongru:~/${dir}$ `;
}

export function getAllCommands(): string[] {
  return [
    'ls', 'cd', 'cat', 'grep', 'tag', 'recent',
    'about', 'neofetch', 'help', 'clear', 'theme',
    'whoami', 'echo', 'date', 'history', 'pwd',
  ];
}

export function executeCommand(
  cmd: string,
  ctx: CommandContext,
  onCommandFromOutput?: (cmd: string) => void,
): void {
  if (!cmd.trim()) return;

  const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case 'ls': cmdLS(args, ctx); break;
    case 'cd': cmdCD(args, ctx); break;
    case 'cat': cmdCAT(args, ctx); break;
    case 'help': cmdHELP(ctx, onCommandFromOutput); break;
    case 'grep': cmdGREP(args, ctx); break;
    case 'tag': cmdTAG(args, ctx, onCommandFromOutput); break;
    case 'recent': cmdRECENT(ctx); break;
    case 'about': cmdABOUT(ctx); break;
    case 'neofetch': cmdNEOFETCH(ctx); break;
    case 'whoami': cmdWHOAMI(ctx); break;
    case 'echo': cmdECHO(args, ctx); break;
    case 'date': cmdDATE(ctx); break;
    case 'history': cmdHISTORY(ctx); break;
    case 'pwd': cmdPWD(ctx); break;
    case 'theme': cmdTHEME(args, ctx); break;
    case 'sudo':
      ctx.output(
        `<span style="color:var(--red)">[sudo] password for visitor: </span><span style="color:var(--overlay)">Nice try.</span>`,
      );
      break;
    default:
      ctx.output(
        `<span style="color:var(--red)">command not found: ${esc(command)}. Type 'help' for available commands.</span>`,
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
    } else {
      targetDir = resolvePath(ctx.cwd, arg.endsWith('/') ? arg : arg + '/');
    }
  }

  const files = listDir(targetDir);
  if (!files) {
    ctx.output(`<span style="color:var(--red)">ls: cannot access '${esc(targetDir)}': No such directory</span>`);
    return;
  }
  if (files.length === 0) {
    ctx.output('<span style="color:var(--overlay)">(empty)</span>');
    return;
  }

  const perPage = 12;
  const totalPages = Math.ceil(files.length / perPage);
  page = Math.max(1, Math.min(page, totalPages));
  const start = (page - 1) * perPage;
  const pageFiles = files.slice(start, start + perPage);

  let output = '';
  for (const f of pageFiles) {
    if (f.type === 'dir') {
      output += `<div style="display:flex;gap:12px;"><span class="clickable-dir" data-action="cd" data-path="${targetDir}${f.name}" style="min-width:180px;display:inline-block;">${esc(f.name)}</span><span style="color:var(--overlay);flex:1;">${esc(f.desc || '')}</span></div>`;
    } else if (f.title) {
      const tagsHtml = f.tags ? f.tags.map(t => `<span style="background:var(--surface);color:var(--blue);padding:1px 6px;border-radius:3px;font-size:0.8em;">${esc(t)}</span>`).join(' ') : '';
      output += `<div style="display:flex;gap:12px;align-items:baseline;"><span class="clickable-file" data-action="cat" data-slug="${f.slug || ''}" style="min-width:280px;display:inline-block;">${esc(f.name)}</span><span style="color:var(--overlay);min-width:90px;flex-shrink:0;">${f.date ? f.date.split('T')[0] : ''}</span><span>${tagsHtml}</span></div>`;
    } else {
      output += `<div style="display:flex;gap:12px;"><span class="clickable-file" data-action="cat" data-slug="${f.slug || ''}" style="min-width:180px;display:inline-block;">${esc(f.name)}</span><span style="color:var(--overlay);flex:1;">${esc(f.desc || '')}</span></div>`;
    }
  }

  if (totalPages > 1) {
    const nextCmd = `ls ${targetDir === '/' ? '' : targetDir} ${page + 1}`;
    output += `<div style="color:var(--overlay);margin-top:8px;">-- page ${page}/${totalPages} --  <span class="clickable-file" data-action="cmd" data-cmd="${esc(nextCmd)}">next &rarr;</span></div>`;
  }

  ctx.output(output);
}

// ---- cd ----
function cmdCD(args: string[], ctx: CommandContext): void {
  if (args.length === 0 || args[0] === '~' || args[0] === '/') {
    ctx.setCwd('/');
    ctx.output('');
    return;
  }

  const target = args[0];

  if (target === '..') {
    if (ctx.cwd === '/') {
      ctx.output('<span style="color:var(--overlay)">Already at root.</span>');
      return;
    }
    const parts = ctx.cwd.replace(/\/$/, '').split('/');
    parts.pop();
    ctx.setCwd(parts.join('/') || '/');
    ctx.output('');
    return;
  }

  const newPath = resolvePath(ctx.cwd, target.endsWith('/') ? target : target + '/');
  const files = listDir(newPath);
  if (files) {
    ctx.setCwd(newPath);
    ctx.output('');
  } else {
    ctx.output(`<span style="color:var(--red)">cd: ${esc(target)}: No such directory</span>`);
  }
}

// ---- cat ----
function cmdCAT(args: string[], ctx: CommandContext): void {
  if (args.length === 0) {
    ctx.output('<span style="color:var(--red)">cat: missing operand</span>');
    ctx.output("<span style=\"color:var(--overlay)\">Usage: cat &lt;filename&gt;</span>");
    return;
  }

  const filename = args[0];
  const posts = getAllPosts();

  // Resolve path relative to cwd (handles ../ and ./)
  const rawSlug = filename.replace(/\.md$/i, '');
  const resolvedPath = resolvePath(ctx.cwd, rawSlug);
  const resolvedSlug = resolvedPath.replace(/^\//, '').toLowerCase();

  // 1. Try resolved path as exact slug (e.g., "../index" from /notebook/ → "index")
  let post = posts.find(p => p.slug.toLowerCase() === resolvedSlug);

  // 2. Try without path resolution as exact slug (e.g., "notebook/ARIMA")
  if (!post) {
    const base = rawSlug.toLowerCase();
    post = posts.find(p => p.slug.toLowerCase() === base);
  }

  // 3. Try cwd-prefixed (e.g., cwd="/notebook/" + "ARIMA" → "notebook/ARIMA")
  if (!post && ctx.cwd !== '/') {
    const cwdPrefix = ctx.cwd.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
    post = posts.find(p => p.slug.toLowerCase() === cwdPrefix + '/' + rawSlug.toLowerCase());
  }

  // Fallback: fuzzy substring match on slug and title
  if (!post) {
    const query = resolvedSlug || rawSlug.toLowerCase();
    const fuzzy = posts.filter(p =>
      p.slug.toLowerCase().includes(query) ||
      p.title.toLowerCase().includes(query),
    );

    if (fuzzy.length === 1) {
      post = fuzzy[0];
    } else if (fuzzy.length > 1) {
      ctx.output(`<span style="color:var(--yellow)">Ambiguous match for "${esc(filename)}". Candidates:</span>`);
      for (const f of fuzzy.slice(0, 10)) {
        ctx.output(`<div><span class="clickable-file" data-action="cat" data-slug="${f.slug}">${esc(f.title)}</span> <span style="color:var(--overlay)">${f.slug}</span></div>`);
      }
      return;
    }
  }

  if (!post) {
    ctx.output(`<span style="color:var(--red)">cat: ${esc(filename)}: No such file</span>`);
    return;
  }

  // Fetch the pre-rendered HTML page
  const url = getPostUrl(post.slug);
  ctx.output(`<span style="color:var(--overlay)">Loading ${esc(post.title)}...</span>`);

  fetch(url)
    .then(res => res.text())
    .then(html => {
      // Extract article content from the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const article = doc.querySelector('article');
      if (article) {
        // Strip blog page header/footer — viewer has its own title bar
        article.querySelector('.post-header')?.remove();
        article.querySelector('.post-footer')?.remove();
        ctx.openViewer(post.title, article.innerHTML);
      } else {
        // Fallback: use body content
        const body = doc.querySelector('main') || doc.querySelector('.prose') || doc.body;
        ctx.openViewer(post.title, body.innerHTML);
      }
    })
    .catch(() => {
      ctx.output(`<span style="color:var(--red)">Failed to load: ${esc(post.title)}</span>`);
    });
}

// ---- help ----
function cmdHELP(ctx: CommandContext, onCommandFromOutput?: (cmd: string) => void): void {
  const helpContent = `
<div style="color:var(--peach);font-weight:bold;margin-bottom:8px;">═══ Available Commands ═══</div>
<table style="width:auto;">
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">ls [dir] [page]</td><td style="color:var(--subtext)">List directory contents</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">cd &lt;dir&gt;</td><td style="color:var(--subtext)">Change directory (.. / ~)</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">cat &lt;file&gt;</td><td style="color:var(--subtext)">Read a post</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">grep &lt;query&gt;</td><td style="color:var(--subtext)">Search across all posts</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">tag [name]</td><td style="color:var(--subtext)">List all tags / filter by tag</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">recent</td><td style="color:var(--subtext)">Show 10 most recent posts</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">about</td><td style="color:var(--subtext)">About me</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">neofetch</td><td style="color:var(--subtext)">System info</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">whoami</td><td style="color:var(--subtext)">Who am I?</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">echo &lt;text&gt;</td><td style="color:var(--subtext)">Print text</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">date</td><td style="color:var(--subtext)">Show current date/time</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">history</td><td style="color:var(--subtext)">Command history</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">pwd</td><td style="color:var(--subtext)">Print working directory</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">theme [name]</td><td style="color:var(--subtext)">Switch theme (catppuccin/dracula/gruvbox/solarized)</td></tr>
<tr><td style="color:var(--green);padding-right:16px;white-space:nowrap;">clear</td><td style="color:var(--subtext)">Clear terminal</td></tr>
</table>
<div style="color:var(--overlay);margin-top:8px;">Tip: Blue items are clickable. Try clicking a filename!</div>`;
  ctx.output(helpContent);
}

// ---- grep ----
function cmdGREP(args: string[], ctx: CommandContext): void {
  if (args.length === 0) {
    ctx.output('<span style="color:var(--red)">grep: missing query</span>');
    return;
  }

  const query = args.join(' ').toLowerCase();
  const posts = getAllPosts();

  const results = posts.filter(p => {
    if (p.title.toLowerCase().includes(query)) return true;
    if (p.slug.toLowerCase().includes(query)) return true;
    if (p.tags.some(t => t.toLowerCase().includes(query))) return true;
    if (p.text && p.text.toLowerCase().includes(query)) return true;
    return false;
  });

  if (results.length === 0) {
    ctx.output(`<span style="color:var(--overlay)">No results for "${esc(query)}"</span>`);
    return;
  }

  let output = `<div style="color:var(--teal);font-weight:bold;">Found ${results.length} result(s) for "${esc(query)}":</div>\n`;
  for (const r of results.slice(0, 20)) {
    // Show match context: which field matched
    const matchedIn = r.text?.toLowerCase().includes(query) ? 'content' : 'metadata';
    output += `<div><span class="clickable-file" data-action="cat" data-slug="${r.slug}">${esc(r.title)}</span> <span style="color:var(--overlay)">${r.date ? r.date.split('T')[0] : ''}</span> <span style="color:var(--overlay);font-size:0.85em;">[${matchedIn}]</span></div>`;
  }
  if (results.length > 20) {
    output += `<div style="color:var(--overlay)">...and ${results.length - 20} more</div>`;
  }
  ctx.output(output);
}

// ---- tag ----
function cmdTAG(args: string[], ctx: CommandContext, onCommandFromOutput?: (cmd: string) => void): void {
  if (args.length === 0) {
    const tags = getAllTags();
    const posts = getAllPosts();
    const tagCounts: Record<string, number> = {};
    for (const p of posts) {
      for (const t of p.tags) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    }

    let output = `<div style="color:var(--mauve);font-weight:bold;">All Tags (${Object.keys(tagCounts).length}):</div>\n`;
    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    for (const [tag, count] of sortedTags) {
      output += `<div><span class="clickable-file" data-action="cmd" data-cmd="tag ${esc(tag)}"><span style="background:var(--surface);color:var(--blue);padding:1px 6px;border-radius:3px;font-size:0.8em;">${esc(tag)}</span></span> <span style="color:var(--overlay)">(${count})</span></div>`;
    }
    ctx.output(output);
  } else {
    const tagName = args[0];
    const posts = getAllPosts();
    const results = posts.filter(p =>
      p.tags.some(t => t.toLowerCase() === tagName.toLowerCase()),
    );

    if (results.length === 0) {
      ctx.output(`<span style="color:var(--overlay)">No posts tagged with "${esc(tagName)}"</span>`);
      return;
    }

    let output = `<div style="color:var(--mauve);font-weight:bold;">Posts tagged "<span style="background:var(--surface);color:var(--blue);padding:1px 6px;border-radius:3px;font-size:0.8em;">${esc(tagName)}</span>" (${results.length}):</div>\n`;
    for (const r of results) {
      output += `<div><span class="clickable-file" data-action="cat" data-slug="${r.slug}">${esc(r.title)}</span> <span style="color:var(--overlay)">${r.date ? r.date.split('T')[0] : ''}</span></div>`;
    }
    ctx.output(output);
  }
}

// ---- recent ----
function cmdRECENT(ctx: CommandContext): void {
  const posts = getAllPosts().slice(0, 10);

  let output = '<div style="color:var(--teal);font-weight:bold;">10 Most Recent Posts:</div>\n';
  for (const p of posts) {
    output += `<div><span class="clickable-file" data-action="cat" data-slug="${p.slug}">${esc(p.title)}</span> <span style="color:var(--yellow)">${p.date ? p.date.split('T')[0] : ''}</span></div>`;
  }
  ctx.output(output);
}

// ---- about ----
function cmdABOUT(ctx: CommandContext): void {
  const url = getPostUrl('index');
  ctx.output('<span style="color:var(--overlay)">Loading...</span>');
  fetch(url)
    .then(res => res.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const article = doc.querySelector('article');
      if (article) {
        ctx.openViewer('About Me', article.innerHTML);
      }
    })
    .catch(() => {
      ctx.output('<span style="color:var(--red)">Failed to load about page.</span>');
    });
}

// ---- neofetch ----
function cmdNEOFETCH(ctx: CommandContext): void {
  const theme = (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) || 'catppuccin';
  const themeLabels: Record<string, string> = {
    catppuccin: 'Catppuccin Mocha', dracula: 'Dracula',
    gruvbox: 'Gruvbox Dark', solarized: 'Solarized Dark',
  };

  const items = [
    ['OS', 'ChengYongruOS v4.0'],
    ['Host', 'Digital Garden'],
    ['Kernel', 'Astro + Preact'],
    ['Shell', 'Terminal UI'],
    ['Editor', 'VS Code + Obsidian'],
    ['Languages', 'Python, C++, TypeScript'],
    ['Focus', 'ML, Security, Reverse Engineering'],
    ['Uptime', 'Since 2025'],
    ['Theme', themeLabels[theme] || theme],
  ];

  const rows = items
    .map(([k, v]) => `<span style="color:var(--green)">${k.padEnd(10)}</span><span style="color:var(--subtext)">${v}</span>`)
    .join('\n');

  ctx.output(
    `<div style="font-size:13px;font-family:'JetBrains Mono',monospace;line-height:1.7;">
      <div style="margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--surface1);">
        <span style="font-size:18px;font-weight:800;letter-spacing:2px;"><span style="color:var(--green)">CYR</span><span style="color:var(--surface2)">.</span><span style="color:var(--mauve)">ML</span></span>
        <span style="margin-left:8px;color:var(--subtext);font-size:12px;">sysinfo</span>
      </div>
      <pre style="margin:0;color:var(--text);">${rows}</pre>
    </div>`
  );
}

// ---- whoami ----
function cmdWHOAMI(ctx: CommandContext): void {
  ctx.output(
    `<span style="color:var(--green)">visitor</span> — an explorer of this digital garden.\n` +
    '<span style="color:var(--overlay)">You are reading the notes of Cheng Yongru, algorithm engineer.</span>',
  );
}

// ---- echo ----
function cmdECHO(args: string[], ctx: CommandContext): void {
  ctx.output(esc(args.join(' ')));
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
  const history = ctx._history || [];
  if (history.length === 0) {
    ctx.output('<span style="color:var(--overlay)">(no commands yet)</span>');
    return;
  }
  let output = '';
  history.forEach((cmd: string, i: number) => {
    output += `<div><span style="color:var(--overlay)">${String(i + 1).padStart(4, ' ')}</span>  ${esc(cmd)}</div>`;
  });
  ctx.output(output);
}

// ---- pwd ----
function cmdPWD(ctx: CommandContext): void {
  ctx.output(ctx.cwd === '/' ? '/' : ctx.cwd.replace(/\/$/, ''));
}

// ---- theme ----
const THEMES = ['catppuccin', 'dracula', 'gruvbox', 'solarized'] as const;
const THEME_LABELS: Record<string, string> = {
  catppuccin: 'Catppuccin Mocha',
  dracula: 'Dracula',
  gruvbox: 'Gruvbox Dark',
  solarized: 'Solarized Dark',
};

function cmdTHEME(args: string[], ctx: CommandContext): void {
  if (args.length === 0) {
    const current = (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) || 'catppuccin';
    let output = '<div style="color:var(--mauve);font-weight:bold;">Available Themes:</div>\n';
    for (const t of THEMES) {
      const marker = t === current ? ' <span style="color:var(--green)">&lt;&lt;</span>' : '';
      output += `<div><span class="clickable-file" data-action="cmd" data-cmd="theme ${t}">${THEME_LABELS[t]}</span>${marker}</div>`;
    }
    ctx.output(output);
    return;
  }

  const name = args[0].toLowerCase();
  if (!THEMES.includes(name as any)) {
    ctx.output(`<span style="color:var(--red)">Unknown theme: ${esc(name)}. Available: ${THEMES.join(', ')}</span>`);
    return;
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('theme', name);
  }
  document.documentElement.setAttribute('data-theme', name);
  ctx.output(`<span style="color:var(--green)">Theme switched to ${THEME_LABELS[name]}</span>`);
}
