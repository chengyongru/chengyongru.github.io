import config, { type PublishConfig } from '../config';
import { shouldFilterSlug } from '../terminal/constants';

interface PostForPublication {
  id: string;
  data: {
    publish?: boolean;
    draft?: boolean;
    tags?: readonly string[] | null;
  };
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').toLowerCase();
}

function resolveRules(rules: PublishConfig | unknown): PublishConfig {
  if (
    rules &&
    typeof rules === 'object' &&
    Array.isArray((rules as PublishConfig).blockedTags) &&
    Array.isArray((rules as PublishConfig).alwaysPublishSlugs) &&
    typeof (rules as PublishConfig).requirePublishFlag === 'boolean' &&
    typeof (rules as PublishConfig).requireTags === 'boolean'
  ) {
    return rules as PublishConfig;
  }
  return config.publish;
}

export function normalizePublishTags(tags: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.map(normalizeTag).filter(Boolean);
}

export function isAlwaysPublishedSlug(slug: string, rules: PublishConfig = config.publish): boolean {
  const activeRules = resolveRules(rules);
  const normalizedSlug = slug.toLowerCase();
  return activeRules.alwaysPublishSlugs.some(always => always.toLowerCase() === normalizedSlug);
}

export function isPublishableByTags(
  tags: readonly string[] | null | undefined,
  rules: PublishConfig = config.publish,
): boolean {
  const activeRules = resolveRules(rules);
  const normalizedTags = normalizePublishTags(tags);

  if (activeRules.requireTags && normalizedTags.length === 0) {
    return false;
  }

  const blockedTags = new Set(normalizePublishTags(activeRules.blockedTags));
  return !normalizedTags.some(tag => blockedTags.has(tag));
}

export function isPublishablePost(
  post: PostForPublication,
  rules: PublishConfig | unknown = config.publish,
): boolean {
  const activeRules = resolveRules(rules);
  if (post.data.draft) return false;
  if (shouldFilterSlug(post.id)) return false;
  if (activeRules.requirePublishFlag && post.data.publish !== true) return false;
  if (isAlwaysPublishedSlug(post.id, activeRules)) return true;
  return isPublishableByTags(post.data.tags, activeRules);
}
