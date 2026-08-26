import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchDropdownComponent } from './search-dropdown.component';
import { EntityIndex } from '../../../core/models/entity.model';
import { anEntityIndex } from '../../../../testing';

function indexOf(...names: string[]): EntityIndex[] {
  return names.map((name) => anEntityIndex({ name }));
}

describe('SearchDropdownComponent', () => {
  let fixture: ComponentFixture<SearchDropdownComponent>;
  let component: SearchDropdownComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchDropdownComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchDropdownComponent);
    component = fixture.componentInstance;
  });

  function setItems(items: EntityIndex[]): void {
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
  }

  function renderedNames(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.search-dropdown__item-name')
    ).map((el) => (el as HTMLElement).textContent!.trim());
  }

  function typeQuery(value: string): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('renders nothing until it is opened', () => {
    setItems(indexOf('Account', 'Contact'));

    // A component that failed to render at all would also produce an empty
    // list here, so pin down that the search input itself did render and
    // that the container is merely not in its "open" state.
    const inputEl: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(inputEl).withContext('search input should be in the DOM').not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('.search-dropdown--open')
    ).withContext('dropdown should not be open yet').toBeNull();
    expect(renderedNames()).toEqual([]);
  });

  it('renders the items once open', () => {
    setItems(indexOf('Account', 'Contact'));
    component.open();
    fixture.detectChanges();

    expect(renderedNames()).toEqual(['Account', 'Contact']);
  });

  // The component's own comment: "A plain @Input is not tracked by computed(),
  // so results went stale after a schema pull until the query happened to
  // change." This is that regression.
  it('recomputes results when the items input changes after first render', () => {
    setItems(indexOf('Account'));
    component.open();
    fixture.detectChanges();
    expect(renderedNames()).toEqual(['Account']);

    setItems(indexOf('Account', 'Opportunity'));

    expect(renderedNames()).toEqual(['Account', 'Opportunity']);
  });

  it('filters case-insensitively on the typed query', () => {
    setItems(indexOf('Account', 'Contact', 'Opportunity'));
    component.open();
    fixture.detectChanges();

    typeQuery('cont');

    expect(renderedNames()).toEqual(['Contact']);
  });

  // The "declared and never bound" failure mode: assert the @Output actually
  // fires from a real click, not from calling the method directly.
  it('emits entitySelected when an item is clicked', () => {
    const emitted: string[] = [];
    component.entitySelected.subscribe((name) => emitted.push(name));

    setItems(indexOf('Account', 'Contact'));
    component.open();
    fixture.detectChanges();

    const items: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.search-dropdown__item');
    items[1].click();

    expect(emitted).toEqual(['Contact']);
  });

  it('caps the first render at one page and reports there is more', () => {
    setItems(indexOf(...Array.from({ length: 120 }, (_, i) => `Entity${i + 1}`)));
    component.open();
    fixture.detectChanges();

    expect(renderedNames().length).toBe(50);
    expect(component.matchCount()).toBe(120);
    expect(component.hasMore()).toBe(true);
  });

  it('restarts paging when a new query is typed', () => {
    // Attach to the document so the list gets real layout: scrollHeight and
    // clientHeight are 0 for a detached element, and onScroll needs both to
    // decide whether the viewport is near the end.
    document.body.appendChild(fixture.nativeElement);

    setItems(indexOf(...Array.from({ length: 120 }, (_, i) => `Entity${i + 1}`)));
    component.open();
    fixture.detectChanges();

    const list: HTMLElement = fixture.nativeElement.querySelector('.search-dropdown__list');
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    // Setup check: if this doesn't hold, the scroll didn't actually page
    // anything in, and the "restarts" assertion below would be meaningless.
    expect(component.visibleCount())
      .withContext('setup: scrolling to the end should have paged in more than one page')
      .toBeGreaterThan(50);

    typeQuery('Entity1');

    expect(component.visibleCount()).toBe(50);

    document.body.removeChild(fixture.nativeElement);
  });
});
