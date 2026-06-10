# shell.garden

A terminal-style blog template built with Astro, Preact, and Tailwind CSS.

![shell.garden screenshot](docs/screenshot.png)

Your blog, but it's a terminal. Visitors explore your content via command-line
(`ls`, `cd`, `cat`, `grep`, `tag`, `neofetch`...) with vim keybindings,
light/dark themes, and a three-body spotlight background.

## Quick Start

1. **Fork or clone** this repository
2. **Edit `src/config.ts`** — change all personal info to yours
3. **Replace `content/`** — add your own markdown notes
4. **Deploy** — push to GitHub Pages or any static host

## What to Customize

### `src/config.ts` (the only file you need to edit)

| Section | What it controls |
|---------|-----------------|
| `site` | URL, title, description, language |
| `terminal` | Brand name, hostname, email shown in banner |
| `home` | Boot tagline and optional manually pinned featured posts |
| `neofetch` | System info displayed by the `neofetch` command |
| `dirs` | Directory names and descriptions for `ls` |
| `rss` | RSS feed title and description |
| `publish` | Tag-based publication rules |

### Content

Place your markdown files in the `content/` directory. The directory structure
becomes the virtual filesystem visitors explore:

```
content/
  index.md          → About page (shown by `about` command)
  notebook/
    my-post.md      → /notebook/my-post
  diary/
    2025-01-01.md   → /diary/2025-01-01
  projects/
    research/
      deep-note.md   → /projects/research/deep-note
```

Nested markdown files are discovered automatically. Top-level directories become
terminal directories; add friendly descriptions for them in `config.dirs` if you
want `ls` to show more than the directory name.

Frontmatter schema:
```yaml
---
title: My Post
date: 2025-01-01
tags: [tag1, tag2]
draft: false
mathjax: true
featured: false
featuredRank: 10
---
```

### Featured Posts

The homepage terminal shows a Featured column before Recent. The easiest way to
feature a post is with frontmatter:

```yaml
---
title: My Post
date: 2025-01-01
tags: [tag1]
featured: true
featuredRank: 1
---
```

Lower `featuredRank` values appear first. Posts without a rank are ordered by
newest date after ranked featured posts.

For manual pinning, set `home.featuredSlugs` in `src/config.ts`:

```ts
home: {
  tagline: 'Notes from my terminal garden.',
  featuredSlugs: ['notebook/my-post'],
}
```

Manual slugs appear before frontmatter-featured posts. Missing slugs are ignored,
and the homepage falls back to frontmatter featured posts and then recent posts.
Leaving `featuredSlugs` empty is the recommended default for reusable forks.

Publication rules live in `src/config.ts`:
```ts
publish: {
  requireTags: true,       // notes without tags are not generated publicly
  blockedTags: ['todo'],   // notes tagged todo are not generated publicly
  alwaysPublishSlugs: ['index'],
}
```

The rules apply to generated `/blog/...` pages, `content-index.json`, the terminal UI, tag/search/recent commands, and RSS.

Private vault material is excluded before publication. Dotfiles and dot-directories
are hidden, as are `_obsidian`, `.obsidian`, `.trash`, `.claude`, `clippings`,
`img`, and `src` paths at any depth. Use `draft: true` or a blocked tag such as
`todo` for additional per-note privacy.

## Features

- **15 terminal commands**: ls, cd, cat, grep, tag, recent, about, neofetch, help, clear, theme, whoami, echo, date, history, pwd
- **Vim keybindings** in the content viewer (j/k, Ctrl+d/u, G/gg, /, n/N, q)
- **Light/dark themes**: restrained palettes tuned for reading and the terminal UI
- **Markdown**: KaTeX math, Mermaid diagrams, Obsidian callouts & highlights, code highlighting
- **Three-body spotlight** background animation
- **Draggable & resizable** terminal window
- **Tab completion** with cycling
- **RSS feed** and SEO-friendly hidden article markup
- **Obsidian-compatible**: works as an Obsidian vault via git submodule

## Tech Stack

- [Astro](https://astro.build) — static site generation
- [Preact](https://preactjs.com) — interactive UI islands
- [Tailwind CSS v4](https://tailwindcss.com) — styling
- [KaTeX](https://katex.org) — math rendering
- [Mermaid](https://mermaid.js.org) — diagrams
- [Shiki](https://shiki.style) — code highlighting

## Commands

| Command | `npm run ...` |
|---------|---------------|
| Dev server | `dev` |
| Build | `build` |
| Preview | `preview` |
| Test | `test` |
| Asset audit | `audit:assets` |

## Performance Notes

The site is statically generated, but the terminal UI is still an interactive
island. Keep the framework fast by following these rules:

- Terminal hydration uses `client:idle`, so the static shell can paint before
  the command interface hydrates.
- `content-index.json` contains metadata, tags, directory data, short excerpts,
  and background text. Full article HTML is fetched only when a visitor opens a
  post or runs a full-content `grep`.
- KaTeX CSS is local and loaded only on article pages, never on the homepage.
- Mermaid is loaded on demand by the content viewer only when a post contains a
  Mermaid block.
- The three-body background respects `prefers-reduced-motion`; low-power devices
  use a lighter text/spotlight mode.

### Asset Budget

Large pasted screenshots and PDFs dominate static site size. Before publishing,
run:

```bash
npm run build
npm run audit:assets
```

Recommended budgets:

- Raster images: keep each image under 500 KB when possible.
- PDFs/downloads: keep each file under 2 MB, or link them from a dedicated
  download location instead of the default image path.
- Prefer WebP/AVIF for large screenshots and exported figures.
- Avoid placing large attachments where every fork inherits them by default.

## License

MIT
