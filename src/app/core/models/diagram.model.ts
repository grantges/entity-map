export interface DiagramNode {
  entityName: string;
  position: { x: number; y: number };
  depth: number;
  showInherited: boolean;
  showSystemProps: boolean;
}

export interface DiagramConnection {
  id: string;
  sourceEntity: string;
  sourceProperty: string;
  targetEntity: string;
  targetProperty: string;
  type: 'many-to-one' | 'one-to-many';
  outputId: string;
  inputId: string;
}

export interface GraphResult {
  nodes: DiagramNode[];
  connections: DiagramConnection[];
}

export interface DiagramState {
  selectedEntity: string | null;
  depth: number;
  nodes: DiagramNode[];
  connections: DiagramConnection[];
  layoutDirection: 'LR' | 'TB';
  showSystemProperties: boolean;
  showCollectionRelationships: boolean;
}
