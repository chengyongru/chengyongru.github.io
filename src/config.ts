// ============================================================
// Site Configuration
// Edit this file to personalize your shell.garden instance.
// ============================================================

export interface SiteConfig {
  url: string;
  title: string;
  description: string;
  lang: string;
}

export interface TerminalConfig {
  /** Main brand text displayed in banner (e.g. "CYR") */
  brand: string;
  /** CSS color variable for brand (e.g. "green") */
  brandColor: string;
  /** Secondary brand text after the dot (e.g. "ML") */
  brandSuffix: string;
  /** Hostname shown in prompt and title bar */
  hostname: string;
  /** Contact email shown in banner */
  email: string;
}

export interface HomeConfig {
  /** One-line editorial positioning shown on terminal boot. */
  tagline: string;
  /** Optional manual pins shown before frontmatter-featured and recent posts. */
  featuredSlugs: string[];
}

export interface NeofetchConfig {
  os: string;
  host: string;
  kernel: string;
  shell: string;
  editor: string;
  languages: string;
  focus: string;
  uptime: string;
}

export interface RssConfig {
  title: string;
  description: string;
}

export interface PublishConfig {
  /** Require frontmatter `publish: true` before a note can be publicly generated. */
  requirePublishFlag: boolean;
  /** Require at least one tag before a note is publicly generated. */
  requireTags: boolean;
  /** Any note with one of these tags is kept out of the public site. */
  blockedTags: string[];
  /** Slugs that bypass tag-based filtering, while still respecting publish/draft/path filters. */
  alwaysPublishSlugs: string[];
}

export interface Config {
  site: SiteConfig;
  terminal: TerminalConfig;
  home: HomeConfig;
  neofetch: NeofetchConfig;
  /** Directory descriptions for `ls` output. Key = directory path (e.g. "notebook/") */
  dirs: Record<string, string>;
  rss: RssConfig;
  publish: PublishConfig;
}

const config: Config = {
  site: {
    url: 'https://chengyongru.github.io',
    title: "ChengYongru's Terminal",
    description: 'A terminal-style digital garden',
    lang: 'zh-CN',
  },

  terminal: {
    brand: 'CYR',
    brandColor: 'green',
    brandSuffix: 'ML',
    hostname: 'chengyongru',
    email: 'chengyongru.ai@gmail.com',
  },

  home: {
    tagline: 'Maintainer of nanobot. Notes on AI agents, ML, security, reverse engineering, and debugging.',
    featuredSlugs: [],
  },

  neofetch: {
    os: 'ChengYongruOS v4.0',
    host: 'Digital Garden',
    kernel: 'Astro + Preact',
    shell: 'Terminal UI',
    editor: 'VS Code + Obsidian',
    languages: 'Python, C++, TypeScript',
    focus: 'ML, Security, Reverse Engineering',
    uptime: 'Since 2025',
  },

  dirs: {
    'diary/': 'Journal entries',
    'notebook/': 'ML/DL/RL/Security notes',
  },

  rss: {
    title: "ChengYongru's Digital Garden",
    description: 'Notes on ML, Security, Reverse Engineering, and more',
  },

  publish: {
    requirePublishFlag: true,
    requireTags: true,
    blockedTags: ['todo', 'english'],
    alwaysPublishSlugs: ['index'],
  },
};

export default config;
