import {
  Component,
  inject,
  signal,
  computed,
  effect,
  HostListener,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToolbarComponent } from '../../../../shared/organisms/toolbar/toolbar.component';
import { SidebarComponent } from '../../../../shared/organisms/sidebar/sidebar.component';
import { ExportDialogComponent } from '../../../../shared/organisms/export-dialog/export-dialog.component';
import { DiagramCanvasComponent } from '../../components/diagram-canvas/diagram-canvas.component';
import { UploadScreenComponent } from '../../components/upload-screen/upload-screen.component';
import { MetadataStoreService } from '../../../../core/services/metadata-store.service';
import { DiagramFacadeService } from '../../../../core/services/diagram-facade.service';
import { SchemaExportService } from '../../../../core/services/schema-export.service';
import { DocExportService } from '../../../../core/services/doc-export.service';
import { AiService } from '../../../../core/services/ai.service';
import { BaselineService } from '../../../../core/services/baseline.service';
import { EnvironmentStorageService } from '../../../../core/services/environment-storage.service';
import { DiagramNode, DiagramConnection } from '../../../../core/models/diagram.model';
import { ODataProperty, ODataEntityType } from '../../../../core/models/entity.model';
import { ToastService } from '../../../../core/services/toast.service';
import { SettingsDialogComponent } from '../../../../shared/organisms/settings-dialog/settings-dialog.component';
import { ToastContainerComponent } from '../../../../shared/atoms/toast/toast.component';
import { TabBarComponent, EntityTab } from '../../../../shared/molecules/tab-bar/tab-bar.component';
import { SearchDropdownComponent } from '../../../../shared/molecules/search-dropdown/search-dropdown.component';
import { IconComponent } from '../../../../shared/atoms/icon/icon.component';

