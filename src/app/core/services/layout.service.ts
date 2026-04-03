import { Injectable } from '@angular/core';
import * as dagre from 'dagre';
import { DiagramNode, DiagramConnection } from '../models/diagram.model';

const NODE_WIDTH = 280;
const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 44;
const PADDING_Y = 16;
const MIN_NODE_HEIGHT = 100;

@Injectable({ providedIn: 'root' })
export class LayoutService {
  computeLayout(
    nodes: DiagramNode[],
    connections: DiagramConnection[],
    direction: 'LR' | 'TB' = 'LR',
    getPropertyCount?: (entityName: string) => number
  ): DiagramNode[] {
    if (nodes.length === 0) return [];

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: direction,
      nodesep: direction === 'TB' ? 120 : 100,
      ranksep: direction === 'TB' ? 200 : 240,
      marginx: 60,
      marginy: 60,
      edgesep: 40,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
      const propCount = getPropertyCount
        ? getPropertyCount(node.entityName)
        : 8;
      const height = Math.max(
        MIN_NODE_HEIGHT,
        HEADER_HEIGHT + propCount * ROW_HEIGHT + PADDING_Y
      );
      g.setNode(node.entityName, { width: NODE_WIDTH, height });
    }

    const nodeNames = new Set(nodes.map((n) => n.entityName));
    for (const conn of connections) {
      if (
        nodeNames.has(conn.sourceEntity) &&
        nodeNames.has(conn.targetEntity)
      ) {
        g.setEdge(conn.sourceEntity, conn.targetEntity);
      }
    }

    dagre.layout(g);

    return nodes.map((node) => {
      const dagreNode = g.node(node.entityName);
      return {
        ...node,
        position: {
          x: Math.round(dagreNode.x - NODE_WIDTH / 2),
          y: Math.round(
            dagreNode.y - dagreNode.height / 2
          ),
        },
      };
    });
  }
}
