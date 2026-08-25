import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DepthSelectorComponent } from '../depth-selector/depth-selector.component';
import { IconComponent } from '../../atoms/icon/icon.component';

@Component({
  selector: 'em-view-controls',
  standalone: true,
  imports: [CommonModule, DepthSelectorComponent, IconComponent],
  template: `
    <div class="view-controls">
      <em-depth-selector
        [depth]="depth"
        (depthChange)="depthChange.emit($event)"
      />

      <div class="view-controls__separator"></div>

      <button
        class="view-controls__btn"
        [class.view-controls__btn--active]="showSystemProps"
        (click)="showSystemPropsChange.emit(!showSystemProps)"
        title="Show system properties (⌘.)"
      >
        <em-icon [name]="showSystemProps ? 'eye' : 'eye-off'" [size]="14" />
      </button>

      <button
        class="view-controls__btn"
        (click)="layoutDirectionChange.emit(layoutDirection === 'LR' ? 'TB' : 'LR')"
        [title]="'Layout: ' + (layoutDirection === 'LR' ? 'Horizontal' : 'Vertical')"
      >
        <em-icon [name]="layoutDirection === 'LR' ? 'layout-horizontal' : 'layout-vertical'" [size]="14" />
      </button>

      <!-- Fit to screen moved to main toolbar -->
    </div>
  `,
  styles: [`
    :host {
      position: absolute;
      top: 12px;
      right: 16px;
      z-index: 10;
      pointer-events: none;
    }

    .view-controls {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--em-color-bg-primary);
      border: 1px solid var(--em-color-border);
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      pointer-events: auto;
    }

    .view-controls__separator {
      width: 1px;
      height: 16px;
      background: var(--em-color-border);
      flex-shrink: 0;
    }

    .view-controls__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: var(--em-color-text-secondary);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.12s;

      &:hover {
        background: var(--em-color-bg-hover);
        color: var(--em-color-text-primary);
      }
    }

    .view-controls__btn--active {
      color: var(--em-color-accent);
      background: var(--em-color-accent-subtle);
    }
  `],
})
export class ViewControlsComponent {
  @Input() depth = 1;
  @Input() showSystemProps = false;
  @Input() layoutDirection: 'LR' | 'TB' = 'LR';

  @Output() depthChange = new EventEmitter<number>();
  @Output() showSystemPropsChange = new EventEmitter<boolean>();
  @Output() layoutDirectionChange = new EventEmitter<'LR' | 'TB'>();
}
