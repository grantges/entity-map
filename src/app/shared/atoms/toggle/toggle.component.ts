import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'em-toggle',
  standalone: true,
  template: `
    <button
      class="toggle"
      [class.toggle--active]="active"
      (click)="toggled.emit(!active)"
      [attr.title]="tooltip"
      role="switch"
      [attr.aria-checked]="active"
    >
      <span class="toggle__track">
        <span class="toggle__thumb"></span>
      </span>
      @if (label) {
        <span class="toggle__label">{{ label }}</span>
      }
    </button>
  `,
  styles: [
    `
      .toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--em-space-2);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
      }

      .toggle__track {
        position: relative;
        width: 36px;
        height: 20px;
        background: var(--em-color-border-strong);
        border-radius: var(--em-radius-full);
        transition: background var(--em-transition-fast);
      }

      .toggle--active .toggle__track {
        background: var(--em-color-accent);
      }

      .toggle__thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        background: white;
        border-radius: 50%;
        transition: transform var(--em-transition-fast);
      }

      .toggle--active .toggle__thumb {
        transform: translateX(16px);
      }

      .toggle__label {
        font-size: var(--em-font-size-sm);
        color: var(--em-color-text-secondary);
      }
    `,
  ],
})
export class ToggleComponent {
  @Input() active = false;
  @Input() label = '';
  @Input() tooltip = '';
  @Output() toggled = new EventEmitter<boolean>();
}
