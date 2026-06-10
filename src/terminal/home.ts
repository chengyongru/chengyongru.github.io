import type { PostMeta } from './types';

export interface HomePostSelection {
  featured: PostMeta[];
  recent: PostMeta[];
}

export interface SelectHomePostsOptions {
  featuredLimit?: number;
  recentLimit?: number;
}

const DEFAULT_FEATURED_LIMIT = 3;
const DEFAULT_RECENT_LIMIT = 4;

function normalizedSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function featuredRank(post: PostMeta): number {
  return typeof post.featuredRank === 'number' && Number.isFinite(post.featuredRank)
    ? post.featuredRank
    : Number.MAX_SAFE_INTEGER;
}

function compareFeaturedPosts(a: PostMeta, b: PostMeta): number {
  const rankDiff = featuredRank(a) - featuredRank(b);
  if (rankDiff !== 0) return rankDiff;

  const dateDiff = (b.date || '').localeCompare(a.date || '');
  if (dateDiff !== 0) return dateDiff;

  return a.slug.localeCompare(b.slug);
}

export function selectHomePosts(
  posts: readonly PostMeta[],
  featuredSlugs: readonly string[] = [],
  options: SelectHomePostsOptions = {},
): HomePostSelection {
  const featuredLimit = Math.max(0, options.featuredLimit ?? DEFAULT_FEATURED_LIMIT);
  const recentLimit = Math.max(0, options.recentLimit ?? DEFAULT_RECENT_LIMIT);
  const visiblePosts = posts.filter(post => post.slug !== 'index');
  const postsBySlug = new Map(visiblePosts.map(post => [normalizedSlug(post.slug), post]));
  const selectedSlugs = new Set<string>();
  const featured: PostMeta[] = [];

  const addFeatured = (post: PostMeta | undefined) => {
    if (!post || featured.length >= featuredLimit) return;
    const slug = normalizedSlug(post.slug);
    if (selectedSlugs.has(slug)) return;
    selectedSlugs.add(slug);
    featured.push(post);
  };

  for (const slug of featuredSlugs) {
    addFeatured(postsBySlug.get(normalizedSlug(slug)));
  }

  if (featured.length < featuredLimit) {
    const frontmatterFeatured = visiblePosts
      .filter(post => post.featured)
      .sort(compareFeaturedPosts);

    for (const post of frontmatterFeatured) {
      addFeatured(post);
    }
  }

  if (featured.length < featuredLimit) {
    for (const post of visiblePosts) {
      addFeatured(post);
    }
  }

  const recent = visiblePosts
    .filter(post => !selectedSlugs.has(normalizedSlug(post.slug)))
    .slice(0, recentLimit);

  return { featured, recent };
}