@Component({
  selector: 'em-diagram-page',
  standalone: true,
  imports: [
    CommonModule,
    ToolbarComponent,
    SidebarComponent,
    ExportDialogComponent,
    SettingsDialogComponent,
    ToastContainerComponent,
    TabBarComponent,
    DiagramCanvasComponent,
    UploadScreenComponent,
    SearchDropdownComponent,
    IconComponent,
  ],
  template: `
    @if (!store.loaded()) {
      <em-upload-screen (environmentReady)="onEnvironmentReady()" />
    } @else {
      <!-- Main App -->
      <div class="app-layout">
        <em-toolbar
          #toolbar
          [entityIndex]="store.entityIndex()"
          [entityCount]="store.entityCount()"
          [selectedEntity]="selectedEntity()"
          [depth]="depth()"
          [showSystemProps]="showSystemProps()"
          [layoutDirection]="layoutDirection()"
          (entitySelected)="onEntitySelected($event)"
          (depthChange)="onDepthChange($event)"
          (showSystemPropsChange)="showSystemProps.set($event)"
          (layoutDirectionChange)="layoutDirection.set($event)"
          (fitToScreen)="diagramCanvas?.fitToScreen()"
          (openSidebar)="sidebarOpen.set(true)"
          (openExport)="exportOpen.set(true)"
          (openSettings)="settingsOpen.set(true)"
        />

        <em-tab-bar
          [tabs]="tabs()"
          (tabClicked)="onTabClicked($event)"
          (tabClosed)="onTabClosed($event)"
        />

        <div class="app-layout__content">
          @if (!selectedEntity()) {
            <!-- Empty state -->
            <div class="empty-state">
              <div class="empty-state__icon">
                <em-icon name="database" [size]="48" />
              </div>
              <h2 class="empty-state__heading">Select an entity to explore</h2>
              <p class="empty-state__subtitle">
                Search for an entity using the search bar above or press
                <kbd class="empty-state__kbd">&#8984;K</kbd>
              </p>
              <div class="empty-state__search">
                <em-search-dropdown
                  [items]="store.entityIndex()"
                  [selectedEntity]="null"
                  placeholder="Search entities..."
                  (entitySelected)="onEntitySelected($event)"
                />
              </div>
            </div>
          } @else {
            <em-diagram-canvas
              #diagramCanvas
              [nodes]="nodes()"
              [connections]="connections()"
              [showSystemProps]="showSystemProps()"
              [loading]="diagramLoading()"
              [activeEntityName]="activeEntity()"
              (entityNavigated)="onEntitySelected($event)"
              (entityActivated)="onEntityActivated($event)"
            />
          }

          <em-sidebar
            [entity]="activeEntityData()"
            [isOpen]="sidebarOpen()"
            (closed)="sidebarOpen.set(false)"
            (navigateToEntity)="onEntitySelected($event)"
            (propertyAdded)="onPropertyAdded($event)"
            (removeCustomProperty)="onRemoveCustomProperty($event)"
            (entityCreated)="onEntityCreated($event)"
          />
        </div>

        <em-export-dialog
          [isOpen]="exportOpen()"
          [entityNames]="currentEntityNames()"
          (closed)="exportOpen.set(false)"
          (exportSchema)="onExportSchema($event)"
          (exportDocs)="onExportDocs($event)"
        />

        <em-settings-dialog
          [isOpen]="settingsOpen()"
          [currentEnvironmentName]="currentEnvironmentName()"
          (closed)="settingsOpen.set(false)"
          (switchEnvironment)="onSwitchEnvironment()"
          (clearCustomData)="onClearCustomData()"
        />
      </div>
    }

    <em-toast-container />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
      }

      /* Main App Layout */
      .app-layout {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
      }

      .app-layout__content {
        flex: 1;
        position: relative;
        overflow: hidden;
      }

      /* Empty state */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: var(--em-space-3);
        background: var(--em-color-bg-canvas);
      }

      .empty-state__icon {
        color: var(--em-color-text-muted);
        opacity: 0.4;
        margin-bottom: var(--em-space-2);
      }

      .empty-state__heading {
        font-size: var(--em-font-size-xl, 20px);
        font-weight: var(--em-font-weight-bold, 700);
        color: var(--em-color-text-primary);
        margin: 0;
      }

      .empty-state__subtitle {
        font-size: var(--em-font-size-sm, 13px);
        color: var(--em-color-text-muted);
        margin: 0;
      }

      .empty-state__kbd {
        display: inline-block;
        padding: 1px 6px;
        font-size: 11px;
        font-family: inherit;
        background: var(--em-color-bg-secondary);
        border: 1px solid var(--em-color-border);
        border-radius: var(--em-radius-sm, 4px);
        box-shadow: 0 1px 0 var(--em-color-border);
      }

      .empty-state__search {
        margin-top: var(--em-space-3);
        width: 360px;
        max-width: 90%;
      }
    `,
  ],
})
export class DiagramPageComponent {
  readonly store = inject(MetadataStoreService);
  readonly aiService = inject(AiService);
  readonly baselineService = inject(BaselineService);
  private readonly diagramFacade = inject(DiagramFacadeService);
  private readonly schemaExport = inject(SchemaExportService);
  private readonly docExport = inject(DocExportService);
  private readonly envService = inject(EnvironmentStorageService);
  private readonly toast = inject(ToastService);

  @ViewChild('diagramCanvas') diagramCanvas?: DiagramCanvasComponent;
  @ViewChild('toolbar') toolbar?: ToolbarComponent;

  // Tab state (persisted per environment)
  private readonly _tabs = signal<string[]>([]);
  readonly tabs = computed<EntityTab[]>(() => {
    const selected = this.selectedEntity();
    return this._tabs().map((name) => ({ entityName: name, active: name === selected }));
  });

  private get tabStorageKey(): string {
    return `em-tabs-${this.store.environmentId()}`;
  }

  private saveTabs(): void {
    const envId = this.store.environmentId();
    if (envId) {
      localStorage.setItem(this.tabStorageKey, JSON.stringify(this._tabs()));
    }
  }

  private loadTabs(): void {
    try {
      const json = localStorage.getItem(this.tabStorageKey);
      if (json) {
        const tabs = JSON.parse(json) as string[];
        // Only keep tabs for entities that still exist
        const valid = tabs.filter((t) => this.store.getEntity(t));
        this._tabs.set(valid);
        if (valid.length > 0) {
          const last = valid[valid.length - 1];
          this.selectedEntity.set(last);
          this.activeEntity.set(last);
          this.rebuildDiagram();
        }
      }
    } catch { /* ignore */ }
  }

