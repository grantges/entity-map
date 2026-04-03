// === Creatio Data Types (mapped to C# / OData) ===
export interface CreatioDataType {
  name: string;
  csharpType: string;
  edmType: string;
  description: string;
  requiresLookup?: boolean; // If true, needs a linked entity (e.g., Lookup → Guid FK)
}

export const CREATIO_DATA_TYPES: CreatioDataType[] = [
  { name: 'Text (50)',       csharpType: 'string',         edmType: 'Edm.String',          description: 'Short text, max 50 chars' },
  { name: 'Text (250)',      csharpType: 'string',         edmType: 'Edm.String',          description: 'Medium text, max 250 chars' },
  { name: 'Text (500)',      csharpType: 'string',         edmType: 'Edm.String',          description: 'Long text, max 500 chars' },
  { name: 'Text (unlimited)', csharpType: 'string',        edmType: 'Edm.String',          description: 'Unlimited length text' },
  { name: 'Integer',         csharpType: 'int',            edmType: 'Edm.Int32',           description: '32-bit integer' },
  { name: 'Float',           csharpType: 'decimal',        edmType: 'Edm.Decimal',         description: 'Decimal number' },
  { name: 'Money',           csharpType: 'decimal',        edmType: 'Edm.Decimal',         description: 'Currency value (2 decimals)' },
  { name: 'Date/Time',       csharpType: 'DateTime',       edmType: 'Edm.DateTimeOffset',  description: 'Date and time' },
  { name: 'Date',            csharpType: 'DateTime',       edmType: 'Edm.DateTimeOffset',  description: 'Date only' },
  { name: 'Time',            csharpType: 'DateTime',       edmType: 'Edm.DateTimeOffset',  description: 'Time only' },
  { name: 'Boolean',         csharpType: 'bool',           edmType: 'Edm.Boolean',         description: 'True/False' },
  { name: 'Lookup',          csharpType: 'Guid',           edmType: 'Edm.Guid',            description: 'FK reference to another entity', requiresLookup: true },
  { name: 'Unique identifier', csharpType: 'Guid',         edmType: 'Edm.Guid',            description: 'GUID identifier' },
  { name: 'Image',           csharpType: 'byte[]',         edmType: 'Edm.Stream',          description: 'Image/binary data' },
  { name: 'Binary',          csharpType: 'byte[]',         edmType: 'Edm.Binary',          description: 'Binary data' },
];

export function getCreatioTypeByEdm(edmType: string): CreatioDataType {
  return CREATIO_DATA_TYPES.find((t) => t.edmType === edmType) || CREATIO_DATA_TYPES[0];
}

// === OData / EDM Types ===
export type EdmType =
  | 'Edm.Guid'
  | 'Edm.String'
  | 'Edm.DateTimeOffset'
  | 'Edm.Int32'
  | 'Edm.Boolean'
  | 'Edm.Decimal'
  | 'Edm.Stream'
  | 'Edm.Binary'
  | 'Edm.Int64'
  | 'Edm.Double'
  | 'Edm.Single'
  | 'Edm.Int16'
  | 'Edm.Byte'
  | 'Edm.SByte'
  | 'Edm.TimeOfDay'
  | 'Edm.Duration'
  | 'Edm.Geography'
  | 'Edm.Geometry';

export interface ODataProperty {
  name: string;
  type: EdmType | string;
  nullable: boolean;
  isKey: boolean;
  isCustom?: boolean;
  creatioType?: string;       // Creatio type name (e.g., "Lookup", "Text (250)")
  linkedEntity?: string;      // For Lookup types: the target entity name
}

export interface ODataNavigationProperty {
  name: string;
  targetEntity: string;
  isCollection: boolean;
  partner?: string;
  fkPropertyName?: string;
}

export interface ODataEntityType {
  name: string;
  namespace: string;
  baseType?: string;
  properties: ODataProperty[];
  navigationProperties: ODataNavigationProperty[];
  keyPropertyNames: string[];
  isCustom?: boolean;
}

export interface EntityIndex {
  name: string;
  propertyCount: number;
  navPropertyCount: number;
  relatedEntityNames: string[];
}

export interface ParseResult {
  entities: ODataEntityType[];
  entityIndex: EntityIndex[];
  namespace: string;
}

// === User-added metadata (descriptions, stored in localStorage) ===
export interface EntityMetadata {
  description?: string;
  columnDescriptions: Record<string, string>; // propName -> description
}

export const SYSTEM_NAV_PROPERTIES = new Set([
  'CreatedBy',
  'ModifiedBy',
]);

export const SYSTEM_PROPERTIES = new Set([
  'CreatedOn',
  'CreatedById',
  'ModifiedOn',
  'ModifiedById',
  'ProcessListeners',
]);

export function getEdmTypeShort(type: string): string {
  return type.replace('Edm.', '');
}

export function getEdmTypeColor(type: string): string {
  const map: Record<string, string> = {
    'Edm.Guid': 'guid',
    'Edm.String': 'string',
    'Edm.DateTimeOffset': 'datetime',
    'Edm.Int32': 'int',
    'Edm.Int64': 'int',
    'Edm.Int16': 'int',
    'Edm.Boolean': 'bool',
    'Edm.Decimal': 'decimal',
    'Edm.Double': 'decimal',
    'Edm.Single': 'decimal',
    'Edm.Stream': 'stream',
    'Edm.Binary': 'binary',
  };
  return map[type] ?? 'string';
}
