import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component';
import { BadgeComponent } from '../../atoms/badge/badge.component';
import {
  ODataProperty,
  getEdmTypeShort,
  getEdmTypeColor,
} from '../../../core/models/entity.model';

@Component({
  selector: 'em-property-row',
  standalone: true,
  imports: [CommonModule, IconComponent, BadgeComponent],
  template: `
    <div
      class="property-row"
      [class.property-row--key]="property.isKey"
      [class.property-row--custom]="property.isCustom"
    >
      <span class="property-row__indicators">
        @if (property.isKey) {
          <em-icon name="key" [size]="12" />
        }
        @if (!property.nullable) {
          <span class="property-row__required">*</span>
        }
      </span>
      <span class="property-row__name" [attr.title]="property.name">
        {{ property.name }}
      </span>
      <em-badge
        [text]="getTypeShort(property.type)"
        [variant]="getTypeColor(property.type)"
      />
    </div>
  `,
  styles: [
    `
      .property-row {
        display: flex;
        align-items: center;
        gap: var(--em-space-1);
        height: var(--em-node-row-height);
        padding: 0 var(--em-space-3);
        font-size: var(--em-font-size-xs);
        transition: background var(--em-transition-fast);

        &:hover {
          background: var(--em-color-bg-hover);
        }
      }

      .property-row--key {
        .property-row__name {
          font-weight: var(--em-font-weight-semibold);
        }
      }

      .property-row--custom {
        border-left: 2px solid var(--em-color-custom);
      }

      .property-row__indicators {
        display: flex;
        align-items: center;
        gap: 2px;
        width: 20px;
        flex-shrink: 0;
        color: var(--em-color-text-muted);
      }

      .property-row__required {
        color: var(--em-color-error);
        font-weight: var(--em-font-weight-bold);
        font-size: 14px;
        line-height: 1;
      }

      .property-row__name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--em-color-text-primary);
        font-family: var(--em-font-mono);
        font-size: var(--em-font-size-xs);
      }
    `,
  ],
})
export class PropertyRowComponent {
  @Input({ required: true }) property!: ODataProperty;

  getTypeShort(type: string): string {
    return getEdmTypeShort(type);
  }

  getTypeColor(type: string): string {
    return getEdmTypeColor(type);
  }
}
