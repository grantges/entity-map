import { EnvironmentProviders, Provider, provideAppInitializer } from '@angular/core';
import { FILE_SAVER, SECRET_STORE, IS_ELECTRON, detectElectron } from './platform.model';
import { BrowserFileSaver, BrowserSecretStore } from './browser-platform';
import { ElectronFileSaver, ElectronSecretStore } from './electron-platform';

/**
 * Chooses platform implementations at bootstrap by feature-detecting the
 * preload bridge. One bundle, both hosts -- no build-time file replacement
 * and no separate branch.
 */
export function providePlatform(): (Provider | EnvironmentProviders)[] {
  const isElectron = detectElectron();

  return [
    { provide: IS_ELECTRON, useValue: isElectron },
    provideAppInitializer(() => applyPlatformBodyClass(isElectron)),
    BrowserFileSaver,
    BrowserSecretStore, // always provided: Electron impls fall back to it
    ...(isElectron
      ? [
          ElectronFileSaver,
          ElectronSecretStore,
          { provide: FILE_SAVER, useExisting: ElectronFileSaver },
          { provide: SECRET_STORE, useExisting: ElectronSecretStore },
        ]
      : [
          { provide: FILE_SAVER, useExisting: BrowserFileSaver },
          { provide: SECRET_STORE, useExisting: BrowserSecretStore },
        ]),
  ];
}

/**
 * Tag the document so global CSS can adapt to the host chrome.
 *
 * On macOS the window uses `titleBarStyle: 'hiddenInset'`, which draws the
 * traffic-light buttons INSIDE the page. Without this class the toolbar's brand
 * sits underneath them, and the window has no draggable region at all.
 */
function applyPlatformBodyClass(isElectron: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('em-platform-electron', isElectron);

  const macFrameless = isElectron && window.electronAPI?.platform === 'darwin';
  root.classList.toggle('em-platform-mac-frameless', macFrameless);
  if (!macFrameless) return;

  // macOS hides the traffic lights in full screen, so the inset the toolbar
  // reserves for them has to collapse or it reads as a dead gap.
  const setFullScreen = (on: boolean) =>
    root.classList.toggle('em-window-fullscreen', on);

  window.electronAPI!.isFullScreen().then(setFullScreen).catch(() => {});
  window.electronAPI!.onFullScreenChanged(setFullScreen);
}
