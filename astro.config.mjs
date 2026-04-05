import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'url';
import path from 'path';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkObsidianLinks from 'remark-obsidian-links';
import rehypeKatex from 'rehype-katex';
import { remarkMermaid } from './src/utils/remark-mermaid';
import { remarkImagePath } from './src/utils/remark-image-path';
import { remarkObsidian } from './src/utils/remark-obsidian';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://chengyongru.github.io',
  output: 'static',
  integrations: [
    preact(),
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap(),
  ],
  image: {
    dangerouslyAllowSVG: true,
  },
  markdown: {
    remarkPlugins: [
      remarkObsidianLinks,
      remarkObsidian,
      remarkImagePath,
      remarkMermaid,
      remarkMath,
      remarkGfm,
    ],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      theme: 'github-dark',
    },
  },
  vite: {
    resolve: {
      alias: {
        'img': path.resolve(__dirname, 'public/img'),
      },
    },
    ssr: {
      noExternal: ['katex'],
    },
  },
});
