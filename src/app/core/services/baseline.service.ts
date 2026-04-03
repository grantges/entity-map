import { Injectable, inject, signal, computed } from '@angular/core';
import { MetadataStoreService } from './metadata-store.service';
import { ODataEntityType } from '../models/entity.model';
import { BaselineSnapshot, SchemaDiff, EntityDiff } from '../models/app.model';
import { generateId } from '../utils/generate-id';
import { IndexedDbStore } from '../utils/indexed-db-store';

export type { BaselineSnapshot, SchemaDiff, EntityDiff } from '../models/app.model';

const DB_NAME = 'entity-map-baselines';
const DB_VERSION = 1;
const BASELINE_STORE = 'baselines';
const LS_KEY_BASELINE_INDEX = 'em-baselines-index';

@Injectable({ providedIn: 'root' })
export class BaselineService {
  private readonly store = inject(MetadataStoreService);
  private readonly idb = new IndexedDbStore(DB_NAME, BASELINE_STORE, DB_VERSION);

  private _baselines = signal<BaselineSnapshot[]>([]);
  readonly baselines = this._baselines.asReadonly();

  readonly baselinesForCurrentEnv = computed(() => {
    const envId = this.store.environmentId();
    return this._baselines().filter((b) => b.environmentId === envId);
  });

  constructor() {
    this.loadIndex();
  }

  /**
   * Capture the current schema state as a baseline snapshot.
   */
  async captureBaseline(name: string): Promise<BaselineSnapshot> {
    const envId = this.store.environmentId();
    if (!envId) throw new Error('No environment loaded');

    const entityMap = this.store.allEntitiesMap();
    const entityProperties: Record<string, string[]> = {};
    const entityNames: string[] = [];

    entityMap.forEach((entity, eName) => {
      entityNames.push(eName);
      entityProperties[eName] = entity.properties.map((p) => p.name);
    });

    const snapshot: BaselineSnapshot = {
      id: generateId(),
      name,
      environmentId: envId,
      capturedAt: new Date().toISOString(),
      entityCount: entityNames.length,
      entityProperties,
      entityNames,
    };

    // Store in IndexedDB
    await this.idb.put(snapshot.id, JSON.stringify(snapshot));

    // Update index
    const baselines = [...this._baselines(), snapshot];
    this._baselines.set(baselines);
    this.saveIndex(baselines);

    return snapshot;
  }

  /**
   * Compare the current schema against a baseline snapshot.
   */
  diffAgainstBaseline(baselineId: string): SchemaDiff | null {
    const baseline = this._baselines().find((b) => b.id === baselineId);
    if (!baseline) return null;

    const currentEntities = this.store.allEntitiesMap();
    const baselineEntitySet = new Set(baseline.entityNames);
    const currentEntityNames = new Set<string>();
    currentEntities.forEach((_, name) => currentEntityNames.add(name));

    const addedEntities: ODataEntityType[] = [];
    const removedEntityNames: string[] = [];
    const modifiedEntities: EntityDiff[] = [];
    const unchangedEntityNames: string[] = [];

    // Find added and modified entities
    currentEntities.forEach((entity, name) => {
      if (!baselineEntitySet.has(name)) {
        // Entirely new entity
        addedEntities.push(entity);
      } else {
        // Exists in both — check for column changes
        const baselineProps = new Set(baseline.entityProperties[name] || []);
        const currentProps = entity.properties;

        const addedColumns = currentProps.filter((p) => !baselineProps.has(p.name));
        const currentPropNames = new Set(currentProps.map((p) => p.name));
        const removedColumnNames = [...baselineProps].filter((p) => !currentPropNames.has(p));

        if (addedColumns.length > 0 || removedColumnNames.length > 0) {
          modifiedEntities.push({
            entityName: name,
            entity,
            addedColumns,
            removedColumnNames,
          });
        } else {
          unchangedEntityNames.push(name);
        }
      }
    });

    // Find removed entities
    for (const name of baseline.entityNames) {
      if (!currentEntityNames.has(name)) {
        removedEntityNames.push(name);
      }
    }

    return {
      addedEntities,
      removedEntityNames,
      modifiedEntities,
      unchangedEntityNames,
    };
  }

  /** Delete a baseline */
  async deleteBaseline(id: string): Promise<void> {
    await this.idb.delete(id);
    const baselines = this._baselines().filter((b) => b.id !== id);
    this._baselines.set(baselines);
    this.saveIndex(baselines);
  }

  private loadIndex(): void {
    try {
      const json = localStorage.getItem(LS_KEY_BASELINE_INDEX);
      if (json) this._baselines.set(JSON.parse(json));
    } catch {
      this._baselines.set([]);
    }
  }

  private saveIndex(baselines: BaselineSnapshot[]): void {
    localStorage.setItem(LS_KEY_BASELINE_INDEX, JSON.stringify(baselines));
  }
}
