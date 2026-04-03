import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchDropdownComponent } from '../../molecules/search-dropdown/search-dropdown.component';
import { DepthSelectorComponent } from '../../molecules/depth-selector/depth-selector.component';
import { IconComponent } from '../../atoms/icon/icon.component';
import { BadgeComponent } from '../../atoms/badge/badge.component';
import { EntityIndex } from '../../../core/models/entity.model';

@Component({
  selector: 'em-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    SearchDropdownComponent,
    DepthSelectorComponent,
    IconComponent,
    BadgeComponent,
  ],
  template: `
    <div class="toolbar">
      <div class="toolbar__left">
        <div class="toolbar__brand">
          <em-icon name="database" [size]="20" />
          <span class="toolbar__title">Entity Map</span>
          @if (entityCount > 0) {
            <em-badge [text]="entityCount + ' entities'" variant="count" />
          }
        </div>

        <div class="toolbar__separator"></div>

        <em-search-dropdown
          #searchDropdown
          [items]="entityIndex"
          [selectedEntity]="selectedEntity"
          placeholder="Search entities... (⌘K)"
          (entitySelected)="entitySelected.emit($event)"
        />
      </div>

      <div class="toolbar__center">
        @if (selectedEntity) {
          <em-depth-selector
            [depth]="depth"
            (depthChange)="depthChange.emit($event)"
          />

          <div class="toolbar__separator"></div>

          <button
            class="toolbar__icon-btn"
            [class.toolbar__icon-btn--active]="showSystemProps"
            (click)="showSystemPropsChange.emit(!showSystemProps)"
            title="Show system properties (⌘.)"
          >
            <em-icon [name]="showSystemProps ? 'eye' : 'eye-off'" [size]="16" />
          </button>

          <button
            class="toolbar__icon-btn"
            (click)="layoutDirectionChange.emit(layoutDirection === 'LR' ? 'TB' : 'LR')"
            [title]="'Layout: ' + (layoutDirection === 'LR' ? 'Horizontal' : 'Vertical')"
          >
            <em-icon [name]="layoutDirection === 'LR' ? 'layout-horizontal' : 'layout-vertical'" [size]="16" />
          </button>

          <button
            class="toolbar__icon-btn"
            (click)="fitToScreen.emit()"
            title="Fit to screen (⌘F)"
          >
            <em-icon name="maximize" [size]="16" />
          </button>
        }
      </div>

      <div class="toolbar__right">
        @if (selectedEntity) {
          <button
            class="toolbar__icon-btn"
            (click)="openSidebar.emit()"
            title="Entity details (⌘\\)"
          >
            <em-icon name="sidebar" [size]="16" />
          </button>

          <button
            class="toolbar__icon-btn"
            (click)="openExport.emit()"
            title="Export (⌘E)"
          >
            <em-icon name="download" [size]="16" />
          </button>

          <div class="toolbar__separator"></div>
        }

        <button class="toolbar__icon-btn" (click)="openSettings.emit()" title="Settings (⌘,)">
          <em-icon name="settings" [size]="16" />
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 52px;
        padding: 0 var(--em-space-4);
        background: var(--em-color-bg-primary);
        border-bottom: 1px solid var(--em-color-border);
        gap: var(--em-space-4);
        z-index: 10;
        flex-shrink: 0;
      }

      .toolbar__left,
      .toolbar__center,
      .toolbar__right {
        display: flex;
        align-items: center;
        gap: var(--em-space-3);
      }

      .toolbar__left {
        flex: 1;
        min-width: 0;
      }

      .toolbar__center {
        flex-shrink: 0;
      }

      .toolbar__right {
        flex-shrink: 0;
      }

      .toolbar__brand {
        display: flex;
        align-items: center;
        gap: var(--em-space-2);
        color: var(--em-color-text-primary);
        flex-shrink: 0;
      }

      .toolbar__title {
        font-weight: var(--em-font-weight-bold);
        font-size: var(--em-font-size-lg);
        letter-spacing: var(--em-letter-spacing-tight);
      }

      .toolbar__separator {
        width: 1px;
        height: 24px;
        background: var(--em-color-border);
        flex-shrink: 0;
      }

      .toolbar__icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border: none;
        background: transparent;
        color: var(--em-color-text-secondary);
        border-radius: var(--em-radius-md);
        cursor: pointer;
        transition: all var(--em-transition-fast);

        &:hover {
          background: var(--em-color-bg-hover);
          color: var(--em-color-text-primary);
        }

        &--active {
          color: var(--em-color-accent);
          background: var(--em-color-accent-subtle);
        }
      }
    `,
  ],
})
export class ToolbarComponent {
  @Input() entityIndex: EntityIndex[] = [];
  @Input() entityCount = 0;
  @Input() selectedEntity: string | null = null;
  @Input() depth = 1;
  @Input() showSystemProps = false;
  @Input() layoutDirection: 'LR' | 'TB' = 'LR';

  @Output() entitySelected = new EventEmitter<string>();
  @Output() depthChange = new EventEmitter<number>();
  @Output() showSystemPropsChange = new EventEmitter<boolean>();
  @Output() layoutDirectionChange = new EventEmitter<'LR' | 'TB'>();
  @Output() fitToScreen = new EventEmitter<void>();
  @Output() openSidebar = new EventEmitter<void>();
  @Output() openExport = new EventEmitter<void>();
  @Output() openSettings = new EventEmitter<void>();

  @ViewChild('searchDropdown') searchDropdown!: SearchDropdownComponent;

  focusSearch(): void {
    this.searchDropdown?.focus();
  }
}
