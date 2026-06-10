export const THEMES = ['dark', 'light'] as const;

export type ThemeName = typeof THEMES[number];

export const THEME_LABELS: Record<ThemeName, string> = {
  dark: 'Dark',
  light: 'Light',
};

export function normalizeTheme(value: string | null | undefined): ThemeName {
  return value === 'light' || value === 'dark' ? value : 'dark';
}
