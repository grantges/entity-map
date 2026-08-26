import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  input,
  ElementRef,
  HostListener,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component';
import { BadgeComponent } from '../../atoms/badge/badge.component';
import { EntityIndex } from '../../../core/models/entity.model';

@Component({
  selector: 'em-search-dropdown',
  standalone: true,
  imports: [CommonModule, IconComponent, BadgeComponent],
  template: `
    <div class="search-dropdown" [class.search-dropdown--open]="isOpen()">
      <div class="search-dropdown__input" (click)="open(); searchInput.focus()">
        <em-icon name="search" [size]="14" />
        <input
          #searchInput
          type="text"
          [placeholder]="placeholder"
          [value]="query()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
          (focus)="open()"
        />
        @if (selectedEntity) {
          <button class="search-dropdown__clear" (click)="clear($event)">
            <em-icon name="x" [size]="14" />
          </button>
        }
      </div>

      @if (isOpen() && filteredItems().length > 0) {
        <div class="search-dropdown__list" #list (scroll)="onScroll(list)">
          @for (item of filteredItems(); track item.name; let i = $index) {
            <button
              class="search-dropdown__item"
              [class.search-dropdown__item--active]="i === activeIndex()"
              (click)="selectItem(item)"
              (mouseenter)="activeIndex.set(i)"
            >
              <span class="search-dropdown__item-name">{{ item.name }}</span>
              <span class="search-dropdown__item-meta">
                <em-badge [text]="item.propertyCount + ' cols'" variant="count" />
                <em-badge [text]="item.navPropertyCount + ' rels'" variant="count" />
              </span>
            </button>
          }

          @if (hasMore()) {
            <div class="search-dropdown__more">
              Showing {{ filteredItems().length }} of {{ matchCount() }} &mdash; scroll for more
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .search-dropdown {
        position: relative;
        width: 320px;
      }

      .search-dropdown__input {
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
        cursor: text;

        &:hover {
          border-color: var(--em-color-border-strong);
        }
      }

      .search-dropdown--open .search-dropdown__input {
        border-color: var(--em-color-border-focus);
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
      }

      .search-dropdown__input input {
        flex: 1;
        border: none;
        outline: none;
        background: transparent;
        color: var(--em-color-text-primary);
        font-size: var(--em-font-size-sm);
        height: 100%;
        width: 100%;
        min-width: 0;
        padding: 0;
        margin: 0;

        &::placeholder {
          color: var(--em-color-text-muted);
        }
      }

      .search-dropdown__clear {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: var(--em-color-text-muted);
        cursor: pointer;
        padding: 2px;
        border-radius: var(--em-radius-sm);

        &:hover {
          color: var(--em-color-text-primary);
          background: var(--em-color-bg-hover);
        }
      }

      .search-dropdown__more {
        padding: var(--em-space-2) var(--em-space-3);
        text-align: center;
        font-size: var(--em-font-size-xs);
        color: var(--em-color-text-muted);
        border-top: 1px solid var(--em-color-border);
      }

      .search-dropdown__list {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        max-height: 360px;
        overflow-y: auto;
        background: var(--em-color-bg-primary);
        border: 1px solid var(--em-color-border);
        border-radius: var(--em-radius-md);
        box-shadow: var(--em-shadow-dropdown);
        z-index: 100;
        padding: var(--em-space-1);
      }

      .search-dropdown__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--em-space-2) var(--em-space-3);
        border: none;
        background: transparent;
        color: var(--em-color-text-primary);
        font-size: var(--em-font-size-sm);
        text-align: left;
        cursor: pointer;
        border-radius: var(--em-radius-sm);
        transition: background var(--em-transition-fast);

        &:hover,
        &--active {
          background: var(--em-color-bg-hover);
        }
      }

      .search-dropdown__item-name {
        font-weight: var(--em-font-weight-medium);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }

      .search-dropdown__item-meta {
        display: flex;
        gap: var(--em-space-1);
        flex-shrink: 0;
        margin-left: var(--em-space-2);
      }
    `,
  ],
})
export class SearchDropdownComponent {
  /**
   * Signal input so the result list recomputes when the schema changes.
   * A plain @Input is not tracked by computed(), so results went stale after
   * a schema pull until the query happened to change.
   */
  readonly items = input<EntityIndex[]>([]);
  @Input() selectedEntity: string | null = null;
  @Input() placeholder = 'Search entities...';
  @Output() entitySelected = new EventEmitter<string>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('list') listEl?: ElementRef<HTMLElement>;

  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly activeIndex = signal(0);

