import { ODataEntityType, ODataProperty } from './entity.model';

// === Environments ===

/**
 * Live-connection details for an environment.
 *
 * Presence of this object is what makes an environment "connected" -- it can
 * pull a fresh schema. Absence means the schema came from a file.
 */
export interface EnvironmentConnection {
  url: string;        // e.g., https://myorg.creatio.com
  username: string;
  /** True when a password is held in the OS keychain (desktop only). */
  hasStoredPassword?: boolean;
  /** ISO timestamp of the last successful schema pull. */
  lastPulledAt?: string;
  /**
   * Accept this host's certificate even though it fails verification.
   *
   * Opt-in per environment and never a default: it disables MITM protection
   * for this host. Offered only after a certificate failure actually occurs,
   * so it cannot be switched on casually.
   */
  allowInsecureTls?: boolean;
}

/**
 * An environment is the single unit of work in the app. A connection is not a
 * separate thing you manage -- it is an optional capability of an environment.
 *
 * Three valid states:
 *   schema + no connection  -> imported from a file, cannot refresh itself
 *   schema + connection     -> connected; can pull the latest schema
 *   no schema + connection  -> connected but never pulled yet
 */
export interface Environment {
  id: string;
  name: string;
  createdAt: string;
  /** Schema snapshot metadata. Absent until a schema has been imported. */
  entityCount?: number;
  namespace?: string;
  savedAt?: string;
  sizeBytes?: number;
  connection?: EnvironmentConnection;
}

/** True when this environment holds an imported schema. */
export function hasSchema(env: Environment): boolean {
  return env.savedAt !== undefined && env.entityCount !== undefined;
}

/** True when this environment can pull a fresh schema from a server. */
export function isConnected(env: Environment): boolean {
  return env.connection !== undefined;
}

// === Legacy shapes (migration only) ===

/** @deprecated Pre-merge shape. Read during migration, never written. */
export interface SavedEnvironment {
  id: string;
  name: string;
  entityCount: number;
  namespace: string;
  savedAt: string;
  sizeBytes: number;
}

/** @deprecated Pre-merge shape. Read during migration, never written. */
export interface CreatioConnection {
  id: string;
  name: string;
  url: string;
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
