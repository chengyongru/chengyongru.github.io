# shell.garden

English | [中文](README.md)

A reusable terminal-style blog template. It uses Astro for static site generation and Preact for the interactive terminal and article reader. It is designed for publishing Markdown notes, an Obsidian vault, or a personal knowledge base as a browsable, searchable site that can be deployed to GitHub Pages.

![shell.garden screenshot](docs/screenshot.png)

Visitors land on an interactive terminal window and browse public notes with commands such as `ls`, `cd`, `cat`, `grep`, `tag`, and `recent`. Every post also gets a regular static `/blog/...` route for direct links, RSS, and search engine indexing.

## Who This Is For

- You want to publish Markdown notes as a blog or digital garden.
- You prefer a terminal-style browsing experience over a traditional blog index.
- You want the same `content/` directory to work as an Obsidian vault and a website content source.
- You want to fork a template and turn it into your own site with a small amount of configuration.

The current defaults and sample content come from the author's site. When using this as a template, you usually only need to edit `src/config.ts`, replace `content/`, and optionally adjust a few homepage quick commands.

## Quick Start

```bash
git clone <your-repo-url>
cd <your-repo>
npm ci
npm run dev
```

If you fork this repository directly, first decide how you want to manage `content/`:

1. Keep using a Git submodule: replace the URL in `.gitmodules`, then run `git submodule update --init --recursive`.
2. Do not use a submodule: remove the submodule relationship and use a normal `content/` directory for your Markdown files.

If your post images live under `content/img`, Astro needs to access them through `public/img`. The CI workflow creates this link automatically. Locally, create it once if it is missing:

```bash
# macOS / Linux
ln -s ../content/img public/img
```

```powershell
# Windows PowerShell
New-Item -ItemType Junction -Path public\img -Target (Resolve-Path content\img)
```

`public/img` is ignored by Git and should not be committed.

## What To Customize

| File / Directory | What to change |
| --- | --- |
| `src/config.ts` | Site URL, title, language, terminal identity, email, homepage copy, directory descriptions, RSS, publishing rules |
| `content/` | Your Markdown notes and image assets |
| `src/components/Terminal.tsx` | Homepage quick commands, such as the default `ls notebook/` and `grep agent` |
| `.github/workflows/deploy.yml` | GitHub Pages branch, Node version, private submodule token |
| `docs/screenshot.png` | Screenshot shown in this README |

Most forks do not need to modify the command system, article renderer, or content indexing logic.

## Configuration

`src/config.ts` is the main configuration entry point:

```ts
site: {
  url: 'https://your-name.github.io',
  title: "Your Terminal",
  description: 'A terminal-style digital garden',
  lang: 'en',
},

terminal: {
  brand: 'YOU',
  brandColor: 'green',
  brandSuffix: 'BLOG',
  hostname: 'your-name',
  email: 'you@example.com',
},

home: {
  tagline: 'Notes from my terminal garden.',
  featuredSlugs: [],
},

dirs: {
  'diary/': 'Journal entries',
  'notebook/': 'Technical notes',
},
```

`dirs` keys use content directory paths and should keep the trailing `/`. For example, `content/notebook/english/foo.md` can use a directory description key such as `notebook/english/`.

## Content Directory

All public content comes from Markdown files under `content/`. The directory structure becomes the terminal's virtual file system:

```text
content/
  index.md
  diary/
    2026-03-25.md
  notebook/
    Attention.md
    english/
      2_index.md
```

- `content/index.md` is opened by the `about` command.
- Nested directories automatically appear in `ls` output.
- File slugs come from relative paths. For example, `content/notebook/Attention.md` becomes `notebook/attention`.
- Static article pages are generated at `/blog/<slug>/`.
- The terminal reader fetches article HTML from `/post-content/<slug>.json`.

Supported frontmatter:

```yaml
---
title: My Post
date: 2026-06-16
created: 2026-06-16
modify_date: 2026-06-16
tags: [ml, security]
publish: true
draft: false
mathjax: true
featured: false
featuredRank: 10
---
```

Field reference:

| Field | Purpose |
| --- | --- |
| `title` | Post title. Falls back to the slug |
| `date` | Published date, used for sorting and RSS |
| `created` / `modify_date` | Optional metadata |
| `tags` | Tags. The default publishing rules require at least one tag |
| `publish` | When the frontmatter publishing gate is enabled, only boolean `true` allows publishing |
| `draft` | `true` keeps the post private |
| `mathjax` | Compatibility field. KaTeX rendering is enabled by default |
| `featured` | Adds the post to homepage Featured candidates |
| `featuredRank` | Featured ordering. Lower numbers appear first |

Invalid frontmatter does not fail the whole build. `safe-content-glob-loader` skips the file and prints a warning.

## Publishing Rules

Public content is filtered in two layers.

The first layer filters paths. Dot paths, `_obsidian`, `.obsidian`, `.trash`, `.claude`, `Clippings`, `img`, `src`, and similar private or non-post paths are skipped.

The second layer uses frontmatter and tag rules from `src/config.ts`:

```ts
publish: {
  requirePublishFlag: true,
  requireTags: true,
  blockedTags: ['todo', 'english'],
  alwaysPublishSlugs: ['index'],
}
```

Default behavior:

