import { Injectable, inject } from '@angular/core';
import { EntityGraphService } from './entity-graph.service';
import { LayoutService } from './layout.service';
import { MetadataStoreService } from './metadata-store.service';
import { DiagramNode, DiagramConnection } from '../models/diagram.model';

export interface BuildDiagramOptions {
  showSystemProps: boolean;
  layoutDirection: 'LR' | 'TB';
  maxNodes: number;
}

export interface BuildDiagramResult {
  nodes: DiagramNode[];
  connections: DiagramConnection[];
}

@Injectable({ providedIn: 'root' })
export class DiagramFacadeService {
  private readonly graphService = inject(EntityGraphService);
  private readonly layoutService = inject(LayoutService);
  private readonly store = inject(MetadataStoreService);

  buildDiagram(
    entityName: string,
    depth: number,
    options: BuildDiagramOptions
  ): BuildDiagramResult {
    const graph = this.graphService.buildGraph(entityName, depth, {
      showSystemProperties: options.showSystemProps,
      showCollections: false,
      maxNodes: options.maxNodes,
    });

    const layoutNodes = this.layoutService.computeLayout(
      graph.nodes,
      graph.connections,
      options.layoutDirection,
      (name) => {
        const entity = this.store.getEntity(name);
        return entity ? Math.min(entity.properties.length, 10) : 8;
      }
    );

    return { nodes: layoutNodes, connections: graph.connections };
  }
}
