import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UploadScreenComponent } from './upload-screen.component';
import { IS_ELECTRON, SECRET_STORE } from '../../../../core/platform/platform.model';

/**
 * `-webkit-app-region` is a Chromium/Electron extension and is absent from the
 * CSSStyleDeclaration typings, so it has to be read by name.
 */
function appRegion(el: Element): string {
  return getComputedStyle(el).getPropertyValue('-webkit-app-region').trim();
}

/**
 * Only meaningful under a real browser: jsdom resolves no cascade, so
 * getComputedStyle() would echo author values back and every assertion here
 * would pass vacuously. Karma runs real Chrome.
 */
describe('UploadScreenComponent', () => {
  let fixture: ComponentFixture<UploadScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadScreenComponent],
      providers: [
        // EnvironmentStorageService injects SECRET_STORE to read saved
        // connection passwords. Neither it nor a real backend is under test;
        // this reports the same state as a fresh profile.
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
        // The drag strip is only rendered on the desktop build.
        { provide: IS_ELECTRON, useValue: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadScreenComponent);
    fixture.detectChanges();
  });

  // Regression: issue #13. The upload screen has no toolbar, so it renders its
  // own 52px window-drag strip across the top. The theme toggle is positioned
  // at top-right, inside that band, and was not opting out -- so the drag rect
  // swallowed the mousedown and the button could never be clicked.
  //
  // An earlier comment in styles.scss claimed the button "paints on top and
  // stays clickable without needing its own opt-out". That is wrong: drag rects
  // are handed to the window manager and intercept the mousedown before the
  // page sees it, so paint order does not matter and elementFromPoint() reports
  // the button as reachable whether or not the bug is present. Asserting the
  // resolved cascade is the only test that can actually fail here.
  describe('window-drag opt-out on the frameless desktop build', () => {
    beforeEach(() => {
      // styles.scss gates these rules on the class providePlatform() stamps
      // onto <html> when running under Electron on macOS.
      document.documentElement.classList.add('em-platform-mac-frameless');
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    });

    afterEach(() => {
      document.documentElement.classList.remove('em-platform-mac-frameless');
    });

    it('renders the drag strip as a draggable region', () => {
      const strip: HTMLElement | null = fixture.nativeElement.querySelector(
        '.upload-screen__drag-strip'
      );

      expect(strip).withContext('drag strip should render when IS_ELECTRON').toBeTruthy();
      expect(appRegion(strip!)).toBe('drag');
    });

    it('opts the theme toggle out of the drag region', () => {
      const btn: HTMLElement = fixture.nativeElement.querySelector(
        '.upload-screen__theme-btn'
      );
      expect(btn).toBeTruthy();

      // `none` is NOT sufficient -- only an explicit `no-drag` subtracts from
      // a drag rect, which is precisely what the bug was.
      expect(appRegion(btn))
        .withContext('theme toggle must explicitly opt out, not merely resolve to none')
        .toBe('no-drag');
    });

    it('opts the toggle’s icon out too, since app-region does not inherit', () => {
      const children: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.upload-screen__theme-btn *')
      );

      expect(children.length)
        .withContext('button should contain an icon element')
        .toBeGreaterThan(0);

      children.forEach((child) => {
        expect(appRegion(child))
          .withContext(`${child.tagName.toLowerCase()} inside the toggle must be no-drag`)
          .toBe('no-drag');
      });
    });
  });

  it('does not render the drag strip when not running under Electron', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [UploadScreenComponent],
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
        { provide: IS_ELECTRON, useValue: false },
      ],
    }).compileComponents();

    const webFixture = TestBed.createComponent(UploadScreenComponent);
    webFixture.detectChanges();

    expect(
      webFixture.nativeElement.querySelector('.upload-screen__drag-strip')
    ).toBeNull();
  });
});
