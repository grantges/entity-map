import { ODataEntityType, ODataProperty } from './entity.model';

// === Environment Storage ===

export interface SavedEnvironment {
  id: string;
  name: string;
  entityCount: number;
  namespace: string;
  savedAt: string;
  sizeBytes: number;
}

// === OData Connection ===

export interface CreatioConnection {
  id: string;
  name: string;
  url: string;       // e.g., https://myorg.creatio.com
  username: string;
  savedAt: string;
}

// === Baseline / Schema Diff ===

export interface BaselineSnapshot {
  id: string;
  name: string;
  environmentId: string;
  capturedAt: string;
  entityCount: number;
  /** Map of entityName -> property names */
  entityProperties: Record<string, string[]>;
  /** Set of all entity names */
  entityNames: string[];
}

export interface SchemaDiff {
  addedEntities: ODataEntityType[];            // Completely new entities
  removedEntityNames: string[];                 // Entities that were in baseline but no longer exist
  modifiedEntities: EntityDiff[];               // Entities that gained or lost columns
  unchangedEntityNames: string[];               // No changes
}

export interface EntityDiff {
  entityName: string;
  entity: ODataEntityType;
  addedColumns: ODataProperty[];
  removedColumnNames: string[];
}

// === AI ===

export interface AiDescriptionResult {
  entityDescription: string;
  columnDescriptions: Record<string, string>;
}
