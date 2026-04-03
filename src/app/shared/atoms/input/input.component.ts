import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'em-input',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="input-wrapper" [class.input-wrapper--focused]="focused">
      <ng-content select="[prefix]" />
      <input
        [type]="type"
        [placeholder]="placeholder"
        [value]="value"
        [disabled]="isDisabled"
        (input)="onInput($event)"
        (focus)="focused = true"
        (blur)="focused = false; onTouched()"
        (keydown)="keydown.emit($event)"
      />
      <ng-content select="[suffix]" />
    </div>
  `,
  styles: [
    `
      .input-wrapper {
        display: flex;
        align-items: center;
        gap: var(--em-space-2);
        height: 34px;
        padding: 0 var(--em-space-3);
        background: var(--em-color-bg-input);
        border: 1px solid var(--em-color-border-input);
        border-radius: var(--em-radius-md);
        transition: all var(--em-transition-fast);
        color: var(--em-color-text-secondary);

        &:hover {
          border-color: var(--em-color-border-strong);
        }

        &--focused {
          border-color: var(--em-color-border-focus);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
      }

      input {
        flex: 1;
        border: none;
        outline: none;
        background: transparent;
        color: var(--em-color-text-primary);
        font-size: var(--em-font-size-sm);

        &::placeholder {
          color: var(--em-color-text-muted);
        }

        &:disabled {
          opacity: 0.5;
        }
      }
    `,
  ],
})
export class InputComponent implements ControlValueAccessor {
  @Input() type = 'text';
  @Input() placeholder = '';
  @Output() keydown = new EventEmitter<KeyboardEvent>();

  value = '';
  focused = false;
  isDisabled = false;

  onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.onChange(this.value);
  }

  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }
}
