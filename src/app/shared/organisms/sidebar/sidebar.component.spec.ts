import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SidebarComponent } from './sidebar.component';
import { SECRET_STORE } from '../../../core/platform/platform.model';
import { anEntity, aProperty, isHittable } from '../../../../testing';

/**
 * These assertions are only meaningful under a real browser. jsdom resolves no
 * cascade and performs no layout, so getComputedStyle() would echo back author
 * values and elementFromPoint() would answer nothing. Karma runs real Chrome.
 */
describe('SidebarComponent rendering', () => {
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      // The component injects AiService, which in turn injects SECRET_STORE
      // to load a saved API key on construction. Neither the platform layer
      // nor a real secret backend is under test here, so satisfy the token
      // with a no-op that reports "no key saved" -- the same effective state
      // as a fresh browser profile.
      providers: [
        {
          provide: SECRET_STORE,
          useValue: {
            get: async () => null,
            set: async () => {},
            delete: async () => {},
            description: 'test',
            isSecure: async () => false,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    fixture.componentInstance.entity = anEntity({
      name: 'Account',
      properties: [
        aProperty({ name: 'Id', type: 'Edm.Guid', isKey: true }),
        aProperty({ name: 'Name', type: 'Edm.String' }),
      ],
    });
    fixture.componentInstance.isOpen = true;

    // The style and hit-test assertions below need a real cascade and real
    // layout: getComputedStyle() on a detached element and
    // document.elementFromPoint() against a detached tree do not answer the
    // question this spec is asking. Attach the host to the live document.
    document.body.appendChild(fixture.nativeElement);
    // The fixture host itself has no intrinsic size, so a 100%-height,
    // absolutely-positioned child can still resolve to a zero-size box and
    // make the hit test spuriously fail. Give the host explicit space.
    fixture.nativeElement.style.height = '800px';
    fixture.nativeElement.style.width = '600px';

    fixture.detectChanges();
  });

  // Unconditional cleanup: Angular's own teardown does not remove a node
  // appended outside its control (DomRenderer sets destroyNode = null), and
  // spec order is randomised by default, so a leaked element could bleed
  // into any later spec in the run.
  afterEach(() => {
    fixture.nativeElement.parentNode?.removeChild(fixture.nativeElement);
  });

  function panel(): HTMLElement {
    return fixture.nativeElement.querySelector('.sidebar');
  }

  it('renders the panel', () => {
    expect(panel()).toBeTruthy();
  });

  // A z-index on a statically positioned element does nothing. The rule sets
  // both; this asserts both survived, from the resolved cascade rather than
  // from the stylesheet text.
  it('stacks above the canvas with a position that makes z-index apply', () => {
    const style = getComputedStyle(panel());

    expect(style.position).withContext('resolved position').toBe('absolute');
    expect(style.zIndex).withContext('resolved z-index').toBe('20');
  });

  it('resolves a real width rather than collapsing', () => {
    expect(panel().getBoundingClientRect().width).toBeGreaterThan(0);
    // Pin to the declared value, not just >0: a collapsed flex child, an
    // ancestor with overflow:hidden clipping it to nothing, or any rule that
    // shrank the box would still satisfy a bare positivity check.
    expect(panel().getBoundingClientRect().width).toBeCloseTo(380, 0);
  });

  it('shows the entity name it was given', () => {
    expect(panel().textContent).toContain('Account');
  });

  it('is hit-testable at its own centre, with nothing overlaying it', () => {
    expect(isHittable(panel())).toBe(true);
  });
});
