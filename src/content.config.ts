import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({
    pattern: '{*.md,diary/*.md,notebook/*.md}',
    base: './content',
    generateId: ({ entry }) => entry.replace(/\.md$/i, '').toLowerCase(),
  }),
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date().optional(),
    created: z.coerce.date().optional(),
    modify_date: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    mathjax: z.boolean().default(true),
  }),
});

export const collections = { blog };
