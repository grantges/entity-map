import {
  EntityIndex,
  ODataEntityType,
  ODataNavigationProperty,
  ODataProperty,
} from '../app/core/models/entity.model';

/**
 * Builders, not constants. A spec should state only the field it is about and
 * inherit the rest, otherwise every spec carries forty lines of scaffolding and
 * nobody adds the next test.
 *
 * Deliberately free of shared mutable state (no auto-incrementing counters), so
 * a spec's fixtures do not depend on how many ran before it.
 */

export function aProperty(overrides: Partial<ODataProperty> = {}): ODataProperty {
  return {
    name: 'Field',
    type: 'Edm.String',
    nullable: true,
    isKey: false,
    ...overrides,
  };
}

/** `properties(3)` -> Field1, Field2, Field3. For filling up to a limit. */
export function properties(count: number, prefix = 'Field'): ODataProperty[] {
  return Array.from({ length: count }, (_, i) =>
    aProperty({ name: `${prefix}${i + 1}` })
  );
}

export function aNavProperty(
  overrides: Partial<ODataNavigationProperty> = {}
): ODataNavigationProperty {
  return {
    name: 'Account',
    targetEntity: 'Account',
    isCollection: false,
    ...overrides,
  };
}

export function anEntity(overrides: Partial<ODataEntityType> = {}): ODataEntityType {
  return {
    name: 'Entity',
    namespace: 'Creatio',
    properties: [
      aProperty({ name: 'Id', type: 'Edm.Guid', nullable: false, isKey: true }),
    ],
    navigationProperties: [],
    keyPropertyNames: ['Id'],
    ...overrides,
  };
}

export function anEntityIndex(overrides: Partial<EntityIndex> = {}): EntityIndex {
  return {
    name: 'Entity',
    propertyCount: 1,
    navPropertyCount: 0,
    relatedEntityNames: [],
    ...overrides,
  };
}
