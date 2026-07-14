import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { safeContentGlob } from './utils/safe-content-loader';
import { shouldFilterSlug } from './terminal/constants';

const contentPatterns = [
  '**/*.md',
  '!**/.*.md',
  '!**/.*/**',
  '!**/_obsidian/**',
  '!**/[Cc]lippings/**',
  '!**/img/**',
  '!**/src/**',
];

const blog = defineCollection({
  loader: safeContentGlob({
    pattern: contentPatterns,
    base: './content',
    cacheDependencies: [
      'astro.config.mjs',
      'src/content.config.ts',
      'src/utils/remark-image-path.ts',
      'src/utils/remark-mermaid.ts',
      'src/utils/remark-obsidian.ts',
      'src/utils/safe-content-loader.ts',
    ],
    generateId: ({ entry }) => entry.replace(/\.md$/i, '').toLowerCase(),
    shouldSkipEntry: entry => shouldFilterSlug(entry.replace(/\.md$/i, '').toLowerCase()),
  }),
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date().optional(),
    created: z.coerce.date().optional(),
    modify_date: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    publish: z.boolean().optional(),
    draft: z.boolean().default(false),
    mathjax: z.boolean().default(true),
    featured: z.boolean().default(false),
    featuredRank: z.coerce.number().optional(),
  }),
});

export const collections = { blog };
