import { Injectable, signal } from '@angular/core';
import { generateId } from '../utils/generate-id';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'progress';
  message: string;
  detail?: string;
  leaving?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  /** Show a toast. Returns the ID so you can update/dismiss it later. */
  show(type: Toast['type'], message: string, detail?: string, autoCloseMs?: number): string {
    const id = generateId();
    const toast: Toast = { id, type, message, detail };
    this._toasts.update((t) => [...t, toast]);

    if (autoCloseMs) {
      setTimeout(() => this.dismiss(id), autoCloseMs);
    }

    return id;
  }

  /** Update an existing toast's message/detail/type */
  update(id: string, updates: Partial<Pick<Toast, 'type' | 'message' | 'detail'>>): void {
    this._toasts.update((toasts) =>
      toasts.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }

  /** Dismiss a toast with a fade-out animation */
  dismiss(id: string): void {
    // Mark as leaving for CSS transition
    this._toasts.update((toasts) =>
      toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    // Remove after animation
    setTimeout(() => {
      this._toasts.update((toasts) => toasts.filter((t) => t.id !== id));
    }, 250);
  }

  // Convenience methods
  success(message: string, detail?: string): string {
    return this.show('success', message, detail, 5000);
  }

  error(message: string, detail?: string): string {
    return this.show('error', message, detail, 8000);
  }

  info(message: string, detail?: string): string {
    return this.show('info', message, detail, 4000);
  }

  /** Show a progress toast — does NOT auto-close. Call update() or dismiss() when done. */
  progress(message: string, detail?: string): string {
    return this.show('progress', message, detail);
  }
}
