import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component';

export interface EntityTab {
  entityName: string;
  active: boolean;
}

@Component({
  selector: 'em-tab-bar',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="tab-bar">
      <div class="tab-bar__scroll">
        @for (tab of tabs; track tab.entityName; let i = $index) {
          <!-- Separator between inactive tabs (not before first, not adjacent to active) -->
          @if (i > 0 && !tab.active && !tabs[i - 1].active) {
            <span class="tab-bar__separator">|</span>
          }
          <div
            class="tab"
            [class.tab--active]="tab.active"
            (click)="tabClicked.emit(tab.entityName)"
          >
            <em-icon name="database" [size]="12" />
            <span class="tab__name">{{ tab.entityName }}</span>
            <button
              class="tab__close"
              (click)="closeTab($event, tab.entityName)"
              title="Close tab (⌘W)"
            >
              <em-icon name="x" [size]="12" />
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .tab-bar {
      display: flex;
      align-items: flex-end;
      background: var(--em-color-bg-secondary);
      height: 38px;
      flex-shrink: 0;
      overflow: hidden;
      padding-left: 16px;
      border-bottom: 1px solid var(--em-color-border);
    }
    .tab-bar__scroll {
      display: flex;
      align-items: flex-end;
      gap: 0;
      overflow-x: auto;
      scrollbar-width: none;
      height: 100%;
      &::-webkit-scrollbar { display: none; }
    }

    .tab-bar__separator {
      display: flex;
      align-items: center;
      height: calc(100% - 8px);
      margin-top: 4px;
      color: var(--em-color-border);
      font-size: 11px;
      user-select: none;
      pointer-events: none;
    }

    /* Inactive tab — plain text style */
    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      height: calc(100% - 8px);
      margin-top: 4px;
      border-radius: 999px;
      cursor: pointer;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 500;
      color: var(--em-color-text-muted);
      background: transparent;
      border: none;
      transition: all 0.12s;
      position: relative;
      min-width: 0;
    }

    /* Hover state (inactive only) — pill highlight */
    .tab:not(.tab--active):hover {
      color: var(--em-color-text-primary);
      background: var(--em-color-bg-hover);
    }

    /* Active tab — raised shape that merges with content below */
    .tab--active {
      color: var(--em-color-text-primary);
      background: var(--em-color-bg-canvas);
      border-radius: 8px 8px 0 0;
      border: 1px solid var(--em-color-border);
      border-bottom: 1px solid var(--em-color-bg-canvas);
      margin-bottom: -1px;
      height: calc(100% - 2px);
      margin-top: 2px;
      font-weight: 600;
      padding: 0 14px;
    }

    .tab__name {
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
    }
    .tab__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border: none;
      background: transparent;
      color: var(--em-color-text-muted);
      border-radius: 4px;
      cursor: pointer;
      opacity: 0;
      transition: all 0.12s;
      flex-shrink: 0;

      /* Active tab: always visible at reduced opacity */
      .tab--active & {
        opacity: 0.5;
      }

      /* Inactive tab: visible on hover */
      .tab:hover & {
        opacity: 0.6;
      }

      &:hover {
        opacity: 1 !important;
        background: var(--em-color-bg-hover);
        color: var(--em-color-text-primary);
      }
    }
  `],
})
export class TabBarComponent {
  @Input() tabs: EntityTab[] = [];
  @Output() tabClicked = new EventEmitter<string>();
  @Output() tabClosed = new EventEmitter<string>();

  closeTab(event: Event, entityName: string): void {
    event.stopPropagation();
    this.tabClosed.emit(entityName);
  }
}
