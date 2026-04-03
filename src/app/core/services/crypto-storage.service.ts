import { Injectable } from '@angular/core';

const CRYPTO_KEY_NAME = 'em-crypto-key';

/**
 * Manages a per-browser AES-GCM encryption key stored in IndexedDB.
 * Caches the key in memory after first retrieval to avoid repeated IDB lookups.
 */
@Injectable({ providedIn: 'root' })
export class CryptoStorageService {
  private cachedKey: CryptoKey | null = null;

  /** Get (or create) the AES-GCM key, caching it in memory. */
  async getCryptoKey(): Promise<CryptoKey> {
    if (this.cachedKey) return this.cachedKey;

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('em-keys', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('keys');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const tx = db.transaction('keys', 'readonly');
    const existing = await new Promise<CryptoKey | undefined>((resolve) => {
      const req = tx.objectStore('keys').get(CRYPTO_KEY_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });

    if (existing) {
      db.close();
      this.cachedKey = existing;
      return existing;
    }

    // Generate a new key and store it
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // not extractable
      ['encrypt', 'decrypt']
    );

    const wtx = db.transaction('keys', 'readwrite');
    wtx.objectStore('keys').put(key, CRYPTO_KEY_NAME);
    await new Promise<void>((resolve) => { wtx.oncomplete = () => resolve(); });
    db.close();

    this.cachedKey = key;
    return key;
  }

  /** Encrypt a plaintext string to a base64 blob (iv + ciphertext). */
  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return '';
    const key = await this.getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  /** Decrypt a base64 blob back to plaintext. Returns '' on failure. */
  async decrypt(stored: string): Promise<string> {
    if (!stored) return '';
    try {
      const key = await this.getCryptoKey();
      const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return new TextDecoder().decode(decrypted);
    } catch {
      return ''; // Key was regenerated or data corrupted
    }
  }
}
