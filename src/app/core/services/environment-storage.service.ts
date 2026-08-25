import { Injectable, inject, signal, computed } from '@angular/core';
import { ParseResult } from '../models/entity.model';
import {
  Environment,
  EnvironmentConnection,
  SavedEnvironment,
  CreatioConnection,
  hasSchema,
  isConnected,
} from '../models/app.model';
import { generateId } from '../utils/generate-id';
import { IndexedDbStore } from '../utils/indexed-db-store';
import { SECRET_STORE } from '../platform/platform.model';

export type { Environment, EnvironmentConnection } from '../models/app.model';
export { hasSchema, isConnected } from '../models/app.model';

const DB_NAME = 'entity-map-db';
const DB_VERSION = 1;
const STORE_NAME = 'environments';

/** Current index. Environments carry their connection inline. */
const LS_KEY_INDEX = 'em-environments-v2';

/** Legacy keys, read once during migration and then left untouched as a backup. */
const LS_KEY_LEGACY_ENVS = 'em-environments-index';
const LS_KEY_LEGACY_CONNS = 'em-creatio-connections';
const LS_KEY_MIGRATED = 'em-environments-migrated-v2';

/** Schemas older than this prompt a (dismissible) refresh nudge. */
const STALE_AFTER_DAYS = 7;

const pwKey = (envId: string) => `em-env-pw-${envId}`;

@Injectable({ providedIn: 'root' })
export class EnvironmentStorageService {
  private readonly secrets = inject(SECRET_STORE);
  private readonly _environments = signal<Environment[]>([]);
  private readonly idb = new IndexedDbStore(DB_NAME, STORE_NAME, DB_VERSION);

  readonly environments = this._environments.asReadonly();
  readonly hasEnvironments = computed(() => this._environments().length > 0);

  constructor() {
    this.migrateIfNeeded();
    this.loadIndex();
  }

  // === Creation ===

  /** Create an environment from an uploaded metadata file (no connection). */
  async createFromFile(name: string, result: ParseResult): Promise<Environment> {
    const env: Environment = { id: generateId(), name, createdAt: new Date().toISOString() };
    await this.writeSchema(env, result);
    this.upsert(env);
    return env;
  }

