import { Injectable, signal, computed, effect } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _preference = signal<ThemePreference>(this.getStoredPreference());
  private readonly _systemTheme = signal<Theme>(this.detectSystemTheme());

  readonly preference = this._preference.asReadonly();
  readonly resolvedTheme = computed<Theme>(() => {
    const pref = this._preference();
    return pref === 'system' ? this._systemTheme() : pref;
  });
  readonly isDark = computed(() => this.resolvedTheme() === 'dark');

  constructor() {
    // Apply theme to DOM
    effect(() => {
      const theme = this.resolvedTheme();
      document.body.setAttribute('data-theme', theme);
    });

    // Listen for OS theme changes
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        this._systemTheme.set(e.matches ? 'dark' : 'light');
      });
    }
  }

  setPreference(pref: ThemePreference): void {
    this._preference.set(pref);
    localStorage.setItem('em-theme-preference', pref);
  }

  toggle(): void {
    const current = this.resolvedTheme();
    this.setPreference(current === 'light' ? 'dark' : 'light');
  }

  private getStoredPreference(): ThemePreference {
    const stored = localStorage.getItem('em-theme-preference');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    // Migrate old 'em-theme' key
    const oldTheme = localStorage.getItem('em-theme');
    if (oldTheme === 'light' || oldTheme === 'dark') {
      localStorage.removeItem('em-theme');
      return oldTheme;
    }
    return 'system'; // Default to system preference
  }

  private detectSystemTheme(): Theme {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
}
