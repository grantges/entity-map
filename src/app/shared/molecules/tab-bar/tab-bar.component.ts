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
    @if (tabs.length > 0) {
      <div class="tab-bar">
        <div class="tab-bar__scroll">
          @for (tab of tabs; track tab.entityName) {
            <div class="tab" [class.tab--active]="tab.active"
              (click)="tabClicked.emit(tab.entityName)">
              <span class="tab__name">{{ tab.entityName }}</span>
              <button class="tab__close" (click)="closeTab($event, tab.entityName)"
                title="Close tab">
                <em-icon name="x" [size]="12" />
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .tab-bar {
      display: flex;
      align-items: flex-end;
      background: var(--em-color-bg-secondary);
      border-bottom: 1px solid var(--em-color-border);
      height: 38px;
      flex-shrink: 0;
      overflow: hidden;
      padding-left: 12px;
    }
    .tab-bar__scroll {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
      padding-top: 6px;
      &::-webkit-scrollbar { display: none; }
    }
    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 8px 8px 0 0;
      cursor: pointer;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 500;
      color: var(--em-color-text-muted);
      background: transparent;
      transition: all 0.12s;
      position: relative;
      min-width: 0;
      border: 1px solid transparent;
      border-bottom: none;

      &:hover {
        color: var(--em-color-text-secondary);
        background: var(--em-color-bg-hover);
      }
    }
    .tab--active {
      color: var(--em-color-text-primary);
      background: var(--em-color-bg-primary);
      border-color: var(--em-color-border);
      margin-bottom: -1px;
      padding-bottom: 7px;

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 4px;
        right: 4px;
        height: 2px;
        background: var(--em-color-accent);
        border-radius: 0 0 2px 2px;
      }

      &:hover {
        background: var(--em-color-bg-primary);
      }
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

      .tab:hover &,
      .tab--active & {
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
