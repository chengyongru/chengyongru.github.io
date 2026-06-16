# shell.garden

[English](README.en.md) | 中文

一个可复用的终端风格博客模板。底层使用 Astro 静态生成页面，用 Preact 提供交互式终端和文章阅读器，适合把 Markdown 笔记、Obsidian vault 或个人知识库发布成一个可浏览、可搜索、可部署到 GitHub Pages 的站点。

![shell.garden screenshot](docs/screenshot.png)

访问者进入站点后会看到一个终端窗口，可以用 `ls`、`cd`、`cat`、`grep`、`tag`、`recent` 等命令浏览公开内容。每篇文章也会生成普通的 `/blog/...` 静态路由，用于直链分享、RSS 和搜索引擎索引。

## 适合谁

- 想把 Markdown 笔记发布成个人博客或数字花园。
- 想保留类似终端的浏览体验，而不是传统列表式博客首页。
- 想让同一个 `content/` 目录既能作为 Obsidian vault，又能作为网站内容源。
- 想 fork 后通过少量配置替换成自己的站点。

当前仓库的默认配置和示例内容来自作者站点；作为模板使用时，重点改 `src/config.ts`、`content/` 和少量首页快捷命令即可。

## 快速开始

```bash
git clone <your-repo-url>
cd <your-repo>
npm ci
npm run dev
```

如果你是直接 fork 本仓库，需要先决定 `content/` 怎么处理：

1. 继续使用 Git submodule：替换 `.gitmodules` 里的仓库地址，然后运行 `git submodule update --init --recursive`。
2. 不使用 submodule：删除 submodule 关联，改成普通 `content/` 目录，直接放自己的 Markdown。

如果文章图片放在 `content/img`，需要让 Astro 能从 `public/img` 访问它。CI 会自动创建这个链接；本地缺失时建一次即可：

```bash
# macOS / Linux
ln -s ../content/img public/img
```

```powershell
# Windows PowerShell
New-Item -ItemType Junction -Path public\img -Target (Resolve-Path content\img)
```

`public/img` 被 `.gitignore` 忽略，不应该提交。

## 你通常需要改的地方

| 文件 / 目录 | 需要改什么 |
| --- | --- |
| `src/config.ts` | 站点 URL、标题、语言、终端品牌、邮箱、首页文案、目录说明、RSS、发布规则 |
| `content/` | 你的 Markdown 笔记和图片资源 |
| `src/components/Terminal.tsx` | 首页底部快捷命令，例如默认的 `ls notebook/`、`grep agent` |
| `.github/workflows/deploy.yml` | GitHub Pages 触发分支、Node 版本、私有 submodule token |
| `docs/screenshot.png` | README 展示截图 |

大多数 fork 不需要改命令系统、文章渲染器或内容索引逻辑。

## 配置

`src/config.ts` 是模板的主要配置入口：

