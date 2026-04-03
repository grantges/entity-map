import { ODataEntityType, ODataProperty, SYSTEM_PROPERTIES } from '../models/entity.model';

/** Maximum number of properties shown on an entity card. */
export const VISIBLE_PROP_LIMIT = 12;

/** Maximum number of navigation properties shown on an entity card. */
export const VISIBLE_NAV_LIMIT = 8;

/**
 * Return the properties that should be visible on an entity card,
 * optionally filtering out system properties and capping at a limit.
 */
export function getVisibleProperties(
  entity: ODataEntityType,
  showSystem: boolean,
  limit = VISIBLE_PROP_LIMIT
): ODataProperty[] {
  const props = showSystem
    ? entity.properties
    : entity.properties.filter((p) => !SYSTEM_PROPERTIES.has(p.name));
  return props.slice(0, limit);
}

/**
 * Collect the set of FK property names from an entity's navigation properties.
 */
export function getFkPropertyNames(entity: ODataEntityType): Set<string> {
  const fkNames = new Set<string>();
  for (const nav of entity.navigationProperties) {
    if (!nav.isCollection && nav.fkPropertyName) {
      fkNames.add(nav.fkPropertyName);
    }
  }
  return fkNames;
}
