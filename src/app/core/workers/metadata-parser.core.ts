/**
 * Parsing core for OData metadata XML.
 * DOMParser is NOT available in Web Workers, so we use regex-based parsing.
 * The OData metadata XML has a very regular, predictable structure which makes
 * string-based parsing reliable and fast.
 *
 * This module is imported by metadata-parser.worker.ts (the runtime entry point)
 * and by its spec (which can't reach into a worker's message handler).
 */

export interface WorkerProperty {
  name: string;
  type: string;
  nullable: boolean;
  isKey: boolean;
}

export interface WorkerNavProperty {
  name: string;
  targetEntity: string;
  isCollection: boolean;
  partner?: string;
  fkPropertyName?: string;
}

export interface WorkerEntity {
  name: string;
  namespace: string;
  baseType?: string;
  properties: WorkerProperty[];
  navigationProperties: WorkerNavProperty[];
  keyPropertyNames: string[];
}

export interface WorkerEntityIndex {
  name: string;
  propertyCount: number;
  navPropertyCount: number;
  relatedEntityNames: string[];
}

function extractAttr(tag: string, attr: string): string | undefined {
  // Match both single and double quoted attribute values
  const regex = new RegExp(`${attr}=["']([^"']*)["']`);
  const match = tag.match(regex);
  return match ? match[1] : undefined;
}

function extractNamespace(xml: string): string {
  const schemaMatch = xml.match(/<Schema\s[^>]*Namespace=["']([^"']*)["']/);
  return schemaMatch ? schemaMatch[1] : '';
}

function extractEntityTypes(xml: string): string[] {
  const entities: string[] = [];

  // Match self-closing EntityType or EntityType with content
  // The XML is minified so we need to handle both cases
  const regex = /<EntityType\s[^>]*Name=["'][^"']*["'][^>]*(?:\/>|>[\s\S]*?<\/EntityType>)/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    entities.push(match[0]);
  }
  return entities;
}

function parseEntityType(
  entityXml: string,
  namespace: string,
  allPropertyNames: Map<string, Set<string>>
): { entity: WorkerEntity; index: WorkerEntityIndex } {
  const entityName = extractAttr(entityXml, 'Name') || '';
  const baseTypeRaw = extractAttr(entityXml, 'BaseType');
  const baseType = baseTypeRaw
    ? baseTypeRaw.replace(namespace + '.', '')
    : undefined;

  // Extract key property names
  const keyPropertyNames: string[] = [];
  const keyRefRegex = /<PropertyRef\s[^>]*Name=["']([^"']*)["']/g;
  let keyMatch;
  while ((keyMatch = keyRefRegex.exec(entityXml)) !== null) {
    keyPropertyNames.push(keyMatch[1]);
  }
  const keySet = new Set(keyPropertyNames);

  // Extract Properties (but NOT NavigationProperty)
  // Use negative lookbehind to exclude NavigationProperty tags
  const properties: WorkerProperty[] = [];
  const propRegex = /(?<!Navigation)<Property\s[^>]*\/?>/g;
  let propMatch;
  while ((propMatch = propRegex.exec(entityXml)) !== null) {
    const tag = propMatch[0];
    const propName = extractAttr(tag, 'Name');
    if (!propName) continue;

    properties.push({
      name: propName,
      type: extractAttr(tag, 'Type') || 'Edm.String',
      nullable: extractAttr(tag, 'Nullable') !== 'false',
      isKey: keySet.has(propName),
    });
  }

  // Extract NavigationProperties
  const navigationProperties: WorkerNavProperty[] = [];
  const navRegex = /<NavigationProperty\s[^/>]*\/?>/g;
  const entityPropNames = allPropertyNames.get(entityName) || new Set();
  let navMatch;
  while ((navMatch = navRegex.exec(entityXml)) !== null) {
    const tag = navMatch[0];
    const navName = extractAttr(tag, 'Name');
    const typeAttr = extractAttr(tag, 'Type') || '';
    const partner = extractAttr(tag, 'Partner');

    if (!navName) continue;

    const isCollection = typeAttr.startsWith('Collection(');
    const targetEntity = typeAttr
      .replace('Collection(', '')
      .replace(')', '')
      .replace(namespace + '.', '');

    // Derive FK property name
    let fkPropertyName: string | undefined;
    if (!isCollection) {
      const candidateFk = navName + 'Id';
      if (entityPropNames.has(candidateFk)) {
        fkPropertyName = candidateFk;
      }
    }

    navigationProperties.push({
      name: navName,
      targetEntity,
      isCollection,
      partner,
      fkPropertyName,
    });
  }

  const relatedEntityNames = navigationProperties
    .filter((np) => !np.isCollection)
    .map((np) => np.targetEntity);

  return {
    entity: {
      name: entityName,
      namespace,
      baseType,
      properties,
      navigationProperties,
      keyPropertyNames,
    },
    index: {
      name: entityName,
      propertyCount: properties.length,
      navPropertyCount: navigationProperties.length,
      relatedEntityNames: [...new Set(relatedEntityNames)],
    },
  };
}

export interface ParseSuccess {
  entities: WorkerEntity[];
  entityIndex: WorkerEntityIndex[];
  namespace: string;
}

export type ParseOutcome = { result: ParseSuccess } | { error: string };

/**
 * The parse pipeline, lifted out of the worker's message handler so it can be
 * called directly. `onProgress` replaces the periodic postMessage.
 */
export function parseMetadataXml(
  xml: string,
  onProgress?: (percent: number) => void
): ParseOutcome {
  try {
    if (!xml.includes('<edmx:Edmx') && !xml.includes('<Edmx')) {
      return { error: 'Not a valid OData metadata XML file' };
    }

    const namespace = extractNamespace(xml);
    if (!namespace) {
      return { error: 'No Schema Namespace found in metadata' };
    }

    // First pass: collect all property names per entity for FK derivation
    const allPropertyNames = new Map<string, Set<string>>();
    const propNameRegex =
      /<EntityType\s[^>]*Name=["']([^"']*)["'][^>]*(?:\/>|>[\s\S]*?<\/EntityType>)/g;
    let entityBlock;
    while ((entityBlock = propNameRegex.exec(xml)) !== null) {
      const eName = extractAttr(entityBlock[0], 'Name') || '';
      const propNames = new Set<string>();
      const innerPropRegex = /<Property\s[^>]*Name=["']([^"']*)["']/g;
      let pm;
      while ((pm = innerPropRegex.exec(entityBlock[0])) !== null) {
        propNames.add(pm[1]);
      }
      allPropertyNames.set(eName, propNames);
    }

    // Second pass: parse all entity types
    const entityTypeStrings = extractEntityTypes(xml);
    const entities: WorkerEntity[] = [];
    const entityIndex: WorkerEntityIndex[] = [];

    for (let i = 0; i < entityTypeStrings.length; i++) {
      const { entity, index } = parseEntityType(
        entityTypeStrings[i],
        namespace,
        allPropertyNames
      );
      entities.push(entity);
      entityIndex.push(index);

      if (i > 0 && i % 500 === 0) {
        onProgress?.(Math.round((i / entityTypeStrings.length) * 100));
      }
    }

    return { result: { entities, entityIndex, namespace } };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Unknown parsing error' };
  }
}