```ts
site: {
  url: 'https://your-name.github.io',
  title: "Your Terminal",
  description: 'A terminal-style digital garden',
  lang: 'zh-CN',
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

`dirs` 的 key 使用内容目录路径，末尾保留 `/`。例如 `content/notebook/english/foo.md` 对应的目录说明可以写成 `notebook/english/`。

## 内容目录

所有公开内容来自 `content/` 下的 Markdown 文件。目录结构会变成终端中的虚拟文件系统：

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

- `content/index.md` 是 `about` 命令打开的页面。
- 嵌套目录会自动出现在 `ls` 输出中。
- 文件 slug 来自相对路径，例如 `content/notebook/Attention.md` 会生成 `notebook/attention`。
- 文章静态页面为 `/blog/<slug>/`。
- 终端阅读器按需请求 `/post-content/<slug>.json`。

支持的 frontmatter：

```yaml
---
title: My Post
date: 2026-06-16
created: 2026-06-16
modify_date: 2026-06-16
tags: [ml, security]
draft: false
mathjax: true
featured: false
featuredRank: 10
---
```

字段说明：

| 字段 | 作用 |
| --- | --- |
| `title` | 文章标题，缺省时使用 slug |
| `date` | 发布日期，影响排序和 RSS |
| `created` / `modify_date` | 可选元数据 |
| `tags` | 标签；当前默认发布规则要求至少有一个 tag |
| `draft` | `true` 时永远不公开 |
| `mathjax` | 保留兼容字段；模板默认启用 KaTeX 渲染 |
| `featured` | 是否进入首页 Featured 候选 |
| `featuredRank` | Featured 排序，数字越小越靠前 |

无效 frontmatter 不会让整个站点构建失败；`safe-content-glob-loader` 会跳过该文件并输出 warning。

## 发布规则

公开内容由两层规则过滤。

第一层是路径过滤，会跳过 dot path、`_obsidian`、`.obsidian`、`.trash`、`.claude`、`Clippings`、`img`、`src` 等不适合公开发布的路径。

第二层是 `src/config.ts` 的 tag 规则：

```ts
publish: {
  requireTags: true,
  blockedTags: ['todo', 'english'],
  alwaysPublishSlugs: ['index'],
}
```

默认含义：

- 除 `index` 外，笔记必须有 tag 才发布。
- 带 `todo` 或 `english` tag 的笔记不会发布。
- `alwaysPublishSlugs` 可让特定 slug 绕过 tag 要求。
- `draft: true` 和私有路径过滤始终优先，不会被绕过。

这些规则会同时影响 `/blog/...` 页面、`content-index.json`、终端列表、搜索、标签、最近文章和 RSS。

## 首页 Featured

首页终端会显示 Featured 和 Recent 两列。Featured 的选择顺序：

1. `src/config.ts` 里的 `home.featuredSlugs`
2. Markdown frontmatter 的 `featured: true`
3. 最近发布的文章补位

示例：

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

`featuredRank` 越小越靠前。没有 rank 的 featured 文章按日期排序。

## 终端功能

当前支持的命令：

```text
ls cd cat grep tag recent about neofetch help clear theme whoami echo date history pwd
```

交互能力：

- `Tab` / `Shift+Tab` 循环补全命令、目录和文章。
- 目录、文件、tag 和快捷命令可点击。
- `theme dark` / `theme light` 切换主题，并保存到 `localStorage`。
- 方向键浏览命令历史。
- 终端窗口可拖动、缩放、最大化。
- 首页终端使用 `client:idle` 水合，先显示静态页面再加载交互。

文章阅读器支持：

- `Ctrl+d` / `Ctrl+u` 半页滚动。
- `G` 到底部，`gg` 到顶部。
- `/` 搜索，`n` / `N` 切换搜索结果。
- `q` / `Esc` 关闭阅读器。
- 代码块复制按钮。
- 内链拦截，站内文章切换不刷新整个页面。

## Markdown 能力

- GFM 表格、任务列表等基础扩展。
- KaTeX 数学公式，CSS 和字体自托管在 `/vendor/katex/`。
- Mermaid 图表，在阅读器中按需加载。
- Shiki 代码高亮。
- Obsidian 风格高亮、callout 和图片路径处理。
- 文章页带 SEO 隐藏正文，终端体验和爬虫索引兼容。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `astro.config.mjs` | Astro、Preact、Tailwind、Markdown 插件和 sitemap 配置 |
| `src/config.ts` | 模板主配置 |
| `src/components/Terminal.tsx` | 终端 UI 和首页启动内容 |
| `src/components/ContentViewer.tsx` | 文章阅读器 |
| `src/terminal/` | 命令、补全、文件树、主题、首页选择逻辑 |
| `src/utils/` | 内容索引、发布过滤、remark 插件、安全 loader |
| `src/pages/blog/[...slug].astro` | 静态文章路由 |
| `src/pages/post-content/[...slug].json.ts` | 阅读器文章 JSON |
| `src/pages/content-index.json.ts` | 终端内容索引 |
| `content/` | Markdown 内容源 |
| `public/vendor/katex/` | KaTeX 静态资源 |
| `tests/e2e/` | Playwright 验证 |

## 常用命令

| 任务 | 命令 |
| --- | --- |
| 开发服务器 | `npm run dev` |
| 静态构建 | `npm run build` |
| 预览构建产物 | `npm run preview` |
| Astro / TypeScript 检查 | `npm run check` |
| 单元测试 | `npx vitest run` |
| 浏览器端验证 | `npx playwright test` |
| 代码格式化 | `npm run format` |
| 静态资源体积检查 | `npm run audit:assets` |

`playwright.config.ts` 会先执行 `npm run build`，再启动 `astro preview`。默认端口是 `4321`，可通过 `PLAYWRIGHT_PORT` 修改；如果已经有外部服务，设置 `PLAYWRIGHT_BASE_URL` 即可跳过内置 web server。

## 部署到 GitHub Pages

当前工作流在 `.github/workflows/deploy.yml`：

- 触发分支：`v4`
- Node.js：`22`
- 安装：`npm ci`
- checkout：`submodules: recursive`
- 构建前创建 `public/img -> ../content/img`
- 构建产物：`dist`
- 部署目标：GitHub Pages

作为模板 fork 后，你通常需要：

1. 把触发分支改成自己的发布分支，例如 `main`。
2. 确认 `src/config.ts` 的 `site.url` 是最终站点 URL。
3. 如果使用私有内容 submodule，给 `secrets.ACCESS_TOKEN` 配读取权限。
4. 在仓库 Settings 里启用 GitHub Pages，并选择 GitHub Actions 部署。

也可以部署到任何静态托管平台，只需要执行 `npm run build` 并发布 `dist/`。

## 发布前检查

```bash
npm run check
npx vitest run
npm run build
npx playwright test
npm run audit:assets
```

资源体积建议：

- 单张截图尽量低于 500 KB。
- PDF、zip、tar.gz 等下载文件尽量低于 2 MB。
- 大图优先转 WebP / AVIF。
- 不要把个人归档用的大附件放到默认公开资源路径。

## License

MIT
