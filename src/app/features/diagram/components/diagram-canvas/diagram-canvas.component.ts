import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  OnChanges,
  SimpleChanges,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FFlowModule, FCanvasComponent, FFlowComponent } from '@foblex/flow';
import { BadgeComponent, BadgeVariant } from '../../../../shared/atoms/badge/badge.component';
import { IconComponent } from '../../../../shared/atoms/icon/icon.component';
import { DiagramNode, DiagramConnection } from '../../../../core/models/diagram.model';
import {
  ODataEntityType,
  ODataProperty,
  SYSTEM_NAV_PROPERTIES,
  getEdmTypeShort,
  getEdmTypeColor,
} from '../../../../core/models/entity.model';
import { MetadataStoreService } from '../../../../core/services/metadata-store.service';
import { getVisibleProperties, getFkPropertyNames, VISIBLE_NAV_LIMIT } from '../../../../core/utils/entity-utils';

interface EntityView {
  entity: ODataEntityType;
  node: DiagramNode;
  visibleProps: ODataProperty[];
  fkPropNames: Set<string>;
  visibleNavs: { name: string; targetEntity: string }[];
}

@Component({
  selector: 'em-diagram-canvas',
  standalone: true,
  imports: [CommonModule, FFlowModule, BadgeComponent, IconComponent],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="em-canvas-host">
      <f-flow #flow fDraggable (fLoaded)="onFlowLoaded()">
        <f-canvas #canvas fZoom [fZoomMinimum]="0.1" [fZoomMaximum]="3">

          <!-- Entity nodes — each is an fNode with row-level connectors -->
          @for (ev of entityViews(); track ev.entity.name) {
            <div fNode fDragHandle
              [fNodeId]="ev.entity.name"
              [fNodePosition]="ev.node.position"
              class="em-table"
              [class.em-table--root]="ev.node.depth === 0"
              [class.em-table--active]="ev.entity.name === activeEntityName"
              (click)="onNodeClick(ev.entity.name, $event)"
            >
              <!-- Header -->
              <div class="em-table-header"
                [class.em-table-header--root]="ev.node.depth === 0">
                <div class="em-table-header__left">
                  <em-icon name="database" [size]="14" />
                  <span class="em-table-header__name">{{ ev.entity.name }}</span>
                </div>
                <div class="em-table-header__right">
                  <em-badge [text]="ev.entity.properties.length + ' cols'" variant="count" />
                  <em-badge [text]="ev.visibleNavs.length + ' rels'" variant="count" />
                </div>
              </div>

              <!-- Property rows with connectors -->
              @for (prop of ev.visibleProps; track prop.name) {
                <div class="em-col"
                  [class.em-col--key]="prop.isKey"
                  [class.em-col--fk]="ev.fkPropNames.has(prop.name)"
                >
                  <div fNodeInput [fInputId]="ev.entity.name + '.' + prop.name"
                       fInputConnectableSide="calculate" class="em-conn em-conn-in"></div>
                  <div fNodeOutput [fOutputId]="ev.entity.name + '.' + prop.name"
                       fOutputConnectableSide="calculate" [isSelfConnectable]="false"
                       class="em-conn em-conn-out"></div>

                  <span class="em-col__icon">
                    @if (prop.isKey) {
                      <em-icon name="key" [size]="11" />
                    } @else if (ev.fkPropNames.has(prop.name)) {
                      <em-icon name="link" [size]="11" />
                    }
                  </span>
                  <span class="em-col__name">{{ prop.name }}</span>
                  <em-badge [text]="typeShort(prop.type)" [variant]="typeColor(prop.type)" />
                </div>
              }

              <!-- Relationship summary rows -->
              @if (ev.visibleNavs.length > 0) {
                <div class="em-divider"></div>
                <div class="em-section-label">RELATIONSHIPS</div>
                @for (nav of ev.visibleNavs; track nav.name) {
                  <button class="em-rel" (click)="entityNavigated.emit(nav.targetEntity)">
                    <em-icon name="link" [size]="11" />
                    <span class="em-rel__name">{{ nav.name }}</span>
                    <em-badge [text]="nav.targetEntity" variant="fk" />
                  </button>
                }
              }
            </div>
          }

          <!-- Row-to-row connections -->
          @for (conn of connections; track conn.id) {
            <f-connection
              [fConnectionId]="conn.id"
              fBehavior="fixed"
              fType="segment"
              [fOutputId]="conn.outputId"
              [fInputId]="conn.inputId"
            />
          }

          <f-connection-for-create fBehavior="fixed" fType="segment" />

        </f-canvas>
      </f-flow>

      @if (entityViews().length === 0 && !loading) {
        <div class="em-canvas-empty">
          <em-icon name="database" [size]="48" />
          <h3>Select an entity to explore</h3>
          <p>Use the search bar to find and select an entity</p>
        </div>
      }

      @if (loading) {
        <div class="em-canvas-loading">
          <div class="em-spinner"></div>
          <p>Building diagram...</p>
        </div>
      }
    </div>
  `,
  styles: [`
    em-diagram-canvas { display: block; width: 100%; height: 100%; }
    .em-canvas-host { width: 100%; height: 100%; background: var(--em-color-bg-canvas); }
    .em-canvas-host f-flow { width: 100%; height: 100%; }

    /* === Table node === */
    .em-table {
      width: 280px;
      background: var(--em-color-bg-node);
      border: 1px solid var(--em-color-border-node);
      border-radius: 8px;
      box-shadow: var(--em-shadow-node);
      overflow: visible;
    }
    .em-table:hover { box-shadow: var(--em-shadow-node-hover); }
    .em-table--root { border-color: var(--em-color-border-node-root); border-width: 2px; }
    .em-table--active {
      border-color: var(--em-color-accent) !important;
      border-width: 2px;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2), var(--em-shadow-node-hover) !important;
    }

    /* === Header === */
    .em-table-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; min-height: 40px;
      background: var(--em-color-bg-node-header);
      border-bottom: 1px solid var(--em-color-border-node);
      border-radius: 8px 8px 0 0; cursor: grab;
    }
    .em-table-header--root { background: var(--em-color-bg-node-root); }
    .em-table-header__left {
      display: flex; align-items: center; gap: 8px;
      flex: 1; min-width: 0; color: var(--em-color-text-primary);
    }
    .em-table-header__name {
      font-weight: 600; font-size: 13px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .em-table-header__right { display: flex; gap: 4px; flex-shrink: 0; margin-left: 8px; }

    /* === Column row === */
    .em-col {
      position: relative;
      display: flex; align-items: center; gap: 4px;
      height: 28px; padding: 0 12px; font-size: 11px;
    }
    .em-col:hover { background: var(--em-color-bg-hover); }
    .em-col--key .em-col__name { font-weight: 600; }
    .em-col__icon {
      display: flex; align-items: center; width: 16px;
      flex-shrink: 0; color: var(--em-color-text-muted);
    }
    .em-col__name {
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--em-color-text-primary);
      font-family: var(--em-font-mono); font-size: 11px;
    }

    /* === Row-level connector hit areas === */
    .em-conn { position: absolute; background: transparent; width: 56px; height: 100%; top: 0; }
    .em-conn-in  { left: -8px; }
    .em-conn-out { right: -8px; }

    /* === Relationship rows === */
    .em-divider { height: 1px; background: var(--em-color-border); margin: 2px 12px; }
    .em-section-label {
      padding: 4px 12px; font-size: 10px; font-weight: 600;
      color: var(--em-color-text-muted); letter-spacing: 0.05em;
    }
    .em-rel {
      display: flex; align-items: center; gap: 4px; width: 100%;
      height: 26px; padding: 0 12px;
      border: none; background: transparent; color: var(--em-color-text-secondary);
      font-size: 11px; text-align: left; cursor: pointer;
    }
    .em-rel:hover { background: var(--em-color-bg-hover); color: var(--em-color-text-link); }
    .em-rel__name {
      flex: 1; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; font-family: var(--em-font-mono);
    }

    /* === Connection path styles (CRITICAL — Foblex has no default stroke) === */
    .f-connection-path {
      stroke: var(--em-color-fk) !important;
      stroke-width: 2px !important;
      fill: none !important;
    }
    .f-connection.f-selected .f-connection-path {
      stroke: var(--em-color-accent-hover) !important;
      stroke-width: 3px !important;
    }
    .f-connection circle { fill: transparent; stroke: none; }

    /* === Empty / Loading === */
    .em-canvas-empty {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; pointer-events: none; color: var(--em-color-text-muted);
      h3 { font-size: 16px; font-weight: 600; color: var(--em-color-text-secondary); }
      p { font-size: 13px; }
      em-icon { opacity: 0.3; }
    }
    .em-canvas-loading {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; color: var(--em-color-text-muted); font-size: 13px;
    }
    .em-spinner {
      width: 32px; height: 32px; border: 3px solid var(--em-color-border);
      border-top-color: var(--em-color-accent); border-radius: 50%;
      animation: em-spin 0.8s linear infinite;
    }
    @keyframes em-spin { to { transform: rotate(360deg); } }
  `],
})
export class DiagramCanvasComponent implements OnChanges {
  private readonly store = inject(MetadataStoreService);

  @ViewChild('canvas') canvas!: FCanvasComponent;
  @ViewChild('flow') flow!: FFlowComponent;

  @Input() nodes: DiagramNode[] = [];
  @Input() connections: DiagramConnection[] = [];
  @Input() showSystemProps = false;
  @Input() loading = false;
  @Input() activeEntityName: string | null = null;

  @Output() entityNavigated = new EventEmitter<string>();
  @Output() entityActivated = new EventEmitter<string>();

  readonly entityViews = signal<EntityView[]>([]);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['nodes'] || changes['showSystemProps']) {
      // Reset Foblex state before loading new data
      try { this.flow?.clearSelection(); } catch { /* */ }
      try { this.flow?.reset(); } catch { /* */ }

      this.rebuildViews();
      this.scheduleRedrawAndFit();
    }
  }

  onFlowLoaded(): void {
    this.scheduleRedrawAndFit();
  }

  fitToScreen(): void {
    try { this.canvas?.fitToScreen({ x: 40, y: 40 }, false); } catch { /* */ }
  }

  onNodeClick(entityName: string, event: MouseEvent): void {
    // Don't activate if clicking a button/link inside the node
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) return;
    this.entityActivated.emit(entityName);
  }

  typeShort(t: string): string { return getEdmTypeShort(t); }
  typeColor(t: string): BadgeVariant { return getEdmTypeColor(t) as BadgeVariant; }

  private rebuildViews(): void {
    const views: EntityView[] = [];
    for (const node of this.nodes) {
      const entity = this.store.getEntity(node.entityName);
      if (!entity) continue;

      const showSys = this.showSystemProps || node.showSystemProps;
      const fkPropNames = getFkPropertyNames(entity);
      const props = getVisibleProperties(entity, showSys);

      let navs = entity.navigationProperties.filter((n) => !n.isCollection);
      if (!showSys) navs = navs.filter((n) => !SYSTEM_NAV_PROPERTIES.has(n.name));
      const visibleNavs = navs.slice(0, VISIBLE_NAV_LIMIT).map((n) => ({ name: n.name, targetEntity: n.targetEntity }));

      views.push({ entity, node, visibleProps: props, fkPropNames, visibleNavs });
    }
    this.entityViews.set(views);
  }

  private scheduleRedrawAndFit(): void {
    setTimeout(() => {
      try { this.flow?.redraw(); } catch { /* */ }
      setTimeout(() => this.fitToScreen(), 200);
    }, 300);
  }
}
