# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a **Quartz v4** digital garden and personal website hosting technical notes, diary entries, and an AI-powered English learning system. The site is built as a static site generator that transforms Markdown content into a fully functional website.

**Project**: Personal digital garden focused on machine learning, programming languages, and technical documentation.
**Stack**: TypeScript, Node.js v22+, Preact, Remark/Rehype (Markdown processing)

## Common Development Commands

### Building and Previewing
```bash
# Build and serve locally with hot-reload
npx quartz build --serve

# Build for production
npx quartz build

# Build with verbose output
npx quartz build --serve -v

# Build to custom output directory
npx quartz build -o public
```

### Content Management
```bash
# Specify custom content directory
npx quartz build -d content

# Build with specific concurrency
npx quartz build --concurrency 4
```

### Code Quality
```bash
# Type check and format check
npm run check

# Format code
npm run format

# Run tests
npm run test
```

### Preview Server
- Default port: `http://localhost:8080`
- WebSocket server (for hot-reload): port 3001
- Use `--port` flag to change the preview server port

## Repository Structure

### Core Configuration
- `quartz.config.ts` - Main Quartz configuration (plugins, transformers, emitters, theme settings)
- `quartz.layout.ts` - Page layout definitions (components for header, footer, sidebar, etc.)
- `package.json` - Dependencies and npm scripts

### Content Organization (`content/`)
The `content/` directory is the source of truth for all site content:

- **`index.md`** - Homepage/landing page
- **`notebook/`** - Technical notes and documentation (the main content area)
  - Contains markdown files on various technical topics (ML, C++, Python, etc.)
  - Organized by topic with Chinese and English content
- **`diary/`** - Personal diary entries (dated markdown files)
- **`english-learning-system/`** - AI-powered English learning system
  - `README.md` - System documentation
  - `QUICKSTART.md` - Quick start guide
  - `daily-tests/` - Generated daily tests
  - `grammar-notes/` - Grammar reference materials
  - `vocabulary-log/` - Vocabulary tracking
  - `progress-tracking/` - Learning analytics
  - `analytics/` - Progress reports and data
- **`img/`** - Images and media assets
- **`.obsidian/`** - Obsidian markdown editor configuration
  - **IMPORTANT**: This directory is gitignored by default, but some configs are tracked

### Quartz Architecture (`quartz/`)

#### Core Build System
- `build.ts` - Main build orchestration
- `cfg.ts` - Configuration interfaces and types
- `bootstrap-cli.mjs` - CLI entry point with esbuild transpilation

#### Components (`quartz/components/`)
Page layout components built with Preact/JSX:
- **Pages**: `pages/Content.tsx`, `pages/FolderContent.tsx`, `pages/TagContent.tsx`, `pages/404.tsx`
- **Layout Components**: `Head.tsx`, `Footer.tsx`, `Header.tsx`
- **Content Components**: `ArticleTitle.tsx`, `ContentMeta.tsx`, `Body.tsx`, `TagList.tsx`
- **Interactive Features**: `Search.tsx`, `Graph.tsx`, `Darkmode.tsx`, `TableOfContents.tsx`, `Backlinks.tsx`, `Explorer.tsx`, `RecentNotes.tsx`
- **Utility**: `DesktopOnly.tsx`, `MobileOnly.tsx`, `ConditionalRender.tsx`
- **Scripts**: Client-side JavaScript in `scripts/` directory
- **Styles**: Component-specific styles in `styles/` directory

#### Plugins (`quartz/plugins/`)
Three plugin types that form the content processing pipeline:

1. **Transformers** (`transformers/`) - Content transformation plugins
   - `FrontMatter.ts` - Parse YAML frontmatter
   - `CreatedModifiedDate.ts` - Extract dates from git/filesystem
   - `ObsidianFlavoredMarkdown.ts` - Support Obsidian-specific syntax
   - `GitHubFlavoredMarkdown.ts` - GFM support
   - `SyntaxHighlighting.ts` - Code syntax highlighting
   - `Latex.ts` - LaTeX math rendering (KaTeX)
   - `TableOfContents.ts` - Generate TOC
   - `CrawlLinks.ts` - Link resolution and graph building
   - `Description.ts` - Extract page descriptions

2. **Filters** (`filters/`) - Content filtering
   - `RemoveDrafts.ts` - Filter out draft content

3. **Emitters** (`emitters/`) - File generation
   - `ContentPage.ts` - Generate individual pages
   - `FolderPage.ts` - Generate folder listing pages
   - `TagPage.ts` - Generate tag listing pages
   - `ContentIndex.ts` - Generate sitemap and RSS
   - `Assets.ts` - Emit static resources
   - `Static.ts` - Copy static files
   - `ComponentResources.ts` - Emit component CSS/JS
   - `Favicon.ts` - Generate favicons
   - `NotFoundPage.ts` - Generate 404 page

#### Other Directories
- `processors/` - Additional content processors
- `util/` - Utility functions (path handling, slugify, etc.)
- `i18n/` - Internationalization support
- `static/` - Static assets served with the site
- `styles/` - Global styles

### Build Output (`public/`)
Generated static site (gitignored). Contents are:
- `index.html` and other HTML pages
- `index.css` - Minified and bundled styles
- `prescript.js` - Critical JavaScript (loaded in head)
- `postscript.js` - Non-critical JavaScript (loaded after body)
- Static assets

