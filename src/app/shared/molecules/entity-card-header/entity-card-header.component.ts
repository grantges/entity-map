import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component';
import { BadgeComponent } from '../../atoms/badge/badge.component';

@Component({
  selector: 'em-entity-card-header',
  standalone: true,
  imports: [CommonModule, IconComponent, BadgeComponent],
  template: `
    <div class="card-header" [class.card-header--root]="isRoot" [class.card-header--custom]="isCustom">
      <div class="card-header__title">
        <em-icon name="database" [size]="14" />
        <span class="card-header__name" [attr.title]="name">{{ name }}</span>
        @if (isCustom) {
          <em-badge text="new" variant="custom" />
        }
      </div>
      <div class="card-header__meta">
        <em-badge [text]="propertyCount + ' cols'" variant="count" />
        <em-badge [text]="navCount + ' rels'" variant="count" />
      </div>
    </div>
  `,
  styles: [
    `
      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--em-space-2) var(--em-space-3);
        min-height: var(--em-node-header-height);
        background: var(--em-color-bg-node-header);
        border-bottom: 1px solid var(--em-color-border-node);
        border-radius: var(--em-node-border-radius) var(--em-node-border-radius) 0 0;
        cursor: grab;
      }

      .card-header--root {
        background: var(--em-color-bg-node-root);
      }

      .card-header--custom {
        border-left: 3px solid var(--em-color-custom);
      }

      .card-header__title {
        display: flex;
        align-items: center;
        gap: var(--em-space-2);
        flex: 1;
        min-width: 0;
        color: var(--em-color-text-primary);
      }

      .card-header__name {
        font-weight: var(--em-font-weight-semibold);
        font-size: var(--em-font-size-sm);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .card-header__meta {
        display: flex;
        gap: var(--em-space-1);
        flex-shrink: 0;
        margin-left: var(--em-space-2);
      }
    `,
  ],
})
export class EntityCardHeaderComponent {
  @Input({ required: true }) name!: string;
  @Input() propertyCount = 0;
  @Input() navCount = 0;
  @Input() isRoot = false;
  @Input() isCustom = false;
}