  /** Create a connected environment, optionally with a schema already pulled. */
  async createFromConnection(
    name: string,
    connection: EnvironmentConnection,
    result?: ParseResult
  ): Promise<Environment> {
    const env: Environment = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      connection: { ...connection },
    };
    if (result) {
      await this.writeSchema(env, result);
      env.connection!.lastPulledAt = new Date().toISOString();
    }
    this.upsert(env);
    return env;
  }

  /**
   * Replace an environment's schema (a file re-import, or a live pull).
   * Custom entities, custom columns and descriptions live in MetadataStore
   * keyed by environment id, so they are untouched by this.
   */
  async setSchema(id: string, result: ParseResult, fromPull = false): Promise<Environment | null> {
    const env = this.byId(id);
    if (!env) return null;
    const updated: Environment = { ...env };
    await this.writeSchema(updated, result);
    if (fromPull && updated.connection) {
      updated.connection = { ...updated.connection, lastPulledAt: new Date().toISOString() };
    }
    this.upsert(updated);
    return updated;
  }

  // === Reads ===

  byId(id: string): Environment | undefined {
    return this._environments().find((e) => e.id === id);
  }

  /** Load a stored schema. Null when the environment has never been pulled. */
  async load(id: string): Promise<ParseResult | null> {
    try {
      const json = await this.idb.get(id);
      if (!json) return null;
      return JSON.parse(json) as ParseResult;
    } catch {
      return null;
    }
  }

  /** True when a connected environment's schema is old enough to nudge about. */
  isStale(env: Environment): boolean {
    if (!isConnected(env) || !env.savedAt) return false;
    const ageMs = Date.now() - new Date(env.savedAt).getTime();
    return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  }

  daysSincePull(env: Environment): number | null {
    if (!env.savedAt) return null;
    return Math.floor((Date.now() - new Date(env.savedAt).getTime()) / 86_400_000);
  }

  // === Mutation ===

  rename(id: string, name: string): void {
    const env = this.byId(id);
    if (env) this.upsert({ ...env, name });
  }

  /** Attach or replace connection details on an existing environment. */
  setConnection(id: string, connection: EnvironmentConnection | undefined): void {
    const env = this.byId(id);
    if (env) this.upsert({ ...env, connection: connection ? { ...connection } : undefined });
  }

  async delete(id: string): Promise<void> {
    await this.idb.delete(id);
    await this.deletePassword(id);
    this.saveIndex(this._environments().filter((e) => e.id !== id));
  }

  // === Passwords (OS keychain where available) ===

  /** True when the host can store credentials securely; false in the browser. */
  canStorePassword(): Promise<boolean> {
    return this.secrets.isSecure();
  }

  async savePassword(id: string, password: string): Promise<void> {
    await this.secrets.set(pwKey(id), password);
    const env = this.byId(id);
    if (env?.connection) {
      this.upsert({ ...env, connection: { ...env.connection, hasStoredPassword: true } });
    }
  }

  getPassword(id: string): Promise<string | null> {
    return this.secrets.get(pwKey(id));
  }

  async deletePassword(id: string): Promise<void> {
    await this.secrets.delete(pwKey(id));
    const env = this.byId(id);
    if (env?.connection) {
      this.upsert({ ...env, connection: { ...env.connection, hasStoredPassword: false } });
    }
  }

  // === Internals ===

  private async writeSchema(env: Environment, result: ParseResult): Promise<void> {
    const json = JSON.stringify(result);
    await this.idb.put(env.id, json);
    env.entityCount = result.entities.length;
    env.namespace = result.namespace;
    env.savedAt = new Date().toISOString();
    env.sizeBytes = json.length;
  }

  private upsert(env: Environment): void {
    const list = this._environments();
    const i = list.findIndex((e) => e.id === env.id);
    const next = i === -1 ? [...list, env] : list.map((e) => (e.id === env.id ? env : e));
    this.saveIndex(next);
  }

  private loadIndex(): void {
    try {
      const json = localStorage.getItem(LS_KEY_INDEX);
      this._environments.set(json ? JSON.parse(json) : []);
    } catch {
      this._environments.set([]);
    }
  }

  private saveIndex(envs: Environment[]): void {
    this._environments.set(envs);
    localStorage.setItem(LS_KEY_INDEX, JSON.stringify(envs));
  }

  /**
   * Fold the old two-list model (environments + connections) into one.
   *
   * Environments KEEP their original id: the schema blob in IndexedDB and the
   * per-environment custom entities/descriptions in localStorage are both keyed
   * by it, so a fresh id would orphan all of that.
   *
   * Pairing is by hostname -- environment names defaulted to the host, so an
   * environment named `foo.creatio.com` and a connection to
   * `https://foo.creatio.com` are the same place. Legacy keys are deliberately
   * left in place as a backup rather than deleted.
   */
  private migrateIfNeeded(): void {
    if (localStorage.getItem(LS_KEY_MIGRATED) === '1') return;
    if (localStorage.getItem(LS_KEY_INDEX)) {
      localStorage.setItem(LS_KEY_MIGRATED, '1');
      return;
    }

    const legacyEnvs = this.readJson<SavedEnvironment[]>(LS_KEY_LEGACY_ENVS) ?? [];
    const legacyConns = this.readJson<CreatioConnection[]>(LS_KEY_LEGACY_CONNS) ?? [];
    if (legacyEnvs.length === 0 && legacyConns.length === 0) {
      localStorage.setItem(LS_KEY_MIGRATED, '1');
      return;
    }

    const host = (v: string) => {
      try {
        return new URL(v.includes('://') ? v : `https://${v}`).hostname.toLowerCase();
      } catch {
        return v.trim().toLowerCase();
      }
    };

    const unclaimed = new Set(legacyConns.map((c) => c.id));
    const merged: Environment[] = legacyEnvs.map((e) => {
      const match = legacyConns.find((c) => unclaimed.has(c.id) && host(c.url) === host(e.name));
      if (match) unclaimed.delete(match.id);
      return {
        id: e.id, // preserved on purpose -- see doc comment
        name: e.name,
        createdAt: e.savedAt,
        entityCount: e.entityCount,
        namespace: e.namespace,
        savedAt: e.savedAt,
        sizeBytes: e.sizeBytes,
        connection: match
          ? { url: match.url, username: match.username, lastPulledAt: e.savedAt }
          : undefined,
      };
    });

    // Connections with no matching schema become environments awaiting a pull.
    for (const c of legacyConns.filter((c) => unclaimed.has(c.id))) {
      merged.push({
        id: c.id,
        name: c.name || host(c.url),
        createdAt: c.savedAt,
        connection: { url: c.url, username: c.username },
      });
    }

    localStorage.setItem(LS_KEY_INDEX, JSON.stringify(merged));
    localStorage.setItem(LS_KEY_MIGRATED, '1');
  }

  private readJson<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}
