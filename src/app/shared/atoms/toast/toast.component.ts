import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';
import { ToastService, Toast } from '../../../core/services/toast.service';

@Component({
  selector: 'em-toast-container',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="'toast--' + toast.type"
          [class.toast--leaving]="toast.leaving">
          <div class="toast__icon">
            @switch (toast.type) {
              @case ('success') { <em-icon name="eye" [size]="16" /> }
              @case ('error') { <em-icon name="x" [size]="16" /> }
              @case ('progress') {
                <div class="toast__spinner"></div>
              }
              @default { <em-icon name="database" [size]="16" /> }
            }
          </div>
          <div class="toast__content">
            <span class="toast__message">{{ toast.message }}</span>
            @if (toast.detail) {
              <span class="toast__detail">{{ toast.detail }}</span>
            }
          </div>
          @if (toast.type !== 'progress') {
            <button class="toast__close" (click)="toastService.dismiss(toast.id)">
              <em-icon name="x" [size]="12" />
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed; bottom: 20px; right: 20px; z-index: 100;
      display: flex; flex-direction: column-reverse; gap: 8px;
      max-width: 400px;
    }
    .toast {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 16px; border-radius: 8px;
      background: var(--em-color-bg-primary); border: 1px solid var(--em-color-border);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      animation: slideIn 0.25s ease-out;
      transition: opacity 0.2s, transform 0.2s;
    }
    .toast--leaving { opacity: 0; transform: translateX(20px); }
    .toast--success { border-left: 3px solid #059669; }
    .toast--error { border-left: 3px solid #DC2626; }
    .toast--progress { border-left: 3px solid #4F46E5; }
    .toast--info { border-left: 3px solid #2563EB; }

    .toast__icon {
      flex-shrink: 0; margin-top: 1px;
    }
    .toast--success .toast__icon { color: #059669; }
    .toast--error .toast__icon { color: #DC2626; }
    .toast--progress .toast__icon { color: #4F46E5; }
    .toast--info .toast__icon { color: #2563EB; }

    .toast__content { flex: 1; min-width: 0; }
    .toast__message {
      display: block; font-size: 13px; font-weight: 500;
      color: var(--em-color-text-primary); line-height: 1.4;
    }
    .toast__detail {
      display: block; font-size: 12px; color: var(--em-color-text-muted);
      margin-top: 2px; line-height: 1.4;
    }
    .toast__close {
      flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border: none; background: transparent;
      color: var(--em-color-text-muted); cursor: pointer; border-radius: 4px;
      &:hover { background: var(--em-color-bg-hover); }
    }
    .toast__spinner {
      width: 16px; height: 16px;
      border: 2px solid var(--em-color-border);
      border-top-color: #4F46E5;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);
}
