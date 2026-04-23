// ============================================================
// Terminal Core: UI, Input Handling, Boot Sequence
// ============================================================

import { getPrompt, executeCommand } from './commands';
import { FILE_SYSTEM } from './file-system';

// ---- State ----
let cwd = '/';
const commandHistory: string[] = [];
let historyIndex = -1;

// ---- DOM References (initialized in init()) ----
let terminalBody: HTMLElement;
let cmdInput: HTMLInputElement;
let contentViewer: HTMLElement;
let viewerTitle: HTMLElement;
let viewerBody: HTMLElement;

// ---- ASCII Banner (pure ASCII for monospace compatibility) ----
const BANNER_TEXT = [
  '  _  __          ____  _____ ____    ___   _   ____',
  " | |/ /__ _ _ __/ _ \\/ ___// ___|  / _ \\ / \\ / ___|",
  " | ' // _` | '_ \\(_) \\___ \\___ \\ | | || | | \\___ \\",
  " | . \\ (_| | |_) (_) |___) |__) | | |_| | |_ |__) |",
  " |_|\\_\\__,_| .__/\\___/|____/____/  \\___/ \\___/____/",
  '           |_|',
];

// ---- Output Helpers ----
function createOutputLine(html: string, className = ''): HTMLDivElement {
  const div = document.createElement('div');
  div.className = `output-line ${className}`;
  div.innerHTML = html;
  return div;
}

function appendOutput(html: string, className = ''): void {
  terminalBody.appendChild(createOutputLine(html, className));
  scrollToBottom();
}

function appendInputLine(cmd: string): void {
  const promptText = getPrompt(cwd);
  appendOutput(`<span class="prompt">${escHtml(promptText)}</span>${escHtml(cmd)}`);
}

function scrollToBottom(): void {
  requestAnimationFrame(() => {
    terminalBody.scrollTop = terminalBody.scrollHeight;
  });
}

function escHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Input Line Management ----
function createInputLine(): void {
  const line = document.createElement('div');
  line.className = 'input-line';

  const promptSpan = document.createElement('span');
  promptSpan.className = 'prompt';
  promptSpan.textContent = getPrompt(cwd);

  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'input-wrapper';

  const input = document.createElement('input');
  input.id = 'cmd-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.setAttribute('autofocus', '');

  input.addEventListener('keydown', handleKeyDown);
  inputWrapper.appendChild(input);
  line.appendChild(promptSpan);
  line.appendChild(inputWrapper);
  terminalBody.appendChild(line);

  cmdInput = input;
  input.focus();
  scrollToBottom();
}

// ---- Keyboard Handling ----
function handleKeyDown(e: KeyboardEvent): void {
  const input = e.target as HTMLInputElement;

  if (e.key === 'Enter') {
    e.preventDefault();
    const cmd = input.value.trim();
    if (cmd) {
      commandHistory.push(cmd);
      historyIndex = commandHistory.length;
      (window as unknown as Record<string, unknown>).__cmdHistory = commandHistory;
    }
    appendInputLine(input.value);
    executeCommand(cmd, {
      cwd,
      output: appendOutput,
      appendInputLine,
      openViewer,
      getCurrentFiles: () => FILE_SYSTEM[cwd] || [],
      setCwd: (path) => { cwd = path; },
    });
    createInputLine();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      input.value = commandHistory[historyIndex] || '';
    }
    input.setSelectionRange(input.value.length, input.value.length);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      input.value = commandHistory[historyIndex] || '';
    } else {
      historyIndex = commandHistory.length;
      input.value = '';
    }
    input.setSelectionRange(input.value.length, input.value.length);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    handleTabComplete(input);
  } else if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    executeCommand('clear', {
      cwd,
      output: appendOutput,
      appendInputLine,
      openViewer,
      getCurrentFiles: () => FILE_SYSTEM[cwd] || [],
      setCwd: (p) => { cwd = p; },
    });
    createInputLine();
  }
}

