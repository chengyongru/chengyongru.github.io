// ============================================================
// Virtual File System - Simulated from actual blog content
// ============================================================

import type { FileEntry, PostContent } from './types';

export const FILE_SYSTEM: Record<string, FileEntry[]> = {
  '/': [
    { name: 'notebook/', type: 'dir', desc: 'ML/DL/RL/Security notes' },
    { name: 'diary/', type: 'dir', desc: 'Journal entries' },
    { name: 'src/', type: 'dir', desc: 'Project source code' },
    { name: 'about.md', type: 'file', desc: 'About me' },
  ],
  '/notebook/': [
    { name: 'Attention.md', title: 'From Matrix Multiplication to Kernel: A Retrospective on Attention', date: '2025-11-10', tags: ['ML', 'attention', 'kernel'] },
    { name: 'Dropout.md', title: 'A Regularization Technique: What Does Dropout Do?', date: '2025-09-28', tags: ['ML', 'deep-learning'] },
    { name: 'MC Dropout.md', title: 'MC Dropout', date: '2025-09-28', tags: ['ML'] },
    { name: 'LearningRateAndBatchSize.md', title: 'Learning Rate and Batch Size', date: '2025-10-15', tags: ['ML', 'deep-learning'] },
    { name: 'OneHot.md', title: 'One-Hot Encoding', date: '2025-10-08', tags: ['ML'] },
    { name: 'KLDivergence.md', title: 'KL Divergence', date: '2025-10-20', tags: ['math', 'info-theory'] },
    { name: 'Entropy.md', title: 'Entropy', date: '2025-10-22', tags: ['math', 'info-theory'] },
    { name: 'Likelihood.md', title: 'Likelihood Function', date: '2025-10-25', tags: ['math'] },
    { name: 'VariationalInference.md', title: 'Variational Inference', date: '2025-11-02', tags: ['ML', 'probability'] },
    { name: 'LinearTransform.md', title: 'Linear Transformation', date: '2025-11-05', tags: ['math', 'linear-algebra'] },
    { name: 'AutoDiff.md', title: 'Automatic Differentiation', date: '2025-11-08', tags: ['ML', 'tools'] },
    { name: 'JacobianMatrix.md', title: 'Jacobian Matrix', date: '2025-11-12', tags: ['math'] },
    { name: 'GradientDescent.md', title: 'Gradient Descent', date: '2025-11-15', tags: ['ML', 'optimization'] },
    { name: 'RLIntro0.md', title: 'Reinforcement Learning Intro (Part 1)', date: '2025-12-01', tags: ['RL', 'reinforcement-learning'] },
    { name: 'RLIntro1.md', title: 'Reinforcement Learning Intro (Part 2)', date: '2025-12-10', tags: ['RL', 'reinforcement-learning'] },
    { name: 'NanobotIndex.md', title: 'Nanobot Architecture Evolution: Theory to Practice', date: '2026-03-03', tags: ['nanobot', 'architecture'] },
    { name: 'GitBareWorktree.md', title: 'Git Bare Worktree Workflow', date: '2026-01-22', tags: ['git', 'tool'] },
    { name: 'OpenClawFeishuBot.md', title: 'OpenClaw Feishu Bot Pitfalls', date: '2026-02-01', tags: ['tool'] },
    { name: 'ClaudeCodeMarketplace.md', title: 'Claude Code Marketplace', date: '2026-02-15', tags: ['tool', 'AI'] },
    { name: 'LIEFPEAnalysis.md', title: 'LIEF Library PE Parsing Infinite Loop Analysis', date: '2026-02-20', tags: ['security', 'reverse-engineering'] },
    { name: 'MalwareScriptDetection.md', title: 'Malicious Script Detection', date: '2026-02-25', tags: ['security', 'ML'] },
    { name: 'FrequencyVsBayesian.md', title: 'Frequency vs Bayesian', date: '2026-03-01', tags: ['math', 'statistics'] },
    { name: 'ARIMA.md', title: 'ARIMA Time Series', date: '2026-03-05', tags: ['statistics', 'time-series'] },
    { name: 'ListComprehensionRefactor.md', title: 'List Comprehension Refactoring Practice', date: '2026-03-10', tags: ['Python', 'programming'] },
    { name: 'RecursiveToIterative.md', title: 'From Recursive to Iterative', date: '2026-03-12', tags: ['algorithms', 'data-structures'] },
  ],
  '/diary/': [
    { name: '2025-10-11.md', title: 'Diary - Oct 11, 2025', date: '2025-10-11', tags: [] },
    { name: '2026-02-09.md', title: 'Diary - Feb 9, 2026', date: '2026-02-09', tags: [] },
  ],
  '/src/': [
    { name: 'autograd/', type: 'dir', desc: 'Auto-differentiation engine' },
    { name: 'bezier/', type: 'dir', desc: 'Bezier curve visualization' },
    { name: 'gameoflife/', type: 'dir', desc: "Conway's Game of Life" },
  ],
};

export const POST_CONTENTS: Record<string, PostContent> = {
  'Attention.md': {
    title: 'From Matrix Multiplication to Kernel: A Retrospective on Attention',
    date: '2025-11-10',
    tags: ['ML', 'attention', 'kernel'],
    html: `
      <h1>From Matrix Multiplication to Kernel: A Retrospective on Attention</h1>
      <p><span class="tag-badge">ML</span> <span class="tag-badge">attention</span> <span class="tag-badge">kernel</span></p>
      <p>The Attention mechanism is one of the cornerstones of modern deep learning. This article attempts to understand its essence from a more fundamental perspective — <strong>matrix multiplication and kernel functions</strong>.</p>

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
    `,
  },
  'Dropout.md': {
    title: 'A Regularization Technique: What Does Dropout Do?',
    date: '2025-09-28',
    tags: ['ML', 'deep-learning'],
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
        <li>Dropout rate typically between 0.2–0.5</li>
        <li>Convolutional layers usually use lower rates or no dropout</li>
        <li>Be careful when combining with BatchNorm</li>
      </ul>
    `,
  },
  'GitBareWorktree.md': {
    title: 'Git Bare Worktree Workflow',
    date: '2026-01-22',
    tags: ['git', 'tool'],
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
    `,
  },
  'about.md': {
    title: 'About Me',
    date: '',
    tags: [],
    html: `
      <h1>About Me</h1>
      <p>I am <strong>Cheng Yongru (程永儒)</strong>, an algorithm engineer.</p>

      <h2>Research Focus</h2>
      <p>Deep learning / Machine learning applied in:</p>
      <ul>
        <li>Malware detection</li>
        <li>Automated reverse engineering agents</li>
      </ul>

      <h2>Experience</h2>
      <table>
        <tr><th>Time</th><th>Company / Role</th></tr>
        <tr><td>2025.05 – Present</td><td>Huorong Security · Algorithm Engineer</td></tr>
        <tr><td>2025.05</td><td>Huawei · Intern</td></tr>
      </table>

      <h2>Tech Stack</h2>
      <p>Python / C++ | Machine Learning / Deep Learning | Linux</p>

      <h2>Contact</h2>
      <p>Email: chengyongru.ai@outlook.com</p>
      <p>Occasionally post videos on Bilibili. Find video editing tedious.</p>
    `,
  },
};

/** All unique tags across posts */
export const ALL_TAGS: string[] = [...new Set(
  Object.values(FILE_SYSTEM)
    .flat()
    .filter((f): f is FileEntry & { tags: string[] } => f.type === 'file' && Array.isArray(f.tags))
    .flatMap(f => f.tags),
)];