  /** Rows revealed per page. Rendering 1500+ buttons at once is what this avoids. */
  private static readonly PAGE_SIZE = 50;
  /** Load the next page once the viewport is within this many px of the end. */
  private static readonly SCROLL_THRESHOLD_PX = 80;

  readonly visibleCount = signal(SearchDropdownComponent.PAGE_SIZE);
  /** Guards against several scroll events paging in before Angular re-renders. */
  private loadScheduled = false;

  /** Every match, uncapped. Only ever sliced for rendering. */
  private readonly matchedItems = computed(() => {
    const q = this.query().toLowerCase();
    const all = this.items();
    if (!q) return all;
    return all.filter((item) => item.name.toLowerCase().includes(q));
  });

  readonly matchCount = computed(() => this.matchedItems().length);
  readonly filteredItems = computed(() =>
    this.matchedItems().slice(0, this.visibleCount())
  );
  readonly hasMore = computed(() => this.matchCount() > this.visibleCount());

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('em-search-dropdown')) {
      this.isOpen.set(false);
    }
  }

  open(): void {
    this.isOpen.set(true);
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.activeIndex.set(0);
    // A new query is a new result set: start from the first page again.
    this.resetPaging();
    this.isOpen.set(true);
  }

  /** Reveal the next page as the list nears its end. */
  onScroll(list: HTMLElement): void {
    if (!this.hasMore() || this.loadScheduled) return;
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining <= SearchDropdownComponent.SCROLL_THRESHOLD_PX) {
      this.loadMore();
    }
  }

  private loadMore(): void {
    // Scrolling emits many events per gesture and the list only grows on the
    // next render, so without this guard one flick pages in several batches.
    this.loadScheduled = true;
    requestAnimationFrame(() => { this.loadScheduled = false; });

    this.visibleCount.update((n) =>
      Math.min(n + SearchDropdownComponent.PAGE_SIZE, this.matchCount())
    );
  }

  /**
   * Back to the first page, scrolled to the top.
   *
   * Resetting the count alone is not enough: the list shrinks under a viewport
   * that is still near the bottom, which fires a scroll event and pages the
   * rows straight back in. Returning to the top first stops that.
   */
  private resetPaging(): void {
    this.loadScheduled = true;
    requestAnimationFrame(() => { this.loadScheduled = false; });

    const el = this.listEl?.nativeElement;
    if (el) el.scrollTop = 0;
    this.visibleCount.set(SearchDropdownComponent.PAGE_SIZE);
  }

  onKeydown(event: KeyboardEvent): void {
    const items = this.filteredItems();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        // Arrowing past the last rendered row pages in the next batch, so
        // keyboard users are not capped at the first page.
        if (this.activeIndex() >= items.length - 1 && this.hasMore()) {
          this.loadMore();
        }
        this.activeIndex.update((i) => Math.min(i + 1, this.filteredItems().length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        const item = items[this.activeIndex()];
        if (item) this.selectItem(item);
        break;
      case 'Escape':
        this.isOpen.set(false);
        break;
    }
  }

  selectItem(item: EntityIndex): void {
    this.entitySelected.emit(item.name);
    this.query.set(item.name);
    this.resetPaging();
    this.isOpen.set(false);
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.query.set('');
    this.resetPaging();
    this.entitySelected.emit('');
    this.searchInput?.nativeElement?.focus();
  }

  focus(): void {
    this.searchInput?.nativeElement?.focus();
  }
}
