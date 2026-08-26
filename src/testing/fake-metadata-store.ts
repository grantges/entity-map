import { signal } from '@angular/core';
import { ODataEntityType } from '../app/core/models/entity.model';

/**
 * Covers only the slice of MetadataStoreService that EntityGraphService,
 * BaselineService and SchemaExportService actually consume:
 *   getEntity(), allEntitiesMap(), environmentId()
 *
 * Provided via `{ provide: MetadataStoreService, useValue: fake }`, which needs
 * a cast at the provider because this is not the full class. That cast is the
 * price of not dragging IndexedDB and localStorage persistence into a graph
 * traversal test.
 */
export class FakeMetadataStore {
  private readonly entities = new Map<string, ODataEntityType>();
  private readonly _allEntitiesMap = signal(new Map<string, ODataEntityType>());

  readonly allEntitiesMap = this._allEntitiesMap.asReadonly();
  readonly environmentId = signal('test-env');

  constructor(entities: ODataEntityType[] = []) {
    this.setEntities(entities);
  }

  setEntities(entities: ODataEntityType[]): void {
    this.entities.clear();
    for (const entity of entities) {
      this.entities.set(entity.name, entity);
    }
    this._allEntitiesMap.set(new Map(this.entities));
  }

  getEntity(name: string): ODataEntityType | undefined {
    return this.entities.get(name);
  }
}
