import { Component, Input } from '@angular/core';

export type BadgeVariant =
  | 'guid' | 'string' | 'datetime' | 'int' | 'bool'
  | 'decimal' | 'stream' | 'binary' | 'custom' | 'count'
  | 'fk' | 'collection';

@Component({
  selector: 'em-badge',
  standalone: true,
  template: `<span class="badge" [attr.data-variant]="variant">{{ text }}</span>`,
  styles: [
    `
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        border-radius: var(--em-radius-sm);
        font-size: var(--em-font-size-xs);
        font-weight: var(--em-font-weight-medium);
        font-family: var(--em-font-mono);
        line-height: var(--em-line-height-tight);
        white-space: nowrap;
      }

      .badge[data-variant='guid'] {
        color: var(--em-color-type-guid);
        background: var(--em-color-type-guid-bg);
      }
      .badge[data-variant='string'] {
        color: var(--em-color-type-string);
        background: var(--em-color-type-string-bg);
      }
      .badge[data-variant='datetime'] {
        color: var(--em-color-type-datetime);
        background: var(--em-color-type-datetime-bg);
      }
      .badge[data-variant='int'] {
        color: var(--em-color-type-int);
        background: var(--em-color-type-int-bg);
      }
      .badge[data-variant='bool'] {
        color: var(--em-color-type-bool);
        background: var(--em-color-type-bool-bg);
      }
      .badge[data-variant='decimal'] {
        color: var(--em-color-type-decimal);
        background: var(--em-color-type-decimal-bg);
      }
      .badge[data-variant='stream'] {
        color: var(--em-color-type-stream);
        background: var(--em-color-type-stream-bg);
      }
      .badge[data-variant='binary'] {
        color: var(--em-color-type-binary);
        background: var(--em-color-type-binary-bg);
      }
      .badge[data-variant='custom'] {
        color: var(--em-color-custom);
        background: rgba(124, 58, 237, 0.1);
      }
      .badge[data-variant='count'] {
        color: var(--em-color-text-secondary);
        background: var(--em-color-bg-secondary);
      }
      .badge[data-variant='fk'] {
        color: var(--em-color-fk);
        background: rgba(99, 102, 241, 0.1);
      }
      .badge[data-variant='collection'] {
        color: var(--em-color-collection);
        background: rgba(245, 158, 11, 0.1);
      }
    `,
  ],
})
export class BadgeComponent {
  @Input({ required: true }) text!: string;
  @Input() variant: BadgeVariant = 'count';
}
