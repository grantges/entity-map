import { Injectable, computed, signal, effect } from '@angular/core';
import {
  ODataEntityType,
  ODataProperty,
  ODataNavigationProperty,
  EntityIndex,
  EntityMetadata,
  ParseResult,
} from '../models/entity.model';

function lsKey(envId: string, suffix: string): string {
  return `em-${envId}-${suffix}`;
}

@Injectable({ providedIn: 'root' })
export class MetadataStoreService {
  private readonly _entities = signal<Map<string, ODataEntityType>>(new Map());
  private readonly _entityIndex = signal<EntityIndex[]>([]);
  private readonly _namespace = signal<string>('');
  private readonly _loaded = signal<boolean>(false);
  private readonly _envId = signal<string | null>(null);

  // User modifications — persisted to localStorage, scoped per environment
  private readonly _customEntities = signal<Map<string, ODataEntityType>>(new Map());
  private readonly _customProperties = signal<Map<string, ODataProperty[]>>(new Map());
  private readonly _metadata = signal<Map<string, EntityMetadata>>(new Map());

  readonly entities = this._entities.asReadonly();
  readonly entityIndex = this._entityIndex.asReadonly();
  readonly namespace = this._namespace.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  readonly environmentId = computed(() => this._envId() || '');

  readonly entityNames = computed(() =>
    [...this._entities().keys()].sort()
  );

  readonly entityCount = computed(() => {
    return this._entities().size + this._customEntities().size;
  });

  readonly allEntityNames = computed(() => {
    const original = [...this._entities().keys()];
    const custom = [...this._customEntities().keys()];
    return [...new Set([...original, ...custom])].sort();
  });

  /** Returns a combined map of all entities with custom properties merged in */
  readonly allEntitiesMap = computed(() => {
    const map = new Map<string, ODataEntityType>();
    // Track custom properties signal so this recomputes when they change
    const customProps = this._customProperties();
    this._entities().forEach((_, name) => {
      const merged = this.getEntity(name);
      if (merged) map.set(name, merged);
    });
    this._customEntities().forEach((e, name) => map.set(name, e));
    return map;
  });

  constructor() {
    // Auto-persist changes to localStorage (only when an environment is active)
    effect(() => {
      const customEntities = this._customEntities();
      const customProps = this._customProperties();
      const metadata = this._metadata();
      if (this._envId()) {
        this.saveToLocalStorage(customEntities, customProps, metadata);
      }
    });
  }

  // === Environment scoping ===

  /** Set the active environment ID. Loads scoped custom data from localStorage. */
  setEnvironmentId(envId: string): void {
    this._envId.set(envId);
    this.loadFromLocalStorage();
  }

  getEnvironmentId(): string | null {
    return this._envId();
  }

  // === Load / Parse ===

  loadFromParseResult(result: ParseResult): void {
    const map = new Map<string, ODataEntityType>();
    for (const entity of result.entities) {
      map.set(entity.name, entity);
    }
    this._entities.set(map);
    this._entityIndex.set(result.entityIndex);
    this._namespace.set(result.namespace);
    this._loaded.set(true);
  }

  // === Entity Access ===

  getEntity(name: string): ODataEntityType | undefined {
    const custom = this._customEntities().get(name);
    if (custom) return custom;

    const original = this._entities().get(name);
    if (!original) return undefined;

    const customProps = this._customProperties().get(name);
    if (customProps && customProps.length > 0) {
      return {
        ...original,
        properties: [...original.properties, ...customProps],
        navigationProperties: [
          ...original.navigationProperties,
          ...this.buildNavPropsForCustomProperties(name, customProps),
        ],
      };
    }
    return original;
  }

  getEntityWithInheritedProperties(name: string): ODataEntityType | undefined {
    const entity = this.getEntity(name);
    if (!entity) return undefined;
    if (!entity.baseType) return entity;

    const baseEntity = this.getEntity(entity.baseType);
    if (!baseEntity) return entity;

    return {
      ...entity,
      properties: [...baseEntity.properties, ...entity.properties],
      navigationProperties: [
        ...baseEntity.navigationProperties,
        ...entity.navigationProperties,
      ],
    };
  }

  // === Metadata (descriptions) ===

  getMetadata(entityName: string): EntityMetadata {
    return this._metadata().get(entityName) || { columnDescriptions: {} };
  }

  setEntityDescription(entityName: string, description: string): void {
    const current = this.getMetadata(entityName);
    const updated = new Map(this._metadata());
    updated.set(entityName, { ...current, description });
    this._metadata.set(updated);
  }

  setColumnDescription(entityName: string, columnName: string, description: string): void {
    const current = this.getMetadata(entityName);
    const colDescs = { ...current.columnDescriptions };
    if (description) {
      colDescs[columnName] = description;
    } else {
      delete colDescs[columnName];
    }
    const updated = new Map(this._metadata());
    updated.set(entityName, { ...current, columnDescriptions: colDescs });
    this._metadata.set(updated);
  }

  // === Custom Properties ===

  addCustomProperty(entityName: string, property: ODataProperty): void {
    const current = this._customProperties();
    const existing = current.get(entityName) || [];
    const updated = new Map(current);
    updated.set(entityName, [...existing, { ...property, isCustom: true }]);
    this._customProperties.set(updated);
  }

  removeCustomProperty(entityName: string, propertyName: string): void {
    const current = this._customProperties();
    const existing = current.get(entityName) || [];
    const updated = new Map(current);
    updated.set(entityName, existing.filter((p) => p.name !== propertyName));
    this._customProperties.set(updated);
  }

  getCustomProperties(entityName: string): ODataProperty[] {
    return this._customProperties().get(entityName) || [];
  }

  // === Custom Entities ===

