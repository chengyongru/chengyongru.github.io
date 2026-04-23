"use strict";
(() => {
  // src/file-system.ts
  var FILE_SYSTEM = {
    "/": [
      { name: "notebook/", type: "dir", desc: "ML/DL/RL/Security notes" },
      { name: "diary/", type: "dir", desc: "Journal entries" },
      { name: "src/", type: "dir", desc: "Project source code" },
      { name: "about.md", type: "file", desc: "About me" }
    ],
    "/notebook/": [
      { name: "Attention.md", title: "From Matrix Multiplication to Kernel: A Retrospective on Attention", date: "2025-11-10", tags: ["ML", "attention", "kernel"] },
      { name: "Dropout.md", title: "A Regularization Technique: What Does Dropout Do?", date: "2025-09-28", tags: ["ML", "deep-learning"] },
      { name: "MC Dropout.md", title: "MC Dropout", date: "2025-09-28", tags: ["ML"] },
      { name: "LearningRateAndBatchSize.md", title: "Learning Rate and Batch Size", date: "2025-10-15", tags: ["ML", "deep-learning"] },
      { name: "OneHot.md", title: "One-Hot Encoding", date: "2025-10-08", tags: ["ML"] },
      { name: "KLDivergence.md", title: "KL Divergence", date: "2025-10-20", tags: ["math", "info-theory"] },
      { name: "Entropy.md", title: "Entropy", date: "2025-10-22", tags: ["math", "info-theory"] },
      { name: "Likelihood.md", title: "Likelihood Function", date: "2025-10-25", tags: ["math"] },
      { name: "VariationalInference.md", title: "Variational Inference", date: "2025-11-02", tags: ["ML", "probability"] },
      { name: "LinearTransform.md", title: "Linear Transformation", date: "2025-11-05", tags: ["math", "linear-algebra"] },
      { name: "AutoDiff.md", title: "Automatic Differentiation", date: "2025-11-08", tags: ["ML", "tools"] },
      { name: "JacobianMatrix.md", title: "Jacobian Matrix", date: "2025-11-12", tags: ["math"] },
      { name: "GradientDescent.md", title: "Gradient Descent", date: "2025-11-15", tags: ["ML", "optimization"] },
      { name: "RLIntro0.md", title: "Reinforcement Learning Intro (Part 1)", date: "2025-12-01", tags: ["RL", "reinforcement-learning"] },
      { name: "RLIntro1.md", title: "Reinforcement Learning Intro (Part 2)", date: "2025-12-10", tags: ["RL", "reinforcement-learning"] },
      { name: "NanobotIndex.md", title: "Nanobot Architecture Evolution: Theory to Practice", date: "2026-03-03", tags: ["nanobot", "architecture"] },
      { name: "GitBareWorktree.md", title: "Git Bare Worktree Workflow", date: "2026-01-22", tags: ["git", "tool"] },
      { name: "OpenClawFeishuBot.md", title: "OpenClaw Feishu Bot Pitfalls", date: "2026-02-01", tags: ["tool"] },
      { name: "ClaudeCodeMarketplace.md", title: "Claude Code Marketplace", date: "2026-02-15", tags: ["tool", "AI"] },
      { name: "LIEFPEAnalysis.md", title: "LIEF Library PE Parsing Infinite Loop Analysis", date: "2026-02-20", tags: ["security", "reverse-engineering"] },
      { name: "MalwareScriptDetection.md", title: "Malicious Script Detection", date: "2026-02-25", tags: ["security", "ML"] },
      { name: "FrequencyVsBayesian.md", title: "Frequency vs Bayesian", date: "2026-03-01", tags: ["math", "statistics"] },
      { name: "ARIMA.md", title: "ARIMA Time Series", date: "2026-03-05", tags: ["statistics", "time-series"] },
      { name: "ListComprehensionRefactor.md", title: "List Comprehension Refactoring Practice", date: "2026-03-10", tags: ["Python", "programming"] },
      { name: "RecursiveToIterative.md", title: "From Recursive to Iterative", date: "2026-03-12", tags: ["algorithms", "data-structures"] }
    ],
    "/diary/": [
      { name: "2025-10-11.md", title: "Diary - Oct 11, 2025", date: "2025-10-11", tags: [] },
      { name: "2026-02-09.md", title: "Diary - Feb 9, 2026", date: "2026-02-09", tags: [] }
    ],
    "/src/": [
      { name: "autograd/", type: "dir", desc: "Auto-differentiation engine" },
      { name: "bezier/", type: "dir", desc: "Bezier curve visualization" },
      { name: "gameoflife/", type: "dir", desc: "Conway's Game of Life" }
    ]
  };
  var POST_CONTENTS = {
    "Attention.md": {
      title: "From Matrix Multiplication to Kernel: A Retrospective on Attention",
      date: "2025-11-10",
      tags: ["ML", "attention", "kernel"],
      html: `
      <h1>From Matrix Multiplication to Kernel: A Retrospective on Attention</h1>
      <p><span class="tag-badge">ML</span> <span class="tag-badge">attention</span> <span class="tag-badge">kernel</span></p>
      <p>The Attention mechanism is one of the cornerstones of modern deep learning. This article attempts to understand its essence from a more fundamental perspective \u2014 <strong>matrix multiplication and kernel functions</strong>.</p>

      <h2>Starting from Matrix Multiplication</h2>
      <p>Consider the dot product of two vectors $\\mathbf{q}$ (query) and $\\mathbf{k}$ (key):</p>
      $$\\text{score}(\\mathbf{q}, \\mathbf{k}) = \\mathbf{q}^T \\mathbf{k} = \\sum_{i=1}^d q_i k_i$$

      <p>This simple operation embodies the intuition of <strong>similarity measurement</strong>: the larger the dot product of two vectors, the more consistent they are in direction.</p>

      <h2>Scaled Dot-Product Attention</h2>
      <p>The core formula used in Transformer:</p>
      $$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$

      <blockquote>
        <p><strong>Key Insight</strong>: Dividing by $\\sqrt{d_k}$ prevents dot products from becoming too large, which would cause softmax to enter saturation. This is a numerical stability technique.</p>
      </blockquote>

      <h2>Code Implementation</h2>
      <pre><code class="language-python">import torch
import torch.nn.functional as F
import math

def scaled_dot_product_attention(q, k, v, mask=None):
    d_k = q.size(-1)
    scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(d_k)

    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))

    attn_weights = F.softmax(scores, dim=-1)
    return torch.matmul(attn_weights, v), attn_weights</code></pre>

      <h2>Connection to Kernel Methods</h2>
      <p>If we view $QK^T$ as a <strong>kernel matrix</strong>, then Attention is essentially performing kernel-weighted averaging. The kernel function $k(x, x')$ measures similarity between samples, while $QK^T$ measures correlation between tokens.</p>

      <p>From this perspective, <strong>Self-Attention is a learnable, data-driven kernel method</strong>.</p>

      <h2>Summary</h2>
      <ul>
        <li>The core of Attention is <strong>similarity-weighted aggregation</strong></li>
        <li>$QK^T$ builds a relationship graph between tokens</li>
        <li>Softmax normalizes into a probability distribution</li>
        <li>V provides the information content to aggregate</li>
        <li>The scaling factor ensures numerical stability</li>
      </ul>
    `
    },
    "Dropout.md": {
      title: "A Regularization Technique: What Does Dropout Do?",
      date: "2025-09-28",
      tags: ["ML", "deep-learning"],
      html: `
      <h1>A Regularization Technique: What Does Dropout Do?</h1>
      <p><span class="tag-badge">ML</span> <span class="tag-badge">deep-learning</span></p>
      <p>Dropout is a regularization technique proposed by Srivastava et al. in 2014. Its core idea is very intuitive: <strong>randomly drop neurons during training</strong>.</p>

      <h2>Core Principle</h2>
      <p>For each neuron, set its output to zero with probability $p$:</p>
      $$\\tilde{r}_i^{(l)} \\sim \\text{Bernoulli}(p) \\cdot r_i^{(l)}$$

      <p>At inference time, all neurons participate but output is scaled by $(1-p)$ (inverted dropout):</p>
      $$r_i^{(l)} = \\frac{1}{1-p} \\tilde{r}_i^{(l)}$$

      <h2>Why It Works?</h2>
      <ol>
        <li><strong>Prevents co-adaptation</strong>: No single neuron can rely on other specific neurons existing</li>
        <li><strong>Ensemble effect</strong>: Equivalent to training an ensemble of $2^n$ sub-networks</li>
        <li><strong>Implicit data augmentation</strong>: Each forward pass uses a different network architecture</li>
      </ol>

      <pre><code class="language-python"># PyTorch Dropout
dropout = nn.Dropout(p=0.5)
x = torch.randn(4, 4)
y = dropout(x)  # Random zero at train, identity at inference</code></pre>

      <h2>Caveats</h2>
      <ul>
        <li>Dropout rate typically between 0.2\u20130.5</li>
        <li>Convolutional layers usually use lower rates or no dropout</li>
        <li>Be careful when combining with BatchNorm</li>
      </ul>
    `
    },
    "GitBareWorktree.md": {
      title: "Git Bare Worktree Workflow",
      date: "2026-01-22",
      tags: ["git", "tool"],
      html: `
      <h1>Git Bare Worktree Workflow</h1>
      <p><span class="tag-badge">git</span> <span class="tag-badge">tool</span></p>
      <p>Use git bare repository + worktrees to manage multiple parallel development branches while keeping your working directory clean.</p>

      <h2>Initialization</h2>
      <pre><code class="language-bash"># Create bare repo (no working directory)
git init --bare ~/.dotfiles

# Add first worktree
git worktree add ~/dotfiles-main main</code></pre>

      <h2>Daily Usage</h2>
      <table>
        <tr><th>Operation</th><th>Command</th></tr>
        <tr><td>New branch worktree</td><td><code>git worktree add ~/feature-x feature-x</code></td></tr>
        <tr><td>List all worktrees</td><td><code>git worktree list</code></td></tr>
        <tr><td>Remove worktree</td><td><code>git worktree remove ~/feature-x</code></td></tr>
        <tr><td>Cleanup leftovers</td><td><code>git worktree prune</code></td></tr>
      </table>

      <blockquote>
        <p><strong>Advantage</strong>: Each branch has an independent working directory. No stash/checkout overhead when switching branches.</p>
      </blockquote>
    `
    },
    "about.md": {
      title: "About Me",
      date: "",
      tags: [],
      html: `
      <h1>About Me</h1>
      <p>I am <strong>Cheng Yongru (\u7A0B\u6C38\u5112)</strong>, an algorithm engineer.</p>

      <h2>Research Focus</h2>
      <p>Deep learning / Machine learning applied in:</p>
      <ul>
        <li>Malware detection</li>
        <li>Automated reverse engineering agents</li>
      </ul>

      <h2>Experience</h2>
      <table>
        <tr><th>Time</th><th>Company / Role</th></tr>
        <tr><td>2025.05 \u2013 Present</td><td>Huorong Security \xB7 Algorithm Engineer</td></tr>
        <tr><td>2025.05</td><td>Huawei \xB7 Intern</td></tr>
      </table>

      <h2>Tech Stack</h2>
      <p>Python / C++ | Machine Learning / Deep Learning | Linux</p>

      <h2>Contact</h2>
      <p>Email: chengyongru.ai@outlook.com</p>
      <p>Occasionally post videos on Bilibili. Find video editing tedious.</p>
    `
    }
  };
  var ALL_TAGS = [...new Set(
    Object.values(FILE_SYSTEM).flat().filter((f) => f.type === "file" && Array.isArray(f.tags)).flatMap((f) => f.tags)
  )];

  // src/commands.ts
  function esc(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  function resolvePath(path, cwd2) {
    if (path === "~" || path === "") return "/";
    if (path === "..") {
      if (cwd2 === "/") return "/";
      const parts = cwd2.replace(/\/$/, "").split("/");
      parts.pop();
      return parts.join("/") || "/";
    }
    if (!path.startsWith("/")) {
      path = cwd2.replace(/\/$/, "") + "/" + path;
    }
    return path.endsWith("/") ? path : path + "/";
  }
  function getPrompt(cwd2) {
    if (cwd2 === "/") return "visitor@chengyongru:~$ ";
    const dir = cwd2.replace(/^\//, "").replace(/\/$/, "");
    return `visitor@chengyongru:~/${dir}$ `;
  }
  function executeCommand(cmd, ctx) {
    if (!cmd) return;
    const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);
    switch (command) {
      case "ls":
        cmdLS(args, ctx);
        break;
      case "cd":
        cmdCD(args, ctx);
        break;
      case "cat":
        cmdCAT(args, ctx);
        break;
      case "help":
        cmdHELP(ctx);
        break;
      case "clear":
        cmdCLEAR(ctx);
        break;
      case "grep":
        cmdGREP(args, ctx);
        break;
      case "tag":
        cmdTAG(args, ctx);
        break;
      case "recent":
        cmdRECENT(ctx);
        break;
      case "about":
        cmdABOUT(ctx);
        break;
      case "neofetch":
        cmdNEOFETCH(ctx);
        break;
      case "whoami":
        cmdWHOAMI(ctx);
        break;
      case "echo":
        cmdECHO(args, ctx);
        break;
      case "date":
        cmdDATE(ctx);
        break;
      case "history":
        cmdHISTORY(ctx);
        break;
      case "pwd":
        cmdPWD(ctx);
        break;
      case "sudo":
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
  function cmdLS(args, ctx) {
    let targetDir = ctx.cwd;
    let page = 1;
    for (const arg of args) {
      if (/^\d+$/.test(arg)) {
        page = parseInt(arg);
      } else if (arg.endsWith("/")) {
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
    let output = "";
    for (const f of pageFiles) {
      if (f.type === "dir") {
        output += `<div><a class="clickable dir-item" data-path="${targetDir}${f.name}" onclick="handleClick(this)">${esc(f.name)}</a>  <span class="dim">${esc(f.desc || "")}</span></div>`;
      } else if (f.title) {
        output += `<div><a class="clickable file-item" data-file="${f.name}" onclick="handleClick(this)">${esc(f.name)}</a>  <span class="dim">${f.date || ""}</span> ${f.tags ? f.tags.map((t) => `<span class="tag-badge">${t}</span>`).join("") : ""}</div>`;
      } else {
        output += `<div><a class="clickable file-item" data-file="${f.name}" onclick="handleClick(this)">${esc(f.name)}</a>  <span class="dim">${esc(f.desc || "")}</span></div>`;
      }
    }
    if (totalPages > 1) {
      output += `<div class="dim" style="margin-top:8px;">-- page ${page}/${totalPages} --  <a class="clickable" onclick="executeCommandFromOutput('ls ${targetDir === "/" ? "~" : targetDir} ${page + 1}')">next &rarr;</a></div>`;
    }
    ctx.output(output);
  }
  function cmdCD(args, ctx) {
    if (args.length === 0) {
      ctx.setCwd("/");
      ctx.output('<span class="dim">Changed to home directory.</span>');
      return;
    }
    const target = args[0];
    if (target === "..") {
      if (ctx.cwd === "/") {
        ctx.output('<span class="info-msg">Already at root.</span>');
        return;
      }
      const parts = ctx.cwd.replace(/\/$/, "").split("/");
      parts.pop();
      ctx.setCwd(parts.join("/") || "/");
      ctx.output("");
      return;
    }
    if (target === "~" || target === "/") {
      ctx.setCwd("/");
      ctx.output("");
      return;
    }
    const newPath = resolvePath(target, ctx.cwd);
    if (FILE_SYSTEM[newPath]) {
      ctx.setCwd(newPath);
      ctx.output("");
    } else {
      ctx.output(`<span class="error-msg">cd: ${esc(target)}: No such directory</span>`);
    }
  }
  function cmdCAT(args, ctx) {
    if (args.length === 0) {
      ctx.output('<span class="error-msg">cat: missing operand</span>');
      ctx.output("<span class='dim'>Usage: cat &lt;filename&gt;</span>");
      return;
    }
    const filename = args[0];
    const allFiles = Object.values(FILE_SYSTEM).flat().filter((f) => f.type !== "dir");
    let found = allFiles.find((f) => f.name.toLowerCase() === filename.toLowerCase());
    if (!found) {
      found = allFiles.find((f) => f.name.toLowerCase().includes(filename.toLowerCase()));
    }
    if (!found) {
      ctx.output(`<span class="error-msg">cat: ${esc(filename)}: No such file</span>`);
      return;
    }
    const post = POST_CONTENTS[found.name];
    if (post) {
      ctx.openViewer(post.title, post.html);
    } else {
      ctx.openViewer(found.title || found.name.replace(".md", ""), makePlaceholder(found));
    }
  }
  function makePlaceholder(file) {
    const title = file.title || file.name.replace(".md", "");
    const tagsHtml = file.tags?.map((t) => `<span class="tag-badge">${t}</span>`).join("") || "";
    const dateStr = file.date || "TBD";
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
      <tr><th>Tags</th><td>${file.tags?.map((t) => esc(t)).join(", ") || '<span class="dim">none</span>'}</td></tr>
    </table>
  `;
  }
  function cmdHELP(ctx) {
    const helpContent = `
<div class="bold peach" style="margin-bottom:8px;">\u2550\u2550\u2550 Available Commands \u2550\u2550\u2550</div>
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
  function cmdCLEAR(ctx) {
    const body = document.getElementById("terminal-body");
    if (body) body.innerHTML = "";
  }
  function cmdGREP(args, ctx) {
    if (args.length === 0) {
      ctx.output('<span class="error-msg">grep: missing query</span>');
      return;
    }
    const query = args.join(" ").toLowerCase();
    const results = [];
    for (const [dirPath, files] of Object.entries(FILE_SYSTEM)) {
      for (const f of files) {
        if (f.type !== "dir" && (f.title?.toLowerCase().includes(query) || f.name?.toLowerCase().includes(query) || f.tags?.some((t) => t.toLowerCase().includes(query)))) {
          results.push({ ...f });
        }
      }
    }
    if (results.length === 0) {
      ctx.output(`<span class="dim">No results for "${esc(query)}"</span>`);
      return;
    }
    let output = `<div class="bold teal">Found ${results.length} result(s) for "${esc(query)}":</div>
`;
    for (const r of results.slice(0, 20)) {
      output += `<div><a class="clickable file-item" data-file="${r.name}" onclick="handleClick(this)">${esc(r.title || r.name)}</a> <span class="dim">${r.date || ""}</span></div>`;
    }
    if (results.length > 20) {
      output += `<div class="dim">...and ${results.length - 20} more</div>`;
    }
    ctx.output(output);
  }
  function cmdTAG(args, ctx) {
    if (args.length === 0) {
      const tagCounts = {};
      Object.values(FILE_SYSTEM).flat().filter((f) => Array.isArray(f.tags)).forEach((f) => {
        (f.tags || []).forEach((t) => {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
      });
      let output = `<div class="bold mauve">All Tags (${Object.keys(tagCounts).length}):</div>
`;
      const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
      for (const [tag, count] of sortedTags) {
        output += `<div><a class="clickable" onclick="executeCommandFromOutput('tag ${esc(tag)}')"><span class="tag-badge">${esc(tag)}</span></a> <span class="dim">(${count})</span></div>`;
      }
      ctx.output(output);
    } else {
      const tagName = args[0];
      const results = Object.values(FILE_SYSTEM).flat().filter(
        (f) => f.type !== "dir" && f.tags?.some((t) => t.toLowerCase() === tagName.toLowerCase())
      );
      if (results.length === 0) {
        ctx.output(`<span class="dim">No posts tagged with "${esc(tagName)}"</span>`);
        return;
      }
      let output = `<div class="bold mauve">Posts tagged "<span class="tag-badge">${esc(tagName)}"</span>" (${results.length}):</div>
`;
      for (const r of results) {
        output += `<div><a class="clickable file-item" data-file="${r.name}" onclick="handleClick(this)">${esc(r.title || r.name)}</a> <span class="dim">${r.date || ""}</span></div>`;
      }
      ctx.output(output);
    }
  }
  function cmdRECENT(ctx) {
    const allPosts = Object.values(FILE_SYSTEM).flat().filter((f) => f.type !== "dir" && !!f.date);
    allPosts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    let output = '<div class="bold teal">10 Most Recent Posts:</div>\n';
    for (const p of allPosts.slice(0, 10)) {
      output += `<div><a class="clickable file-item" data-file="${p.name}" onclick="handleClick(this)">${esc(p.title || p.name)}</a> <span class="yellow">${p.date || ""}</span></div>`;
    }
    ctx.output(output);
  }
  function cmdABOUT(ctx) {
    const about = POST_CONTENTS["about.md"];
    if (about) ctx.openViewer(about.title, about.html);
  }
  function cmdNEOFETCH(ctx) {
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
  function cmdWHOAMI(ctx) {
    ctx.output(
      `<span class="green">visitor</span> \u2014 an explorer of this digital garden.
<span class="dim">You are reading the notes of Cheng Yongru, algorithm engineer.</span>`
    );
  }
  function cmdECHO(args, ctx) {
    ctx.output(args.join(" "));
  }
  function cmdDATE(ctx) {
    const now = /* @__PURE__ */ new Date();
    const formatted = now.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long"
    });
    ctx.output(formatted);
  }
  function cmdHISTORY(ctx) {
    const history = window.__cmdHistory || [];
    if (history.length === 0) {
      ctx.output('<span class="dim">(no commands yet)</span>');
      return;
    }
    let output = "";
    history.forEach((cmd, i) => {
      output += `<div><span class="dim">${String(i + 1).padStart(4, " ")}</span>  ${esc(cmd)}</div>`;
    });
    ctx.output(output);
  }
  function cmdPWD(ctx) {
    ctx.output(ctx.cwd === "/" ? "/" : ctx.cwd.replace(/\/$/, ""));
  }

  // src/terminal.ts
  var cwd = "/";
  var commandHistory = [];
  var historyIndex = -1;
  var terminalBody;
  var cmdInput;
  var contentViewer;
  var viewerTitle;
  var viewerBody;
  var BANNER_TEXT = [
    "  _  __          ____  _____ ____    ___   _   ____",
    " | |/ /__ _ _ __/ _ \\/ ___// ___|  / _ \\ / \\ / ___|",
    " | ' // _` | '_ \\(_) \\___ \\___ \\ | | || | | \\___ \\",
    " | . \\ (_| | |_) (_) |___) |__) | | |_| | |_ |__) |",
    " |_|\\_\\__,_| .__/\\___/|____/____/  \\___/ \\___/____/",
    "           |_|"
  ];
  function createOutputLine(html, className = "") {
    const div = document.createElement("div");
    div.className = `output-line ${className}`;
    div.innerHTML = html;
    return div;
  }
  function appendOutput(html, className = "") {
    terminalBody.appendChild(createOutputLine(html, className));
    scrollToBottom();
  }
  function appendInputLine(cmd) {
    const promptText = getPrompt(cwd);
    appendOutput(`<span class="prompt">${escHtml(promptText)}</span>${escHtml(cmd)}`);
  }
  function scrollToBottom() {
    requestAnimationFrame(() => {
      terminalBody.scrollTop = terminalBody.scrollHeight;
    });
  }
  function escHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  function createInputLine() {
    const line = document.createElement("div");
    line.className = "input-line";
    const promptSpan = document.createElement("span");
    promptSpan.className = "prompt";
    promptSpan.textContent = getPrompt(cwd);
    const inputWrapper = document.createElement("div");
    inputWrapper.className = "input-wrapper";
    const input = document.createElement("input");
    input.id = "cmd-input";
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.setAttribute("autofocus", "");
    input.addEventListener("keydown", handleKeyDown);
    inputWrapper.appendChild(input);
    line.appendChild(promptSpan);
    line.appendChild(inputWrapper);
    terminalBody.appendChild(line);
    cmdInput = input;
    input.focus();
    scrollToBottom();
  }
  function handleKeyDown(e) {
    const input = e.target;
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = input.value.trim();
      if (cmd) {
        commandHistory.push(cmd);
        historyIndex = commandHistory.length;
        window.__cmdHistory = commandHistory;
      }
      appendInputLine(input.value);
      executeCommand(cmd, {
        cwd,
        output: appendOutput,
        appendInputLine,
        openViewer,
        getCurrentFiles: () => FILE_SYSTEM[cwd] || [],
        setCwd: (path) => {
          cwd = path;
        }
      });
      createInputLine();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = commandHistory[historyIndex] || "";
      }
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        input.value = commandHistory[historyIndex] || "";
      } else {
        historyIndex = commandHistory.length;
        input.value = "";
      }
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleTabComplete(input);
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      executeCommand("clear", {
        cwd,
        output: appendOutput,
        appendInputLine,
        openViewer,
        getCurrentFiles: () => FILE_SYSTEM[cwd] || [],
        setCwd: (p) => {
          cwd = p;
        }
      });
      createInputLine();
    }
  }
  function handleTabComplete(input) {
    const text = input.value;
    const parts = text.split(/\s+/);
    const lastPart = parts[parts.length - 1];
    if (parts.length === 1) {
      const commands = getPrompt("").includes("$") ? [
        "ls",
        "cd",
        "cat",
        "grep",
        "tag",
        "recent",
        "about",
        "neofetch",
        "theme",
        "help",
        "clear",
        "whoami",
        "echo",
        "date",
        "history",
        "pwd"
      ] : [];
      const matches = commands.filter((c) => c.startsWith(lastPart));
      if (matches.length === 1) {
        input.value = matches[1] + " ";
      } else if (matches.length > 1) {
        appendOutput(`<span class="dim">${matches.join("  ")}</span>`);
      }
    } else {
      const files = (FILE_SYSTEM[cwd] || []).filter(
        (f) => f.name.toLowerCase().startsWith(lastPart.toLowerCase())
      );
      if (files.length === 1) {
        parts[parts.length - 1] = files[0].name;
        input.value = parts.join(" ") + " ";
      } else if (files.length > 1) {
        appendOutput(`<span class="dim">${files.map((f) => f.name).join("  ")}</span>`);
      }
    }
  }
  function openViewer(title, html) {
    viewerTitle.textContent = title;
    viewerBody.innerHTML = html;
    if (typeof window.renderMathInElement === "function") {
      window.renderMathInElement(
        viewerBody,
        {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
          ]
        }
      );
    }
    contentViewer.classList.add("active");
    document.body.style.overflow = "hidden";
  }
  function closeViewer() {
    contentViewer.classList.remove("active");
    document.body.style.overflow = "";
    cmdInput?.focus();
  }
  window.handleClick = function(el) {
    if (el.classList.contains("dir-item")) {
      const path = el.dataset.path || "";
      runCommand(`cd ${path}`);
      setTimeout(() => runCommand("ls"), 50);
    } else if (el.dataset.file) {
      runCommand(`cat ${el.dataset.file}`);
    }
  };
  window.executeCommandFromOutput = function(cmd) {
    runCommand(cmd);
  };
  function runCommand(cmd) {
    appendInputLine(cmd);
    executeCommand(cmd, {
      cwd,
      output: appendOutput,
      appendInputLine,
      openViewer,
      getCurrentFiles: () => FILE_SYSTEM[cwd] || [],
      setCwd: (p) => {
        cwd = p;
      }
    });
    createInputLine();
  }
  async function bootSequence() {
    const hasVisited = localStorage.getItem("terminal-booted");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bannerLine = createOutputLine("", "ascii-art");
    terminalBody.appendChild(bannerLine);
    if (hasVisited || prefersReducedMotion) {
      bannerLine.innerHTML = `<pre>${BANNER_TEXT.join("\n")}</pre>`;
    } else {
      let currentText = "";
      for (const char of BANNER_TEXT.join("\n")) {
        currentText += char;
        bannerLine.innerHTML = `<pre>${escHtml(currentText)}</pre><span class="typing-cursor"></span>`;
        await sleep(char === "\n" ? 30 : 8);
      }
      bannerLine.innerHTML = `<pre>${BANNER_TEXT.join("\n")}</pre>`;
    }
    await sleep(200);
    appendOutput(
      `<span class="bold green">Welcome to ChengYongru's digital workspace.</span>
<span class='dim'>Type <span class="yellow">'help'</span> for commands, or just click anything you see.</span>`,
      "welcome"
    );
    await sleep(100);
    createInputLine();
    localStorage.setItem("terminal-booted", "true");
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function initTerminal() {
    terminalBody = document.getElementById("terminal-body");
    contentViewer = document.getElementById("content-viewer");
    viewerTitle = document.getElementById("viewer-title");
    viewerBody = document.getElementById("viewer-body");
    const viewerBack = document.getElementById("viewer-back");
    if (viewerBack) viewerBack.addEventListener("click", closeViewer);
    document.addEventListener("keydown", (e) => {
      if (contentViewer.classList.contains("active")) {
        if (e.key === "q" || e.key === "Escape" || e.key === "[" && e.ctrlKey) {
          closeViewer();
        }
      }
    });
    terminalBody.addEventListener("click", () => {
      cmdInput?.focus();
    });
    bootSequence();
  }

  // src/main.ts
  initTerminal();
})();
