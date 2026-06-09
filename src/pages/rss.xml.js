import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import config from '../config';
import { isPublishablePost } from '../utils/publication';

export async function GET(context) {
  const posts = await getCollection('blog');
  const published = posts
    .filter(post => isPublishablePost(post))
    .sort((a, b) => {
      const da = a.data.date?.getTime() || 0;
      const db = b.data.date?.getTime() || 0;
      return db - da;
    });

  return rss({
    title: config.rss.title,
    description: config.rss.description,
    site: context.site,
    items: published.map(post => ({
      title: post.data.title || post.id,
      pubDate: post.data.date || new Date(),
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
    })),
    customData: `<language>zh-CN</language>`,
  });
}
