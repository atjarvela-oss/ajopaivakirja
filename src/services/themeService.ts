export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_THEME_KEY = 'opetuslupa_theme_preference';

export function getStoredTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch (e) {
    console.error(e);
  }
  return 'system';
}

export function applyTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_THEME_KEY, theme);
  } catch (e) {
    console.error(e);
  }

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  // Update theme-color meta tag for mobile status bar
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#0f172a' : '#2563eb');
  }
}
