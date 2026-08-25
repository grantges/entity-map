import { Injectable, inject } from '@angular/core';
import { FileSaver, SecretStore, electronApi } from './platform.model';
import { filterForFilename } from './platform.model';
import { BrowserSecretStore } from './browser-platform';

/** Native save dialog, so exports land where the user chose. */
@Injectable()
export class ElectronFileSaver implements FileSaver {
  async save(blob: Blob, filename: string): Promise<string | null> {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    const result = await electronApi().saveFile({
      defaultPath: filename,
      data: buffer,
      filters: filterForFilename(filename),
    });
    return result.saved ? (result.path ?? null) : null;
  }
}

/**
 * OS keychain (Keychain on macOS, DPAPI on Windows, libsecret on Linux).
 *
 * Linux boxes without a keyring report encryption unavailable; there we fall
 * back to the browser scheme rather than storing the key in plaintext.
 */
@Injectable()
export class ElectronSecretStore implements SecretStore {
  private readonly fallback = inject(BrowserSecretStore);
  private available: boolean | null = null;
  readonly description = 'Stored in system keychain';

  isSecure(): Promise<boolean> {
    return this.useNative();
  }

  private async useNative(): Promise<boolean> {
    if (this.available === null) {
      this.available = await electronApi().secrets.isAvailable();
    }
    return this.available;
  }

  async get(key: string): Promise<string | null> {
    if (!(await this.useNative())) return this.fallback.get(key);

    const native = await electronApi().secrets.get(key);
    if (native) return native;

    // One-time migration: a key saved by the web build before this ran.
    const legacy = await this.fallback.get(key);
    if (legacy) {
      await electronApi().secrets.set(key, legacy);
      await this.fallback.delete(key);
      return legacy;
    }
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    if (!(await this.useNative())) return this.fallback.set(key, value);
    await electronApi().secrets.set(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.fallback.delete(key);
    if (await this.useNative()) await electronApi().secrets.delete(key);
  }
}
