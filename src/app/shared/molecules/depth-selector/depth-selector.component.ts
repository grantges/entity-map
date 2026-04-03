import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'em-depth-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="depth-selector">
      <span class="depth-selector__label">Depth</span>
      <div class="depth-selector__buttons">
        @for (d of depths; track d) {
          <button
            class="depth-selector__btn"
            [class.depth-selector__btn--active]="d === depth"
            (click)="depthChange.emit(d)"
          >
            {{ d }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .depth-selector {
        display: flex;
        align-items: center;
        gap: var(--em-space-2);
      }

      .depth-selector__label {
        font-size: var(--em-font-size-xs);
        color: var(--em-color-text-muted);
        font-weight: var(--em-font-weight-medium);
        text-transform: uppercase;
        letter-spacing: var(--em-letter-spacing-wide);
      }

      .depth-selector__buttons {
        display: flex;
        background: var(--em-color-bg-secondary);
        border-radius: var(--em-radius-md);
        border: 1px solid var(--em-color-border);
        overflow: hidden;
      }

      .depth-selector__btn {
        width: 30px;
        height: 28px;
        border: none;
        background: transparent;
        color: var(--em-color-text-secondary);
        font-size: var(--em-font-size-sm);
        font-weight: var(--em-font-weight-medium);
        cursor: pointer;
        transition: all var(--em-transition-fast);

        &:hover {
          background: var(--em-color-bg-hover);
        }

        &--active {
          background: var(--em-color-accent);
          color: white;

          &:hover {
            background: var(--em-color-accent-hover);
          }
        }

        & + & {
          border-left: 1px solid var(--em-color-border);
        }
      }
    `,
  ],
})
export class DepthSelectorComponent {
  @Input() depth = 1;
  @Output() depthChange = new EventEmitter<number>();

  depths = [1, 2, 3];
}
