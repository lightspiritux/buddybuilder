import { atom } from 'nanostores';

export type Theme = 'light' | 'dark';

export const themeStore = atom<Theme>('dark');

export const toggleTheme = () => {
  const currentTheme = themeStore.get();
  themeStore.set(currentTheme === 'light' ? 'dark' : 'light');
};

export const getThemeStyles = (theme: Theme) => {
  return {
    light: {
      background: 'linear-gradient(180deg, #ffffff, #669187)',
      text: '#000000',
      border: '#e5e7eb',
      hover: '#f3f4f6',
      accent: '#3b82f6',
      accentHover: '#2563eb',
      muted: '#6b7280',
      mutedHover: '#4b5563',
      error: '#ef4444',
      success: '#22c55e',
      warning: '#f59e0b'
    },
    dark: {
      background: 'linear-gradient(180deg, #122029, #669187)',
      text: '#ffffff',
      border: '#374151',
      hover: '#1f2937',
      accent: '#3b82f6',
      accentHover: '#2563eb',
      muted: '#9ca3af',
      mutedHover: '#d1d5db',
      error: '#ef4444',
      success: '#22c55e',
      warning: '#f59e0b'
    }
  }[theme];
};