// ---- Tab Completion ----
function handleTabComplete(input: HTMLInputElement): void {
  const text = input.value;
  const parts = text.split(/\s+/);
  const lastPart = parts[parts.length - 1];

  if (parts.length === 1) {
    const commands = getPrompt('').includes('$')
      ? ['ls', 'cd', 'cat', 'grep', 'tag', 'recent', 'about', 'neofetch',
         'theme', 'help', 'clear', 'whoami', 'echo', 'date', 'history', 'pwd']
      : [];
    const matches = commands.filter(c => c.startsWith(lastPart));
    if (matches.length === 1) {
      input.value = matches[1] + ' ';
    } else if (matches.length > 1) {
      appendOutput(`<span class="dim">${matches.join('  ')}</span>`);
    }
  } else {
    const files = (FILE_SYSTEM[cwd] || []).filter(f =>
      f.name.toLowerCase().startsWith(lastPart.toLowerCase()),
    );
    if (files.length === 1) {
      parts[parts.length - 1] = files[0].name;
      input.value = parts.join(' ') + ' ';
    } else if (files.length > 1) {
      appendOutput(`<span class="dim">${files.map(f => f.name).join('  ')}</span>`);
    }
  }
}

// ---- Content Viewer ----
function openViewer(title: string, html: string): void {
  viewerTitle.textContent = title;
  viewerBody.innerHTML = html;

  // Render math with KaTeX if available
  if (typeof (window as unknown as Record<string, unknown>).renderMathInElement === 'function') {
    (window as unknown as { renderMathInElement: (el: Element, opts: unknown) => void }).renderMathInElement(
      viewerBody,
      {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
      },
    );
  }

  contentViewer.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeViewer(): void {
  contentViewer.classList.remove('active');
  document.body.style.overflow = '';
  cmdInput?.focus();
}

// ---- Click Handler (global) ----
(window as unknown as Record<string, unknown>).handleClick = function (
  el: HTMLElement,
): void {
  if (el.classList.contains('dir-item')) {
    const path = el.dataset.path || '';
    runCommand(`cd ${path}`);
    setTimeout(() => runCommand('ls'), 50);
  } else if (el.dataset.file) {
    runCommand(`cat ${el.dataset.file}`);
  }
};

(window as unknown as Record<string, unknown>).executeCommandFromOutput = function (
  cmd: string,
): void {
  runCommand(cmd);
};

function runCommand(cmd: string): void {
  appendInputLine(cmd);
  executeCommand(cmd, {
    cwd,
    output: appendOutput,
    appendInputLine,
    openViewer,
    getCurrentFiles: () => FILE_SYSTEM[cwd] || [],
    setCwd: (p) => { cwd = p; },
  });
  createInputLine();
}

// ---- Boot Sequence ----
async function bootSequence(): Promise<void> {
  const hasVisited = localStorage.getItem('terminal-booted');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Render banner
  const bannerLine = createOutputLine('', 'ascii-art');
  terminalBody.appendChild(bannerLine);

  if (hasVisited || prefersReducedMotion) {
    bannerLine.innerHTML = `<pre>${BANNER_TEXT.join('\n')}</pre>`;
  } else {
    // Typing animation
    let currentText = '';
    for (const char of BANNER_TEXT.join('\n')) {
      currentText += char;
      bannerLine.innerHTML = `<pre>${escHtml(currentText)}</pre><span class="typing-cursor"></span>`;
      await sleep(char === '\n' ? 30 : 8);
    }
    bannerLine.innerHTML = `<pre>${BANNER_TEXT.join('\n')}</pre>`;
  }

  await sleep(200);

  // Welcome message
  appendOutput(
    '<span class="bold green">Welcome to ChengYongru\'s digital workspace.</span>\n' +
    "<span class='dim'>Type <span class=\"yellow\">'help'</span> for commands, or just click anything you see.</span>",
    'welcome',
  );

  await sleep(100);
  createInputLine();

  localStorage.setItem('terminal-booted', 'true');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ---- Initialization ----
export function initTerminal(): void {
  terminalBody = document.getElementById('terminal-body')!;
  contentViewer = document.getElementById('content-viewer')!;
  viewerTitle = document.getElementById('viewer-title')!;
  viewerBody = document.getElementById('viewer-body')!;

  // Viewer back button
  const viewerBack = document.getElementById('viewer-back');
  if (viewerBack) viewerBack.addEventListener('click', closeViewer);

  // Global keyboard handler for viewer close
  document.addEventListener('keydown', (e) => {
    if (contentViewer.classList.contains('active')) {
      if (e.key === 'q' || e.key === 'Escape' || (e.key === '[' && e.ctrlKey)) {
        closeViewer();
      }
    }
  });

  // Keep focus on input when clicking terminal body
  terminalBody.addEventListener('click', () => {
    cmdInput?.focus();
  });

  // Start boot sequence
  bootSequence();
}
