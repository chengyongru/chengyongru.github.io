# CLAUDE.md

Quartz v4 digital garden. Stack: TypeScript, Node.js v22+, Preact, Remark/Rehype.

## Build Commands

```bash
npx quartz build --serve    # Local with hot-reload (localhost:8080)
npx quartz build            # Production
npm run check              # Type + format check
npm run format             # Format code
```

## Architecture

**Config**: `quartz.config.ts`, `quartz.layout.ts`

**Content Pipeline**: Transformers → Filters → Emitters

**Core**:
- `build.ts` - Build orchestration
- `bootstrap-cli.mjs` - CLI entry (esbuild transpilation)

**Components** (`quartz/components/`): Preact layout components

**Plugins** (`quartz/plugins/`):
- Transformers (content modification)
- Filters (content exclusion)
- Emitters (file generation)

## Key Settings

- **Ignore patterns**: `["private", "templates", "_obsidian", "copilot"]`
- **Date priority**: frontmatter → git → filesystem
- **Link resolution**: absolute paths
- **Multi-threading**: auto-enabled for >128 files
- **Output**: `public/` (gitignored)

## Layouts

- **Content pages**: title, metadata, tags, left sidebar (search, recent), right sidebar (graph, TOC, backlinks)
- **List pages**: simplified without right sidebar

## Performance

- CustomOgImages disabled
- CSS minified with Lightning CSS
- Hot-reload: 250ms debounce via WebSocket

## Tips

- Components use Preact (not React)
- Cache: `.quartz-cache/`
- SPA: check `enableSPA` setting
- Graph: needs `CrawlLinks` transformer
- Search: needs `ContentIndex` emitter
