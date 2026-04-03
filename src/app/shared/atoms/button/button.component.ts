import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'em-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [class]="'btn btn--' + variant + ' btn--' + size"
      [disabled]="disabled"
      [attr.title]="tooltip"
      [type]="type"
    >
      <ng-content />
    </button>
  `,
  styles: [
    `
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--em-space-2);
        border: 1px solid transparent;
        border-radius: var(--em-radius-md);
        font-weight: var(--em-font-weight-medium);
        transition: all var(--em-transition-fast);
        cursor: pointer;
        white-space: nowrap;

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .btn--sm {
        height: 28px;
        padding: 0 var(--em-space-2);
        font-size: var(--em-font-size-xs);
      }

      .btn--md {
        height: 34px;
        padding: 0 var(--em-space-3);
        font-size: var(--em-font-size-sm);
      }

      .btn--lg {
        height: 40px;
        padding: 0 var(--em-space-4);
        font-size: var(--em-font-size-base);
      }

      .btn--primary {
        background: var(--em-color-accent);
        color: white;
        &:hover:not(:disabled) {
          background: var(--em-color-accent-hover);
        }
      }

      .btn--secondary {
        background: var(--em-color-bg-secondary);
        color: var(--em-color-text-primary);
        border-color: var(--em-color-border);
        &:hover:not(:disabled) {
          background: var(--em-color-bg-hover);
          border-color: var(--em-color-border-strong);
        }
      }

      .btn--ghost {
        background: transparent;
        color: var(--em-color-text-secondary);
        &:hover:not(:disabled) {
          background: var(--em-color-bg-hover);
          color: var(--em-color-text-primary);
        }
      }

      .btn--icon {
        background: transparent;
        color: var(--em-color-text-secondary);
        padding: 0;
        width: 34px;
        &:hover:not(:disabled) {
          background: var(--em-color-bg-hover);
          color: var(--em-color-text-primary);
        }
      }

      .btn--icon.btn--sm { width: 28px; }
      .btn--icon.btn--lg { width: 40px; }

      .btn--danger {
        background: transparent;
        color: var(--em-color-error);
        &:hover:not(:disabled) {
          background: rgba(220, 38, 38, 0.1);
        }
      }
    `,
  ],
})
export class ButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger' =
    'secondary';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() disabled = false;
  @Input() tooltip = '';
  @Input() type: 'button' | 'submit' = 'button';
}