  // State
  readonly selectedEntity = signal<string | null>(null);
  readonly activeEntity = signal<string | null>(null);
  readonly depth = signal(1);
  readonly showSystemProps = signal(false);
  readonly layoutDirection = signal<'LR' | 'TB'>('LR');
  readonly sidebarOpen = signal(false);
  readonly exportOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly diagramLoading = signal(false);

  readonly nodes = signal<DiagramNode[]>([]);
  readonly connections = signal<DiagramConnection[]>([]);

  readonly currentEnvironmentName = computed(() => {
    const envId = this.store.environmentId();
    if (!envId) return '';
    const env = this.envService.environments().find((e) => e.id === envId);
    return env?.name || '';
  });

  readonly activeEntityData = computed(() => {
    const name = this.activeEntity();
    if (!name) return null;
    return this.store.getEntity(name) || null;
  });

  readonly currentEntityNames = computed(() =>
    this.nodes().map((n) => n.entityName)
  );

  constructor() {
    // Rebuild diagram when layout direction or system props change
    effect(() => {
      const dir = this.layoutDirection();
      const sys = this.showSystemProps();
      if (this.selectedEntity()) {
        this.rebuildDiagram();
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Only handle shortcuts when the main app is loaded
    if (!this.store.loaded()) return;

    const mod = event.metaKey || event.ctrlKey;

    if (mod && event.key === 'k') {
      event.preventDefault();
      this.toolbar?.focusSearch();
      return;
    }

    if (mod && event.key === 'e') {
      event.preventDefault();
      this.exportOpen.update((v) => !v);
      return;
    }

    if (mod && event.key === ',') {
      event.preventDefault();
      this.settingsOpen.update((v) => !v);
      return;
    }

    if (mod && event.key === '\\') {
      event.preventDefault();
      this.sidebarOpen.update((v) => !v);
      return;
    }

    if (mod && event.key === '.') {
      event.preventDefault();
      this.showSystemProps.update((v) => !v);
      return;
    }

    if (mod && event.key === 'f') {
      event.preventDefault();
      this.diagramCanvas?.fitToScreen();
      return;
    }

    if (mod && event.key === 'w') {
      event.preventDefault();
      const current = this.selectedEntity();
      if (current) {
        this.onTabClosed(current);
      }
      return;
    }

    if (event.key === 'Escape') {
      this.sidebarOpen.set(false);
      this.exportOpen.set(false);
      this.settingsOpen.set(false);
    }
  }

  onEnvironmentReady(): void {
    // Environment is now loaded — restore persisted tabs if any
    this.loadTabs();
  }

  // Entity selection and diagram building
  onEntitySelected(entityName: string): void {
    if (!entityName) {
      this.selectedEntity.set(null);
      this.nodes.set([]);
      this.connections.set([]);
      return;
    }

    // Add tab if not already open
    if (!this._tabs().includes(entityName)) {
      this._tabs.update((tabs) => [...tabs, entityName]);
    }

    this.selectedEntity.set(entityName);
    this.activeEntity.set(entityName);
    this.sidebarOpen.set(false);
    this.saveTabs();
    this.rebuildDiagram();
  }

  onTabClicked(entityName: string): void {
    if (this.selectedEntity() === entityName) return;
    this.selectedEntity.set(entityName);
    this.activeEntity.set(entityName);
    this.rebuildDiagram();
  }

  onTabClosed(entityName: string): void {
    const tabs = this._tabs().filter((t) => t !== entityName);
    this._tabs.set(tabs);
    this.saveTabs();

    // If closing the active tab, switch to the last remaining tab (or clear)
    if (this.selectedEntity() === entityName) {
      if (tabs.length > 0) {
        const newActive = tabs[tabs.length - 1];
        this.selectedEntity.set(newActive);
        this.activeEntity.set(newActive);
        this.rebuildDiagram();
      } else {
        this.selectedEntity.set(null);
        this.activeEntity.set(null);
        this.nodes.set([]);
        this.connections.set([]);
      }
    }
  }

  onEntityActivated(entityName: string): void {
    this.activeEntity.set(entityName);
    this.sidebarOpen.set(true);
  }

  onDepthChange(depth: number): void {
    this.depth.set(depth);
    this.rebuildDiagram();
  }

  private rebuildDiagram(): void {
    const entityName = this.selectedEntity();
    if (!entityName) return;

    this.diagramLoading.set(true);

    setTimeout(() => {
      const result = this.diagramFacade.buildDiagram(entityName, this.depth(), {
        showSystemProps: this.showSystemProps(),
        layoutDirection: this.layoutDirection(),
        maxNodes: 50,
      });

      this.nodes.set(result.nodes);
      this.connections.set(result.connections);
      this.diagramLoading.set(false);
    }, 50);
  }

  // Property management
  onPropertyAdded(property: ODataProperty): void {
    const entityName = this.activeEntity();
    if (!entityName) return;
    this.store.addCustomProperty(entityName, property);
    this.rebuildDiagram();
  }

  onRemoveCustomProperty(propertyName: string): void {
    const entityName = this.activeEntity();
    if (!entityName) return;
    this.store.removeCustomProperty(entityName, propertyName);
    this.rebuildDiagram();
  }

  onEntityCreated(entity: ODataEntityType): void {
    this.store.addCustomEntity(entity);
    this.onEntitySelected(entity.name);
  }

  // Settings
  onSwitchEnvironment(): void {
    this.settingsOpen.set(false);
    this.store.reset();
    this._tabs.set([]);
    this.selectedEntity.set(null);
    this.activeEntity.set(null);
    this.nodes.set([]);
    this.connections.set([]);
  }

  onClearCustomData(): void {
    this.store.clearCustomData();
    this.rebuildDiagram();
  }

  // Export
  onExportSchema(options: { packageName: string; customOnly: boolean }): void {
    const entityNames = this.currentEntityNames();
    const xml = this.schemaExport.exportCreatioSchema({
      entities: entityNames,
      includeCustomOnly: options.customOnly,
      packageName: options.packageName,
    });
    this.schemaExport.downloadSchema(xml, `${options.packageName}.xml`);
  }

  onExportDocs(options: {
    aiEnhanced: boolean;
    aiDescriptionMode: 'fill-missing' | 'override-all';
    deltaOnly: boolean;
    baselineId: string | null;
  }): void {
    let entityNames = this.currentEntityNames();
    let diff: import('../../../../core/services/baseline.service').SchemaDiff | null = null;

    if (options.deltaOnly && options.baselineId) {
      diff = this.baselineService.diffAgainstBaseline(options.baselineId);
      if (diff) {
        const changedNames = new Set([
          ...diff.addedEntities.map((e) => e.name),
          ...diff.modifiedEntities.map((e) => e.entityName),
          ...diff.removedEntityNames,
        ]);
        if (changedNames.size === 0) {
          this.toast.info('No changes detected between the current schema and the selected baseline.');
          return;
        }
        entityNames = entityNames.filter((n) => changedNames.has(n));
      }
    }

    if (entityNames.length === 0 && (!diff || diff.removedEntityNames.length === 0)) {
      this.toast.info('No entities to export.');
      return;
    }

    const toastId = this.toast.progress(
      'Exporting documentation...',
      options.aiEnhanced
        ? `Generating AI descriptions for ${entityNames.length} entities`
        : `${entityNames.length} entities`
    );

    this.docExport
      .exportToWord(entityNames, options.aiEnhanced, options.aiDescriptionMode, diff ?? undefined, this.currentEnvironmentName())
      .then(() => {
        this.toast.update(toastId, {
          type: 'success',
          message: 'Documentation exported!',
          detail: 'Your .docx file has been downloaded.',
        });
        setTimeout(() => this.toast.dismiss(toastId), 5000);
      })
      .catch((err) => {
        this.toast.update(toastId, {
          type: 'error',
          message: 'Export failed',
          detail: err.message || 'An unexpected error occurred.',
        });
        setTimeout(() => this.toast.dismiss(toastId), 8000);
      });
  }
}
