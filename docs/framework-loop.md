# Framework Loop State

Last updated: 2026-06-10

## Current Goal

Convert this Astro + Preact terminal-style blog from a personal site into a reusable, configurable, documented, and verifiable blog framework that fork users can adopt without editing core code.

## Non-Breakable Product Features

- Terminal UI remains the primary interface.
- Command-driven browsing remains core.
- Light and dark themes remain available.
- Three-body spotlight background remains available.
- `content/` remains the authoring workflow.
- Obsidian-compatible positioning remains intact.

## Discovered Issue Backlog

### P0

- None currently open.

### P1

- `src/config.ts` defaults are still personal: site URL/title, brand, hostname, email, tagline, neofetch identity, directory descriptions, RSS title/description.
- `src/components/Terminal.tsx` home quick actions hard-code `ls notebook/` and `grep agent`.
- `src/terminal/commands.ts` has personal/default assumptions: `about` opens `index` as `About Me`, `whoami` says "You are reading the notes of ...", and `date` hard-codes `zh-CN` plus `Asia/Shanghai`.
- `package.json` package name is `chengyongru-github-io`, which is personal rather than template-oriented.
- README says `src/config.ts` is "the only file you need to edit", but custom loader behavior and privacy defaults now deserve clearer framework docs.

### P2

- Tests use realistic personal-ish sample slugs and topic labels in places. This is acceptable for fixtures but should be kept clearly generic over time.
- `config` comments use examples such as `CYR` and `ML`; these are only examples but still reinforce the personal defaults.
- README has no explicit initialization checklist for replacing sample content, validating content visibility, or understanding publication filters.

## Current Active Issue

Paused before the next P1 task.

Why pause:

- The remaining P1 items involve default template identity, terminal copy, quick actions, package naming, or locale/time-zone behavior.
- Those are product defaults rather than purely mechanical wiring.
- User confirmation is needed before choosing the next P1.

Candidate next tasks:

- Make terminal `date` locale/time zone configurable.
- Make `about`/`whoami` text configurable and less personal by default.
- Replace hard-coded homepage quick actions with config-driven defaults.
- Decide template-oriented defaults for `src/config.ts` and `package.json`.

## Completed Issues

- Initialized loop state file.
- Implemented reusable featured-post selection:
  - `home.featuredSlugs` defaults to `[]`.
  - Manual valid slugs are pinned first.
  - `featured: true` frontmatter fills remaining featured slots.
  - `featuredRank` sorts frontmatter featured posts before date fallback.
  - Recent posts fill remaining featured slots.
  - Missing slugs and empty content lists do not crash.
- Added featured metadata to the content schema and generated `content-index.json`.
- Updated README with frontmatter featured usage, manual slug usage, and fallback behavior.
- Generalized content loading:
  - Recursive markdown discovery under `content/`.
  - Loader-level excludes for dot paths, `_obsidian`, `clippings`, `img`, and `src`.
  - Publication-level private path filtering as a second defense.
  - Safe loader skips invalid frontmatter entries with warnings instead of failing the whole build.
  - Nested directory structure is preserved in the terminal virtual file system.
- Updated README with nested content and private path behavior.
- Made document and RSS language use `config.site.lang`.

Changed files so far:

- `README.md`
- `src/config.ts`
- `src/content.config.ts`
- `src/components/Terminal.tsx`
- `src/layouts/BaseLayout.astro`
- `src/pages/rss.xml.js`
- `src/terminal/constants.ts`
- `src/terminal/file-tree.ts`
- `src/terminal/home.ts`
- `src/terminal/types.ts`
- `src/terminal/__tests__/file-tree.test.ts`
- `src/terminal/__tests__/home.test.ts`
- `src/terminal/__tests__/terminal.test.ts`
- `src/utils/content-index.ts`
- `src/utils/safe-content-loader.ts`
- `src/utils/__tests__/content-index.test.ts`
- `src/utils/__tests__/publication.test.ts`
- `docs/framework-loop.md`

## Human Decision Log

- 2026-06-10: User required first round to stop after Observe + Select + Human Gate and not modify code before approval.
- 2026-06-10: User approved the hybrid featured strategy with "合理".
- 2026-06-10: User approved recursive markdown loading with strict private path defaults.

## Verification Log

- 2026-06-10 featured task:
  - `npm run build`: PASS, 15 pages built, existing large chunk warning.
  - `npx astro check`: PASS, 0 errors/warnings/hints.
  - `npx vitest run`: PASS, 9 files / 220 tests.
  - Playwright smoke: PASS for homepage dark, homepage light, and article viewer.
- 2026-06-10 recursive content task:
  - `npx vitest run src/utils/__tests__/publication.test.ts src/utils/__tests__/content-index.test.ts src/terminal/__tests__/terminal.test.ts`: PASS, 44 tests.
  - First `npm run build`: FAIL because `_obsidian/frontmatter.md` was included before loader-level excludes.
  - Second `npm run build`: FAIL because a normal nested note had invalid YAML frontmatter.
  - Added safe loader and nested directory support.
  - `npx astro check`: PASS, 37 files, 0 errors/warnings/hints.
  - `npx vitest run`: PASS, 9 files / 225 tests.
  - `npm run build`: PASS, 33 pages built.
  - Expected warning: `safe-content-glob-loader` skipped `notebook/english/1_concepts/verb-pattern-suggest.md` because of invalid frontmatter.
  - `dist/content-index.json` check: PASS, 32 posts, nested directory present, skipped invalid note absent, private paths absent.
  - Playwright smoke against `astro preview`: PASS.
    - Homepage dark theme visible.
    - `ls notebook/` shows `english/`.
    - Homepage light theme visible.
    - Nested article `/blog/notebook/english/2_index/` restores the terminal content viewer.
  - Cleanup: preview processes on port 4321 stopped.
- 2026-06-10 language-config task:
  - `npx astro check`: PASS, 37 files, 0 errors/warnings/hints.
  - `npx vitest run`: PASS, 9 files / 225 tests.
  - `npm run build`: PASS, 33 pages built.
  - Expected warning remains: `safe-content-glob-loader` skipped `notebook/english/1_concepts/verb-pattern-suggest.md` because of invalid frontmatter.
  - Generated output check: `dist/index.html` contains `<html lang="zh-CN"` and `dist/rss.xml` contains `<language>zh-CN</language>`, matching current `config.site.lang`.

## Next Round Suggestions

- Ask the user to choose the next P1 product default area:
  - Locale/time-zone config.
  - Terminal identity copy (`about`, `whoami`, `neofetch` defaults).
  - Homepage quick actions.
  - Template/package metadata.
