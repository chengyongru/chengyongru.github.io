// ============================================================
// Content Index Endpoint
// Generates /content-index.json at build time
// ============================================================

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { generateContentIndex } from '../utils/content-index';

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const index = await generateContentIndex(posts);

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