  addCustomEntity(entity: ODataEntityType): void {
    const updated = new Map(this._customEntities());
    updated.set(entity.name, { ...entity, isCustom: true });
    this._customEntities.set(updated);

    // Update entity index
    this.rebuildEntityIndex();
  }

  removeCustomEntity(name: string): void {
    const updated = new Map(this._customEntities());
    updated.delete(name);
    this._customEntities.set(updated);
    this.rebuildEntityIndex();
  }

  getCustomEntities(): ODataEntityType[] {
    return [...this._customEntities().values()];
  }

  // === Search ===

  searchEntities(query: string): EntityIndex[] {
    if (!query || query.length < 1) return [];
    const lower = query.toLowerCase();
    return this._entityIndex()
      .filter((e) => e.name.toLowerCase().includes(lower))
      .slice(0, 50);
  }

  // === Clear ===

  clear(): void {
    this._entities.set(new Map());
    this._entityIndex.set([]);
    this._namespace.set('');
    this._loaded.set(false);
    // Don't clear custom data — it persists across file loads
  }

  /** Reset all state — used when switching environments */
  reset(): void {
    this._entities.set(new Map());
    this._entityIndex.set([]);
    this._namespace.set('');
    this._loaded.set(false);
    this._envId.set(null);
    this._customEntities.set(new Map());
    this._customProperties.set(new Map());
    this._metadata.set(new Map());
  }

  clearCustomData(): void {
    this._customEntities.set(new Map());
    this._customProperties.set(new Map());
    this._metadata.set(new Map());
    const envId = this._envId();
    if (envId) {
      localStorage.removeItem(lsKey(envId, 'custom-entities'));
      localStorage.removeItem(lsKey(envId, 'custom-properties'));
      localStorage.removeItem(lsKey(envId, 'metadata'));
    }
  }

  // === Internals ===

  /**
   * When a custom Lookup property is added, auto-generate the corresponding NavigationProperty
   * so the graph service can traverse to the linked entity.
   */
  private buildNavPropsForCustomProperties(
    entityName: string,
    customProps: ODataProperty[]
  ): ODataNavigationProperty[] {
    const navs: ODataNavigationProperty[] = [];
    for (const prop of customProps) {
      if (prop.linkedEntity && prop.type === 'Edm.Guid') {
        const navName = prop.name.replace(/Id$/, '') || prop.name;
        navs.push({
          name: navName,
          targetEntity: prop.linkedEntity,
          isCollection: false,
          fkPropertyName: prop.name,
        });
      }
    }
    return navs;
  }

  private rebuildEntityIndex(): void {
    const allEntities = [
      ...this._entityIndex(),
      ...this.getCustomEntities().map((e) => ({
        name: e.name,
        propertyCount: e.properties.length,
        navPropertyCount: e.navigationProperties.length,
        relatedEntityNames: e.navigationProperties
          .filter((n) => !n.isCollection)
          .map((n) => n.targetEntity),
      })),
    ];
    // Dedupe by name (custom entities override originals in index)
    const byName = new Map<string, EntityIndex>();
    for (const idx of allEntities) {
      byName.set(idx.name, idx);
    }
    this._entityIndex.set([...byName.values()]);
  }

  // === localStorage Persistence ===

  private loadFromLocalStorage(): void {
    if (!this._envId()) return;
    const id = this._envId()!;

    // Reset first
    this._customEntities.set(new Map());
    this._customProperties.set(new Map());
    this._metadata.set(new Map());

    try {
      const entitiesJson = localStorage.getItem(lsKey(id, 'custom-entities'));
      if (entitiesJson) {
        const arr: ODataEntityType[] = JSON.parse(entitiesJson);
        const map = new Map<string, ODataEntityType>();
        for (const e of arr) map.set(e.name, e);
        this._customEntities.set(map);
      }

      const propsJson = localStorage.getItem(lsKey(id, 'custom-properties'));
      if (propsJson) {
        const obj: Record<string, ODataProperty[]> = JSON.parse(propsJson);
        const map = new Map<string, ODataProperty[]>();
        for (const [k, v] of Object.entries(obj)) map.set(k, v);
        this._customProperties.set(map);
      }

      const metaJson = localStorage.getItem(lsKey(id, 'metadata'));
      if (metaJson) {
        const obj: Record<string, EntityMetadata> = JSON.parse(metaJson);
        const map = new Map<string, EntityMetadata>();
        for (const [k, v] of Object.entries(obj)) map.set(k, v);
        this._metadata.set(map);
      }
    } catch {
      // Corrupted data — ignore
    }
  }

  private saveToLocalStorage(
    customEntities: Map<string, ODataEntityType>,
    customProps: Map<string, ODataProperty[]>,
    metadata: Map<string, EntityMetadata>
  ): void {
    if (!this._envId()) return;
    const id = this._envId()!;

    try {
      if (customEntities.size > 0) {
        localStorage.setItem(lsKey(id, 'custom-entities'), JSON.stringify([...customEntities.values()]));
      } else {
        localStorage.removeItem(lsKey(id, 'custom-entities'));
      }

      if (customProps.size > 0) {
        const obj: Record<string, ODataProperty[]> = {};
        customProps.forEach((v, k) => { if (v.length > 0) obj[k] = v; });
        localStorage.setItem(lsKey(id, 'custom-properties'), JSON.stringify(obj));
      } else {
        localStorage.removeItem(lsKey(id, 'custom-properties'));
      }

      if (metadata.size > 0) {
        const obj: Record<string, EntityMetadata> = {};
        metadata.forEach((v, k) => obj[k] = v);
        localStorage.setItem(lsKey(id, 'metadata'), JSON.stringify(obj));
      } else {
        localStorage.removeItem(lsKey(id, 'metadata'));
      }
    } catch {
      // localStorage full or unavailable
    }
  }
}