- `requirePublishFlag: true` enables the strict allowlist, so only notes with `publish: true` continue through the publishing rules.
- Notes other than `index` must have at least one tag.
- Notes tagged `todo` or `english` are not published.
- `alwaysPublishSlugs` can bypass the tag requirement for specific slugs.
- `draft: true` and private path filters always win.

The current configuration publishes only explicitly approved documents. Add this to every Markdown file that should be public:

```yaml
---
publish: true
---
```

In strict mode, a missing `publish` field, `publish: false`, or the string `"true"` will not publish the note. It must be the YAML boolean `true`. `alwaysPublishSlugs` can bypass tag rules, but it cannot bypass this frontmatter gate.

To restore the previous behavior, set `requirePublishFlag` to `false`. The `publish` field is then ignored, while path, draft, and tag rules remain active.

These rules apply to `/blog/...` pages, `content-index.json`, terminal listings, search, tags, recent posts, and RSS.
Production builds also clean `dist/img` and copy only `content/img` assets referenced by published pages. Images and PDFs used only by unpublished notes are excluded from deployment.

## Homepage Featured Posts

The homepage terminal shows Featured and Recent columns. Featured posts are selected in this order:

1. `home.featuredSlugs` in `src/config.ts`
2. Markdown frontmatter with `featured: true`
3. Recent posts as fallback

Example:

```ts
home: {
  tagline: 'Notes from my terminal garden.',
  featuredSlugs: ['notebook/my-post'],
}
```

```yaml
---
title: My Post
date: 2026-06-16
tags: [note]
featured: true
featuredRank: 1
---
```

Lower `featuredRank` values appear first. Featured posts without a rank are ordered by date.

## Terminal Features

Supported commands:

```text
ls cd cat grep tag recent about neofetch help clear theme whoami echo date history pwd
```

Interactive behavior:

- `Tab` / `Shift+Tab` cycles through command, directory, and post completions.
- Directories, files, tags, and quick commands are clickable.
- `theme dark` / `theme light` switches themes and saves the choice to `localStorage`.
- Arrow keys browse command history.
- The terminal window can be dragged, resized, and maximized.
- The homepage terminal hydrates with `client:idle`, so the static shell can render before interactivity loads.

The article reader supports:

- `Ctrl+d` / `Ctrl+u` for half-page scrolling.
- `G` for bottom and `gg` for top.
- `/` for search and `n` / `N` for result navigation.
- `q` / `Esc` to close the reader.
- Copy buttons on code blocks.
- Internal link interception, so switching between posts does not reload the whole page.

## Markdown Features

- GFM tables, task lists, and related Markdown extensions.
- KaTeX math rendering with CSS and fonts self-hosted under `/vendor/katex/`.
- Mermaid diagrams loaded on demand in the reader.
- Shiki code highlighting.
- Obsidian-style highlights, callouts, and image path handling.
- SEO-friendly hidden article markup, so the terminal experience and crawler indexing can coexist.

## Project Structure

| Path | Purpose |
| --- | --- |
| `astro.config.mjs` | Astro, Preact, Tailwind, Markdown plugins, and sitemap configuration |
| `src/config.ts` | Main template configuration |
| `src/components/Terminal.tsx` | Terminal UI and homepage boot content |
| `src/components/ContentViewer.tsx` | Article reader |
| `src/terminal/` | Commands, autocomplete, file tree, themes, homepage selection logic |
| `src/utils/` | Content index, publishing filters, remark plugins, safe loader |
| `src/pages/blog/[...slug].astro` | Static article routes |
| `src/pages/post-content/[...slug].json.ts` | Article JSON for the reader |
| `src/pages/content-index.json.ts` | Terminal content index |
| `content/` | Markdown content source |
| `public/vendor/katex/` | KaTeX static assets |
| `tests/e2e/` | Playwright verification |

## Commands

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Static build | `npm run build` |
| Preview built site | `npm run preview` |
| Astro / TypeScript checks | `npm run check` |
| Unit tests | `npx vitest run` |
| Browser verification | `npx playwright test` |
| Format code | `npm run format` |
| Asset audit | `npm run audit:assets` |

`playwright.config.ts` runs `npm run build` and starts `astro preview` automatically. The default port is `4321`; set `PLAYWRIGHT_PORT` to change it. If an external server is already running, set `PLAYWRIGHT_BASE_URL` to skip the built-in web server.

## Deploying To GitHub Pages

The current workflow is `.github/workflows/deploy.yml`:

- Trigger branch: `v4`
- Node.js: `22`
- Install command: `npm ci`
- Checkout: `submodules: recursive`
- Before build: create `public/img -> ../content/img`
- Build output: `dist`
- Deployment target: GitHub Pages

After forking as a template, you usually need to:

1. Change the trigger branch to your publishing branch, such as `main`.
2. Make sure `site.url` in `src/config.ts` matches the final site URL.
3. If you use a private content submodule, configure `secrets.ACCESS_TOKEN` with read access.
4. Enable GitHub Pages in repository Settings and select GitHub Actions deployment.

You can also deploy to any static hosting provider by running `npm run build` and publishing `dist/`.

## Pre-Publish Checklist

```bash
npm run check
npx vitest run
npm run build
npx playwright test
npm run audit:assets
```

Asset size recommendations:

- Keep individual screenshots under 500 KB when possible.
- Keep PDFs, zip files, tarballs, and other downloads under 2 MB when possible.
- Prefer WebP / AVIF for large images.
- Avoid placing large personal archive files in the default public asset path.

## License

MIT
