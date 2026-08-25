import { InjectionToken } from '@angular/core';

/**
 * Platform abstraction layer.
 *
 * The web build and the Electron build ship from the SAME branch. Where the
 * two genuinely differ -- saving files, storing secrets -- the difference is
 * expressed as a DI swap here rather than as a diff in a long-lived branch.
 *
 * Adding a capability: define the interface + token here, implement it in
 * browser-platform.ts and electron-platform.ts, and register it in
 * platform.providers.ts. Feature code injects the token and stays
 * platform-agnostic.
 */

/** Writes a Blob to wherever the host platform puts user files. */
export interface FileSaver {
  /**
   * @returns the absolute path when the host can report one (Electron), or
   *          null when it cannot (browser downloads) or the user cancelled.
   */
  save(blob: Blob, filename: string): Promise<string | null>;
}

/** Stores small secrets (API keys) as securely as the host allows. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Human-readable backing store, for display in settings. */
  readonly description: string;
  /**
   * True only when backed by OS-level secure storage. Gates whether the app
   * offers to remember passwords at all -- the browser's AES-in-localStorage
   * scheme is not a good enough home for a live Creatio credential.
   */
  isSecure(): Promise<boolean>;
}

export const FILE_SAVER = new InjectionToken<FileSaver>('FILE_SAVER');
export const SECRET_STORE = new InjectionToken<SecretStore>('SECRET_STORE');
export const IS_ELECTRON = new InjectionToken<boolean>('IS_ELECTRON');

/** Shape of the contextBridge API exposed by electron/preload.js. */
export interface ElectronAPI {
  isElectron: true;
  platform: string;
  saveFile(opts: {
    defaultPath: string;
    data: Uint8Array;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ saved: boolean; path?: string }>;
  showItemInFolder(filePath: string): Promise<void>;
  secrets: {
    isAvailable(): Promise<boolean>;
    set(key: string, value: string): Promise<boolean>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<boolean>;
  };
  getTheme(): Promise<'dark' | 'light'>;
  isFullScreen(): Promise<boolean>;
  onFullScreenChanged(cb: (isFullScreen: boolean) => void): () => void;
  onThemeChanged(cb: (theme: 'dark' | 'light') => void): () => void;
  onMenuAction(cb: (action: 'open-metadata' | 'export' | 'settings') => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/** True when running inside the Electron shell. */
export function detectElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
}

/** Non-null accessor for the bridge; throws if called on the web build. */
export function electronApi(): ElectronAPI {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!api) throw new Error('electronAPI unavailable - not running in Electron');
  return api;
}

/** Map a filename to a native save-dialog filter. */
export function filterForFilename(filename: string): { name: string; extensions: string[] }[] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const names: Record<string, string> = {
    docx: 'Word Document',
    xml: 'XML File',
    json: 'JSON File',
    png: 'PNG Image',
    svg: 'SVG Image',
  };
  return ext && names[ext]
    ? [{ name: names[ext], extensions: [ext] }, { name: 'All Files', extensions: ['*'] }]
    : [{ name: 'All Files', extensions: ['*'] }];
}
