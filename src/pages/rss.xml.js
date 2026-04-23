import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = await getCollection('blog');
  const published = posts
    .filter(post => !post.data.draft)
    .sort((a, b) => {
      const da = a.data.date?.getTime() || 0;
      const db = b.data.date?.getTime() || 0;
      return db - da;
    });

  return rss({
    title: "ChengYongru's Digital Garden",
    description: 'Notes on ML, Security, Reverse Engineering, and more',
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
