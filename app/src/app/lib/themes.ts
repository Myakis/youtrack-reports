// Темы оформления: светлая или тёмная база (класс .dark на <html>) и свои цвета (data-theme, см. globals.css).
export type ThemeId = '' | 'light' | 'dark' | 'graphite' | 'midnight' | 'onyx' | 'pine' | 'plum' | 'sapphire' | 'sand';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  /** Тёмная база; 'system' — как в системе. */
  dark: boolean | 'system';
}

export const THEMES: ThemeInfo[] = [
  { id: '', name: 'Как в системе', dark: 'system' },
  { id: 'light', name: 'Светлая', dark: false },
  { id: 'dark', name: 'Тёмная', dark: true },
  { id: 'graphite', name: 'Графит', dark: true },
  { id: 'midnight', name: 'Полночь', dark: true },
  { id: 'onyx', name: 'Оникс', dark: true },
  { id: 'pine', name: 'Хвоя', dark: true },
  { id: 'plum', name: 'Слива', dark: true },
  { id: 'sapphire', name: 'Сапфир', dark: false },
  { id: 'sand', name: 'Песок', dark: false },
];

export const themeInfo = (id: string): ThemeInfo => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** Свои цвета есть у всех, кроме базовых трёх. */
export const ownColors = (id: ThemeId) => id !== '' && id !== 'light' && id !== 'dark';

/** Применить тему к странице; systemDark — тёмная ли тема в системе. */
export function applyTheme(id: ThemeId, systemDark: boolean, root: HTMLElement = document.documentElement) {
  const t = themeInfo(id);
  root.classList.toggle('dark', t.dark === 'system' ? systemDark : t.dark);
  if (ownColors(t.id)) root.dataset.theme = t.id;
  else delete root.dataset.theme;
}
