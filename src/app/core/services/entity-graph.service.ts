import { Injectable, inject } from '@angular/core';
import { MetadataStoreService } from './metadata-store.service';
import {
  SYSTEM_NAV_PROPERTIES,
  ODataNavigationProperty,
  ODataEntityType,
} from '../models/entity.model';
import { getVisibleProperties } from '../utils/entity-utils';
import { DiagramNode, DiagramConnection, GraphResult } from '../models/diagram.model';

export type { GraphResult } from '../models/diagram.model';

@Injectable({ providedIn: 'root' })
export class EntityGraphService {
  private readonly store = inject(MetadataStoreService);

  buildGraph(
    rootEntityName: string,
    depth: number = 1,
    options: {
      showSystemProperties?: boolean;
      showCollections?: boolean;
      maxNodes?: number;
    } = {}
  ): GraphResult {
    const {
      showSystemProperties = false,
      showCollections = false,
      maxNodes = 50,
    } = options;

    const nodes: DiagramNode[] = [];
    const connections: DiagramConnection[] = [];
    const visited = new Set<string>();
    const queue: Array<{ name: string; depth: number }> = [
      { name: rootEntityName, depth: 0 },
    ];

    while (queue.length > 0 && nodes.length < maxNodes) {
      const current = queue.shift()!;
      if (visited.has(current.name)) continue;

      const entity = this.store.getEntity(current.name);
      if (!entity) continue;

      visited.add(current.name);

      nodes.push({
        entityName: current.name,
        position: { x: 0, y: 0 },
        depth: current.depth,
        showInherited: false,
        showSystemProps: showSystemProperties,
      });

      if (current.depth >= depth) continue;

      // Compute which FK property names are actually visible on the card
      // (must match the canvas rendering logic: first N non-system properties)
      const visibleFkNames = this.getVisibleFkNames(entity, showSystemProperties);

      for (const nav of entity.navigationProperties) {
        if (!showSystemProperties && SYSTEM_NAV_PROPERTIES.has(nav.name)) {
          continue;
        }

        if (nav.isCollection && !showCollections) continue;

        // Only follow FK nav properties whose FK column is visible on the card
        if (!nav.isCollection && nav.fkPropertyName) {
          if (!visibleFkNames.has(nav.fkPropertyName)) continue;
        }

        const targetEntity = this.store.getEntity(nav.targetEntity);
        if (!targetEntity) continue;

        if (!nav.isCollection && nav.fkPropertyName) {
          connections.push(this.createConnection(entity.name, nav));
        } else if (nav.isCollection && showCollections) {
          connections.push(
            this.createCollectionConnection(entity.name, nav)
          );
        }

        if (!visited.has(nav.targetEntity) && nodes.length < maxNodes) {
          queue.push({
            name: nav.targetEntity,
            depth: current.depth + 1,
          });
        }
      }
    }

    // Deduplicate and filter to only visible nodes
    const nodeNameSet = new Set(nodes.map((n) => n.entityName));
    const seenConnections = new Set<string>();
    const filteredConnections = connections.filter((c) => {
      if (seenConnections.has(c.id)) return false;
      if (c.sourceEntity === c.targetEntity) return false; // Skip self-references
      if (!nodeNameSet.has(c.sourceEntity) || !nodeNameSet.has(c.targetEntity))
        return false;
      seenConnections.add(c.id);
      return true;
    });

    return { nodes, connections: filteredConnections };
  }

  /**
   * Row-level connections:
   *   outputId = "SourceEntity.FkPropertyName"  (e.g. "Opportunity.AccountId")
   *   inputId  = "TargetEntity.Id"              (e.g. "Account.Id")
   */
  private createConnection(
    sourceEntity: string,
    nav: ODataNavigationProperty
  ): DiagramConnection {
    const fk = nav.fkPropertyName!;
    const id = `${sourceEntity}.${fk}->${nav.targetEntity}.Id`;
    return {
      id,
      sourceEntity,
      sourceProperty: fk,
      targetEntity: nav.targetEntity,
      targetProperty: 'Id',
      type: 'many-to-one',
      outputId: `${sourceEntity}.${fk}`,
      inputId: `${nav.targetEntity}.Id`,
    };
  }

  private createCollectionConnection(
    sourceEntity: string,
    nav: ODataNavigationProperty
  ): DiagramConnection {
    const id = `${sourceEntity}.Id->${nav.targetEntity}.${nav.partner || nav.name}`;
    return {
      id,
      sourceEntity,
      sourceProperty: 'Id',
      targetEntity: nav.targetEntity,
      targetProperty: nav.partner || nav.name,
      type: 'one-to-many',
      outputId: `${sourceEntity}.Id`,
      inputId: `${nav.targetEntity}.Id`,
    };
  }

  /**
   * Returns the set of FK property names that will be visible on the entity card.
   * Must match the canvas rendering logic (first VISIBLE_PROP_LIMIT non-system properties).
   */
  private getVisibleFkNames(
    entity: ODataEntityType,
    showSystem: boolean
  ): Set<string> {
    const props = getVisibleProperties(entity, showSystem);
    const visiblePropNames = new Set(props.map((p) => p.name));

    // Find FK names that are in the visible set
    const visibleFks = new Set<string>();
    for (const nav of entity.navigationProperties) {
      if (!nav.isCollection && nav.fkPropertyName && visiblePropNames.has(nav.fkPropertyName)) {
        visibleFks.add(nav.fkPropertyName);
      }
    }
    return visibleFks;
  }
}
