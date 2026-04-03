import { Injectable, signal, computed } from '@angular/core';
import { ParseResult } from '../models/entity.model';
import { SavedEnvironment } from '../models/app.model';
import { generateId } from '../utils/generate-id';
import { IndexedDbStore } from '../utils/indexed-db-store';

export type { SavedEnvironment } from '../models/app.model';

const DB_NAME = 'entity-map-db';
const DB_VERSION = 1;
const STORE_NAME = 'environments';
const LS_KEY_ENVS_INDEX = 'em-environments-index';

@Injectable({ providedIn: 'root' })
export class EnvironmentStorageService {
  private readonly _environments = signal<SavedEnvironment[]>([]);
  private readonly idb = new IndexedDbStore(DB_NAME, STORE_NAME, DB_VERSION);

  readonly environments = this._environments.asReadonly();
  readonly hasEnvironments = computed(() => this._environments().length > 0);

  constructor() {
    this.loadIndex();
  }

  /** Save a parsed OData result as a named environment */
  async save(name: string, result: ParseResult): Promise<SavedEnvironment> {
    const id = generateId();
    const json = JSON.stringify(result);

    const env: SavedEnvironment = {
      id,
      name,
      entityCount: result.entities.length,
      namespace: result.namespace,
      savedAt: new Date().toISOString(),
      sizeBytes: json.length,
    };

    // Store data in IndexedDB
    await this.idb.put(id, json);

    // Update index
    const envs = [...this._environments(), env];
    this._environments.set(envs);
    this.saveIndex(envs);

    return env;
  }

  /** Load a saved environment by ID */
  async load(id: string): Promise<ParseResult | null> {
    try {
      const json = await this.idb.get(id);
      if (!json) return null;
      return JSON.parse(json) as ParseResult;
    } catch {
      return null;
    }
  }

  /** Delete a saved environment */
  async delete(id: string): Promise<void> {
    await this.idb.delete(id);
    const envs = this._environments().filter((e) => e.id !== id);
    this._environments.set(envs);
    this.saveIndex(envs);
  }

  /** Rename a saved environment */
  rename(id: string, newName: string): void {
    const envs = this._environments().map((e) =>
      e.id === id ? { ...e, name: newName } : e
    );
    this._environments.set(envs);
    this.saveIndex(envs);
  }

  // === Index (small, stays in localStorage) ===

  private loadIndex(): void {
    try {
      const json = localStorage.getItem(LS_KEY_ENVS_INDEX);
      if (json) {
        this._environments.set(JSON.parse(json));
      }
    } catch {
      this._environments.set([]);
    }
  }

  private saveIndex(envs: SavedEnvironment[]): void {
    localStorage.setItem(LS_KEY_ENVS_INDEX, JSON.stringify(envs));
  }

}
