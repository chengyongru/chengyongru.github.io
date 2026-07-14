import { defineConfig, passthroughImageService } from 'astro/config';
import { fileURLToPath } from 'url';
import path from 'path';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { remarkMermaid } from './src/utils/remark-mermaid';
import { remarkImagePath } from './src/utils/remark-image-path';
import { remarkObsidian } from './src/utils/remark-obsidian';
import { syncPublishedAssets } from './src/utils/published-assets';
import { default as siteConfig } from './src/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function publishedContentAssets() {
  return {
    name: 'published-content-assets',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const result = await syncPublishedAssets(
          fileURLToPath(dir),
          path.resolve(__dirname, 'content/img'),
        );
        if (result.missing.length > 0) {
          throw new Error(
            `Published content references missing or unsafe assets: ${result.missing.join(', ')}`,
          );
        }
        logger.info(
          `Copied ${result.copied} referenced content asset(s); unreferenced assets were excluded.`,
        );
      },
    },
  };
}

export default defineConfig({
  site: siteConfig.site.url,
  output: 'static',
  integrations: [
    preact(),
    sitemap(),
    publishedContentAssets(),
  ],
  image: {
    service: passthroughImageService(),
  },
  markdown: {
    remarkPlugins: [
      remarkObsidian,
      remarkImagePath,
      remarkMermaid,
      remarkMath,
      remarkGfm,
    ],
    rehypePlugins: [[rehypeKatex, { output: 'html' }]],
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
    plugins: [
      tailwindcss(),
      {
        name: 'bypass-svg-metadata',
        enforce: 'pre',
        async resolveId(id, _importer) {
          if (id.includes('astroContentImageFlag') && id.includes('.svg')) {
            // Let Astro resolve the file path, then return a no-op module
            return null;
          }
        },
        async load(id) {
          if (id.includes('astroContentImageFlag') && id.endsWith('.svg')) {
            // Return a module that exports the raw file path instead of processed metadata
            const filePath = id.split('?')[0];
            return `export default { src: "${filePath}", fsPath: "${filePath}" };`;
          }
        },
      },
    ],
    ssr: {
      noExternal: ['katex'],
    },
  },
});