## Key Configuration Details

### Content Filtering
In `quartz.config.ts`, the `ignorePatterns` array specifies content to exclude from builds:
```typescript
ignorePatterns: ["private", "templates", "_obsidian", "copilot"]
```
This means:
- Files/folders matching these patterns won't be processed
- Useful for drafts, private notes, or editor-specific directories

### Date Handling
The `defaultDateType` is set to `"created"`, with priority:
1. Frontmatter `date` field
2. Git creation date
3. Filesystem creation date

### Link Resolution
`markdownLinkResolution: "absolute"` means all Markdown links use absolute paths from the content root.

### Theme Customization
- **Fonts**: DM Serif Display (headers), Bricolage Grotesque (body), JetBrains Mono (code)
- **Colors**: Custom light/dark mode palettes defined in config
- **CDN Caching**: Enabled for Google Fonts

### Layout Components
The site uses two main layouts defined in `quartz.layout.ts`:

1. **`defaultContentPageLayout`** - For individual content pages
   - Before body: Article title, metadata, tags
   - Left sidebar: Search, dark mode toggle, recent notes
   - Right sidebar: Graph view, table of contents, backlinks

2. **`defaultListPageLayout`** - For list pages (folders, tags)
   - Simpler layout without the right sidebar

### Recent Notes Component
Two recent notes components are configured:
- **"Recent Writing"**: Shows 4 most recent notebook items (excludes index and todo-tagged items)
- **"Recent Notes"**: Shows 2 most recent diary entries with content

## Content Workflow

### Obsidian Integration
This repository is designed to work with Obsidian:
- Vim mode enabled
- New link format: `absolute`
- Use Markdown links (not wikilinks by default)
- Images stored in `img/` directory
- Daily notes configured
- Properties (frontmatter) stored in source mode

### Frontmatter
Content files use YAML frontmatter:
```yaml
---
title: Page Title
date: 2025-01-28
tags: [tag1, tag2]
---
```

### Adding New Content
1. Create `.md` files in `content/` directory
2. Add appropriate frontmatter
3. Run `npx quartz build --serve` to preview
4. Content is automatically processed and added to the site

### English Learning System
The `english-learning-system/` directory contains a specialized subsystem:
- **Purpose**: AI-driven English learning from A2 to B2 level
- **Workflow**: Daily test generation → completion → grading → progress tracking
- **Key Files**:
  - `config.json` - System configuration
  - `daily-tests/` - Auto-generated daily tests
  - `grammar-notes/tenses.md` - Grammar reference
  - `vocabulary-log/` - Vocabulary tracking
  - `progress-tracking/` - Individual grade and assessment files
  - `analytics/progress.json` - Aggregate progress data

## Build Process Details

### Transpilation Pipeline
1. **CLI bootstrap** (`bootstrap-cli.mjs`):
   - Uses esbuild to transpile TypeScript to JavaScript
   - Bundles `.scss` files using esbuild-sass-plugin
   - Handles inline client scripts (`.inline.ts` files)
   - Creates preview servers (HTTP on 8080, WebSocket on 3001)

2. **Content Processing** (`build.ts`):
   - Cleans output directory
   - Globs all files in `content/`
   - Parses Markdown using unified/remark/rehype pipeline
   - Applies transformers → filters → emitters
   - Multi-threaded parsing for >128 files (using workerpool)

3. **Plugin Pipeline**:
   - **Transformers**: Modify content (text → Markdown → HTML)
   - **Filters**: Remove unwanted content
   - **Emitters**: Generate final files (HTML, CSS, JS, assets)

### Hot Reload
- Configuration changes trigger esbuild rebuild
- Content changes (`.md` files) trigger content rebuild
- Debounced with 250ms threshold
- WebSocket signals client to refresh

### Client-Side
1. Load HTML
2. Load critical CSS (`index.css`) and JS (`prescript.js`)
3. Load non-critical JS (`postscript.js`) after body
4. Dispatch custom `"nav"` event to initialize components
5. If SPA enabled, `"nav"` event fires on navigation

## Important Notes

### Performance Considerations
- **CustomOgImages plugin is commented out** in config to speed up builds
- Multi-threaded parsing automatically enabled for >128 files
- CSS is minified and vendor-prefixed using Lightning CSS

### Content Organization Patterns
- `notebook/` - Technical notes, tutorials, documentation
- `diary/` - Personal reflections with dates in filename
- Tags are used for categorization
- Both Chinese and English content present

### Git Workflow
- Content is version-controlled
- `public/` output is gitignored
- `.obsidian/` is gitignored but some configs may be tracked
- Images in `img/` are tracked

### Customization Points
- **Add plugins**: Modify `quartz.config.ts` plugins array
- **Change layout**: Edit `quartz.layout.ts`
- **Custom components**: Create new files in `quartz/components/`
- **Theme**: Modify color/font configuration in `quartz.config.ts`

## Development Tips

- When adding new plugins, ensure they're properly imported from `quartz/plugins`
- Components use Preact (not React), but the API is nearly identical
- The build system caches transpiled modules in `.quartz-cache/`
- For SPA navigation issues, check the `enableSPA` setting in config
- Graph view depends on link crawling - ensure `CrawlLinks` transformer is enabled
- Search functionality requires the `ContentIndex` emitter with proper settings
