// ============================================================
// Post Content Endpoint
// Serves rendered article HTML without the full blog page shell.
// ============================================================

import type { APIRoute } from 'astro';
import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';
import { estimateReadingTime } from '../../utils/content-index';
import { isPublishablePost } from '../../utils/publication';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.filter(post => isPublishablePost(post)).map(post => ({
    params: { slug: post.id },
    props: { post },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const post = props.post as CollectionEntry<'blog'>;
  const html = post.rendered?.html || '';

  return new Response(JSON.stringify({
    title: post.data.title || post.id,
    html,
    slug: post.id,
    date: post.data.date?.toISOString(),
    tags: post.data.tags || [],
    reading_time: estimateReadingTime(post.body || ''),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': import.meta.env.DEV ? 'no-cache' : 'public, max-age=3600',
    },
  });
};
