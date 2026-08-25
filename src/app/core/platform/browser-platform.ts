import { Injectable, inject } from '@angular/core';
import { FileSaver, SecretStore } from './platform.model';
import { CryptoStorageService } from '../services/crypto-storage.service';

/** Anchor-click download -- the existing web behaviour, unchanged. */
@Injectable()
export class BrowserFileSaver implements FileSaver {
  async save(blob: Blob, filename: string): Promise<string | null> {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return null; // the browser never tells us where it landed
  }
}

/**
 * AES-GCM via crypto.subtle, keyed from IndexedDB, persisted in localStorage.
 * This is the pre-existing web storage scheme; key names are preserved so
 * secrets saved before the platform layer existed still load.
 */
@Injectable()
export class BrowserSecretStore implements SecretStore {
  private readonly crypto = inject(CryptoStorageService);
  readonly description = 'Encrypted in browser storage';

  /**
   * False by design. The key sits in the same browser profile as the
   * ciphertext, so this protects against casual inspection, not an attacker
   * with local access -- not a bar worth storing passwords behind.
   */
  async isSecure(): Promise<boolean> {
    return false;
  }

  async get(key: string): Promise<string | null> {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const value = await this.crypto.decrypt(stored);
    return value || null;
  }

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, await this.crypto.encrypt(value));
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
}
