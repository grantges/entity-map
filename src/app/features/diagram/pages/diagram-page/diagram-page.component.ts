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
import { FormsModule } from '@angular/forms';
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
import { ParseResult } from '../../../../core/models/entity.model';
import { EnvironmentStorageService, Environment } from '../../../../core/services/environment-storage.service';
import { ODataConnectionService } from '../../../../core/services/odata-connection.service';
import { MetadataParserService } from '../../../../core/services/metadata-parser.service';
import { DiagramNode, DiagramConnection } from '../../../../core/models/diagram.model';
import { ODataProperty, ODataEntityType } from '../../../../core/models/entity.model';
import { ToastService } from '../../../../core/services/toast.service';
import { SettingsDialogComponent } from '../../../../shared/organisms/settings-dialog/settings-dialog.component';
import { ToastContainerComponent } from '../../../../shared/atoms/toast/toast.component';
import { TabBarComponent, EntityTab } from '../../../../shared/molecules/tab-bar/tab-bar.component';
import { ViewControlsComponent } from '../../../../shared/molecules/view-controls/view-controls.component';
import { SearchDropdownComponent } from '../../../../shared/molecules/search-dropdown/search-dropdown.component';
import { IconComponent } from '../../../../shared/atoms/icon/icon.component';

interface TabState {
  depth: number;
  showSystemProps: boolean;
  layoutDirection: 'LR' | 'TB';
}

/** A fetched schema held for review before it replaces what is loaded. */
interface PendingPull {
  env: Environment;
  result: ParseResult;
  added: string[];
  removed: string[];
  modified: string[];
  /** Removed entities that carry local descriptions or custom columns. */
  atRisk: string[];
}

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
    ViewControlsComponent,
    DiagramCanvasComponent,
    UploadScreenComponent,
    SearchDropdownComponent,
    IconComponent, FormsModule,
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
          (entitySelected)="onEntitySelected($event)"
          (fitToScreen)="onFitToScreen()"
          (openSidebar)="toggleSidebar()"
          (openExport)="exportOpen.set(true)"
          (openSettings)="settingsOpen.set(true)"
          (createEntity)="onCreateNewEntity()"
          [canPull]="canPull()"
          [pulling]="pulling()"
          (pullLatest)="onPullLatest()"
          (closeEnvironment)="onCloseEnvironment()"
        />

        <em-tab-bar
          [tabs]="tabs()"
          (tabClicked)="onTabClicked($event)"
          (tabClosed)="onTabClosed($event)"
        />

        @if (showStaleBanner()) {
          <div class="stale-banner">
            <span>
              Last pulled {{ staleDays() }} days ago &mdash; this schema may be out of date.
            </span>
            <button class="stale-banner__action" (click)="onPullLatest()">Pull latest</button>
            <button class="stale-banner__close" (click)="staleDismissed.set(true)" title="Dismiss">
              <em-icon name="x" [size]="14" />
            </button>
          </div>
        }

        @if (pullPasswordFor()) {
          <div class="overlay" (click)="cancelPull()">
            <div class="pull-dialog" (click)="$event.stopPropagation()">
              <h3>Pull latest schema</h3>
              <p class="pull-dialog__meta">
                {{ pullPasswordFor()!.connection!.username }} &middot;
                {{ pullPasswordFor()!.connection!.url }}
              </p>
              <input class="pull-dialog__input" type="password" placeholder="Password"
                [(ngModel)]="pullPassword" (keydown.enter)="submitPullPassword()" />
              <div class="pull-dialog__actions">
                <button class="pull-dialog__cancel" (click)="cancelPull()">Cancel</button>
                <button class="pull-dialog__confirm"
                  [disabled]="!pullPassword || pulling()"
                  (click)="submitPullPassword()">
                  {{ pulling() ? 'Connecting…' : 'Connect' }}
                </button>
              </div>
              @if (pullError()) { <div class="pull-dialog__error">{{ pullError() }}</div> }
              @if (odataService.tlsError()) {
                <label class="tls-trust">
                  <input type="checkbox" [(ngModel)]="trustCertificate" />
                  <span>
                    <strong>Trust this certificate for this environment</strong>
                    Only do this for a server you control \u2014 an unverified
                    certificate means this connection can be intercepted.
                  </span>
                </label>
              }
            </div>
          </div>
        }

        @if (pendingPull(); as pending) {
          <div class="overlay" (click)="cancelPull()">
            <div class="pull-dialog" (click)="$event.stopPropagation()">
              <h3>Apply the schema from the server?</h3>
              <ul class="pull-dialog__stats">
                <li><strong>{{ pending.added.length }}</strong> new entities</li>
                <li><strong>{{ pending.modified.length }}</strong> changed entities</li>
                <li><strong>{{ pending.removed.length }}</strong> entities no longer on the server</li>
              </ul>

              @if (pending.atRisk.length > 0) {
                <div class="pull-dialog__warn">
                  <strong>{{ pending.atRisk.length }}</strong>
                  {{ pending.atRisk.length === 1 ? 'entity' : 'entities' }}
                  you have described or extended locally
                  {{ pending.atRisk.length === 1 ? 'is' : 'are' }}
                  not on the server and will disappear from the diagram:
                  <div class="pull-dialog__risk">{{ pending.atRisk.join(', ') }}</div>
                  Your descriptions and custom columns are kept and will reappear if
                  those entities come back.
                </div>
              }

              <div class="pull-dialog__actions">
                <button class="pull-dialog__cancel" (click)="cancelPull()">Cancel</button>
                <button class="pull-dialog__confirm" (click)="applyPull()">Apply</button>
              </div>
            </div>
          </div>
        }

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
            <!-- Per-tab view controls strip -->
            <em-view-controls
              [depth]="depth()"
              [showSystemProps]="showSystemProps()"
              [layoutDirection]="layoutDirection()"
              (depthChange)="onDepthChange($event)"
              (showSystemPropsChange)="onShowSystemPropsChange($event)"
              (layoutDirectionChange)="onLayoutDirectionChange($event)"
            />

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
            (entityNameChanged)="onEntityNameChanged($event)"
            (entityDeleted)="onEntityDeleted($event)"
          />
        </div>

        <em-export-dialog
          [isOpen]="exportOpen()"
          [entityNames]="currentEntityNames()"
          [activeTabEntityName]="selectedEntity() || ''"
          [allTabEntityNames]="allTabPrimaryNames()"
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
        display: flex;
        flex-direction: column;
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
      /* Modal backdrop for the pull dialogs. Defined here rather than reused
       * from the settings dialog: Angular scopes component styles, so that
       * component's own overlay rule does not reach this template. */
      .overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--em-space-4);
        background: rgba(0, 0, 0, 0.45);
        z-index: 100;
      }

      /* Stale-schema nudge */
      .stale-banner {
        display: flex; align-items: center; gap: var(--em-space-3);
        padding: var(--em-space-2) var(--em-space-4);
        background: var(--em-color-accent-subtle);
        border-bottom: 1px solid var(--em-color-border);
        font-size: var(--em-font-size-xs);
        color: var(--em-color-text-secondary);
        flex-shrink: 0;
      }
      .stale-banner span { flex: 1; }
      .stale-banner__action {
        background: none; border: none; padding: 0;
        color: var(--em-color-accent); font-weight: 600;
        font-size: var(--em-font-size-xs); cursor: pointer; text-decoration: underline;
      }
      .stale-banner__close {
        display: flex; align-items: center; justify-content: center;
        background: none; border: none; color: var(--em-color-text-muted); cursor: pointer;
        &:hover { color: var(--em-color-text-primary); }
      }

      /* Pull-latest dialogs */
      .pull-dialog {
        width: 100%; max-width: 460px;
        display: flex; flex-direction: column; gap: var(--em-space-3);
        padding: var(--em-space-6);
        background: var(--em-color-bg-primary);
        border: 1px solid var(--em-color-border);
        border-radius: var(--em-radius-lg);
        box-shadow: var(--em-shadow-lg);

        h3 { font-size: var(--em-font-size-base); font-weight: 600; }
      }
      .pull-dialog__meta {
        font-size: var(--em-font-size-xs); color: var(--em-color-text-muted);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pull-dialog__input {
        width: 100%; padding: 10px 12px;
        background: var(--em-color-bg-input);
        border: 1px solid var(--em-color-border-input);
        border-radius: var(--em-radius-md);
        color: var(--em-color-text-primary); font-size: 13px; outline: none;
        &:focus { border-color: var(--em-color-border-focus); }
      }
      .pull-dialog__stats {
        list-style: none; display: flex; flex-direction: column; gap: 4px;
        font-size: var(--em-font-size-sm); color: var(--em-color-text-secondary);
      }
      .pull-dialog__warn {
        padding: var(--em-space-3);
        background: rgba(220, 38, 38, 0.08);
        border: 1px solid rgba(220, 38, 38, 0.2);
        border-radius: var(--em-radius-md);
        font-size: var(--em-font-size-xs);
        color: var(--em-color-text-secondary);
        line-height: 1.5;
      }
      .pull-dialog__risk {
        margin: var(--em-space-2) 0;
        font-family: var(--em-font-mono, monospace);
        color: var(--em-color-text-primary);
        word-break: break-word;
        max-height: 90px; overflow-y: auto;
      }
      .pull-dialog__actions {
        display: flex; gap: var(--em-space-2); justify-content: flex-end;
        margin-top: var(--em-space-2);
      }
      .pull-dialog__cancel, .pull-dialog__confirm {
        height: 36px; padding: 0 var(--em-space-4);
        border-radius: var(--em-radius-md); font-size: var(--em-font-size-sm);
        font-weight: 500; cursor: pointer;
      }
      .pull-dialog__cancel {
        background: none; border: 1px solid var(--em-color-border);
        color: var(--em-color-text-secondary);
        &:hover { background: var(--em-color-bg-hover); }
      }
      .pull-dialog__confirm {
        background: var(--em-color-accent); border: none; color: #fff;
        &:disabled { opacity: 0.5; cursor: not-allowed; }
      }
      .pull-dialog__error {
        font-size: var(--em-font-size-xs); color: var(--em-color-error);
      }
      /* Certificate-trust opt-in. Styled as a warning, not a neutral setting. */
      .tls-trust {
        display: flex; gap: var(--em-space-2); align-items: flex-start;
        padding: var(--em-space-3);
        background: rgba(220, 38, 38, 0.08);
        border: 1px solid rgba(220, 38, 38, 0.25);
        border-radius: var(--em-radius-md);
        font-size: var(--em-font-size-xs);
        color: var(--em-color-text-secondary);
        line-height: 1.5;
        cursor: pointer;

        input { margin-top: 2px; flex-shrink: 0; }
        strong { display: block; color: var(--em-color-text-primary); margin-bottom: 2px; }
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
  readonly odataService = inject(ODataConnectionService);
  private readonly parserService = inject(MetadataParserService);

  @ViewChild('diagramCanvas') diagramCanvas?: DiagramCanvasComponent;
  @ViewChild('toolbar') toolbar?: ToolbarComponent;

  // Tab state (persisted per environment)
  private readonly _tabs = signal<string[]>([]);
  private readonly _tabStates = signal<Map<string, TabState>>(new Map());

  readonly tabs = computed<EntityTab[]>(() => {
    const selected = this.selectedEntity();
    const states = this._tabStates();
    return this._tabs().map((name) => {
      const state = states.get(name) || { depth: 1, showSystemProps: false, layoutDirection: 'LR' as const };
      return {
        entityName: name,
        active: name === selected,
        depth: state.depth,
        showSystemProps: state.showSystemProps,
        layoutDirection: state.layoutDirection,
      };
    });
  });

  readonly allTabPrimaryNames = computed(() => [...this._tabs()]);

  private get tabStorageKey(): string {
    return `em-tabs-${this.store.environmentId()}`;
  }

  private get tabStatesStorageKey(): string {
    return `em-tab-states-${this.store.environmentId()}`;
  }

  private saveTabs(): void {
    const envId = this.store.environmentId();
    if (envId) {
      localStorage.setItem(this.tabStorageKey, JSON.stringify(this._tabs()));
      // Save tab states as array of [key, value] entries
      const entries: [string, TabState][] = [];
      this._tabStates().forEach((v, k) => entries.push([k, v]));
      localStorage.setItem(this.tabStatesStorageKey, JSON.stringify(entries));
    }
  }

  private loadTabs(): void {
    try {
      const json = localStorage.getItem(this.tabStorageKey);
      if (json) {
        const tabs = JSON.parse(json) as string[];
        const valid = tabs.filter((t) => this.store.getEntity(t));
        this._tabs.set(valid);

        // Load tab states
        const statesJson = localStorage.getItem(this.tabStatesStorageKey);
        if (statesJson) {
          const entries = JSON.parse(statesJson) as [string, TabState][];
          const map = new Map<string, TabState>();
          for (const [k, v] of entries) {
            if (valid.includes(k)) {
              map.set(k, v);
            }
          }
          this._tabStates.set(map);
        }

        if (valid.length > 0) {
          const last = valid[valid.length - 1];
          this.selectedEntity.set(last);
          this.activeEntity.set(last);
          this.loadTabState(last);
          this.rebuildDiagram();
        }
      }
    } catch { /* ignore */ }
  }

  private getTabState(entityName: string): TabState {
    return this._tabStates().get(entityName) || { depth: 1, showSystemProps: false, layoutDirection: 'LR' };
  }

  private setTabState(entityName: string, state: Partial<TabState>): void {
    const current = this.getTabState(entityName);
    const updated = { ...current, ...state };
    this._tabStates.update(map => {
      const newMap = new Map(map);
      newMap.set(entityName, updated);
      return newMap;
    });
    this.saveTabs();
  }

  private loadTabState(entityName: string): void {
    const state = this.getTabState(entityName);
    this._depth.set(state.depth);
    this._showSystemProps.set(state.showSystemProps);
    this._layoutDirection.set(state.layoutDirection);
  }

  // State — current tab's view settings (loaded from per-tab state)
  readonly selectedEntity = signal<string | null>(null);
  readonly activeEntity = signal<string | null>(null);
  private readonly _depth = signal(1);
  private readonly _showSystemProps = signal(false);
  private readonly _layoutDirection = signal<'LR' | 'TB'>('LR');
  readonly depth = this._depth.asReadonly();
  readonly showSystemProps = this._showSystemProps.asReadonly();
  readonly layoutDirection = this._layoutDirection.asReadonly();
  readonly sidebarOpen = signal(false);
  readonly exportOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly diagramLoading = signal(false);

  // --- Environment lifecycle (pull latest / close) ---
  readonly pulling = signal(false);
  readonly pullError = signal<string | null>(null);
  readonly staleDismissed = signal(false);
  readonly pullPasswordFor = signal<Environment | null>(null);
  readonly pendingPull = signal<PendingPull | null>(null);
  pullPassword = '';
  /** Opt-in to an unverified certificate; only surfaced after a TLS failure. */
  trustCertificate = false;

  readonly currentEnvironment = computed(() =>
    this.envService.environments().find((e) => e.id === this.store.environmentId())
  );
  readonly canPull = computed(() => !!this.currentEnvironment()?.connection);
  readonly staleDays = computed(() => {
    const env = this.currentEnvironment();
    return env ? (this.envService.daysSincePull(env) ?? 0) : 0;
  });
  readonly showStaleBanner = computed(() => {
    const env = this.currentEnvironment();
    return !!env && !this.staleDismissed() && this.envService.isStale(env);
  });

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
      // Subscribe to these signals so the effect re-runs
      this._layoutDirection();
      this._showSystemProps();
      if (this.selectedEntity()) {
        this.rebuildDiagram();
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
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
      this.onShowSystemPropsChange(!this._showSystemProps());
      return;
    }

    if (mod && event.key === 'f') {
      event.preventDefault();
      this.onFitToScreen();
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

  /** The toolbar button toggles, matching the Cmd+\\ shortcut. */
  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  /** Fit the diagram to the viewport. Shared by the toolbar button and Cmd+F. */
  onFitToScreen(): void {
    this.diagramCanvas?.fitToScreen();
  }

  /** Return to the environment picker without restarting the app. */
  onCloseEnvironment(): void {
    this.store.reset();
    this._tabs.set([]);
    this._tabStates.set(new Map());
    this.selectedEntity.set(null);
    this.activeEntity.set(null);
    this.nodes.set([]);
    this.connections.set([]);
    this.sidebarOpen.set(false);
    this.exportOpen.set(false);
    this.settingsOpen.set(false);
    this.staleDismissed.set(false);
    this.cancelPull();
  }

  async onPullLatest(): Promise<void> {
    const env = this.currentEnvironment();
    if (!env?.connection || this.pulling()) return;

    const stored = env.connection.hasStoredPassword
      ? await this.envService.getPassword(env.id)
      : null;
    if (stored) {
      await this.fetchForReview(env, stored);
      return;
    }
    this.pullPassword = '';
    this.pullError.set(null);
    this.pullPasswordFor.set(env);
  }

  async submitPullPassword(): Promise<void> {
    const env = this.pullPasswordFor();
    if (!env || !this.pullPassword) return;
    await this.fetchForReview(env, this.pullPassword);
  }

  cancelPull(): void {
    this.pullPasswordFor.set(null);
    this.pendingPull.set(null);
    this.pullPassword = '';
    this.pullError.set(null);
  }

  /**
   * Fetch and diff, but do NOT apply -- the user confirms first, because a pull
   * can drop entities they have described or extended locally.
   */
  private async fetchForReview(env: Environment, password: string): Promise<void> {
    this.pulling.set(true);
    this.pullError.set(null);
    try {
      const conn = env.connection!;
      const trusted = conn.allowInsecureTls === true || this.trustCertificate;
      const xml = await this.odataService.connect(conn.url, conn.username, password, trusted);
      if (this.trustCertificate && !conn.allowInsecureTls) {
        this.envService.setConnection(env.id, { ...conn, allowInsecureTls: true });
      }
      const result = await new Promise<ParseResult>((resolve, reject) => {
        this.parserService.parseXml(xml).subscribe({
          next: resolve,
          error: (e: unknown) => reject(e instanceof Error ? e : new Error('Failed to parse metadata')),
        });
      });
      this.pullPasswordFor.set(null);
      this.pullPassword = '';
      this.pendingPull.set({ env, result, ...this.diffAgainstCurrent(result) });
    } catch (e: unknown) {
      this.pullError.set(
        this.odataService.error() || (e instanceof Error ? e.message : 'Pull failed')
      );
    } finally {
      this.pulling.set(false);
    }
  }

  /** Compare an incoming schema with the server-derived schema in memory. */
  private diffAgainstCurrent(result: ParseResult): Omit<PendingPull, 'env' | 'result'> {
    const current = this.store.entities();
    const incoming = new Map(result.entities.map((e) => [e.name, e]));

    const added = result.entities.filter((e) => !current.has(e.name)).map((e) => e.name);
    const removed = [...current.keys()].filter((n) => !incoming.has(n));
    const modified: string[] = [];
    current.forEach((entity, name) => {
      const next = incoming.get(name);
      if (!next) return;
      const before = new Set(entity.properties.map((p) => p.name));
      const after = new Set(next.properties.map((p) => p.name));
      if (before.size !== after.size || [...after].some((p) => !before.has(p))) {
        modified.push(name);
      }
    });

    // Only removals matter for data loss, and only where local work exists.
    const localWork = this.store.entitiesWithLocalWork();
    const atRisk = removed.filter((n) => localWork.has(n));
    return { added, removed, modified, atRisk };
  }

  async applyPull(): Promise<void> {
    const pending = this.pendingPull();
    if (!pending) return;
    await this.envService.setSchema(pending.env.id, pending.result, true);
    this.store.loadFromParseResult(pending.result);
    this.staleDismissed.set(false);
    this.pendingPull.set(null);
    this.toast.success(
      'Schema updated',
      `${pending.added.length} added \u00b7 ${pending.modified.length} changed \u00b7 ${pending.removed.length} removed`
    );
  }

  onEnvironmentReady(): void {
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

    // Add tab if not already open (with default state)
    if (!this._tabs().includes(entityName)) {
      this._tabs.update((tabs) => [...tabs, entityName]);
      // Initialize default tab state
      this.setTabState(entityName, { depth: 1, showSystemProps: false, layoutDirection: 'LR' });
    }

    this.selectedEntity.set(entityName);
    this.activeEntity.set(entityName);
    this.sidebarOpen.set(false);
    this.loadTabState(entityName);
    this.saveTabs();
    this.rebuildDiagram();
  }

  onTabClicked(entityName: string): void {
    if (this.selectedEntity() === entityName) return;
    this.selectedEntity.set(entityName);
    this.activeEntity.set(entityName);
    this.loadTabState(entityName);
    this.rebuildDiagram();
  }

  onTabClosed(entityName: string): void {
    const tabs = this._tabs().filter((t) => t !== entityName);
    this._tabs.set(tabs);
    // Clean up tab state
    this._tabStates.update(map => {
      const newMap = new Map(map);
      newMap.delete(entityName);
      return newMap;
    });
    this.saveTabs();

    if (this.selectedEntity() === entityName) {
      if (tabs.length > 0) {
        const newActive = tabs[tabs.length - 1];
        this.selectedEntity.set(newActive);
        this.activeEntity.set(newActive);
        this.loadTabState(newActive);
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
    this._depth.set(depth);
    const entity = this.selectedEntity();
    if (entity) {
      this.setTabState(entity, { depth });
    }
    this.rebuildDiagram();
  }

  onShowSystemPropsChange(value: boolean): void {
    this._showSystemProps.set(value);
    const entity = this.selectedEntity();
    if (entity) {
      this.setTabState(entity, { showSystemProps: value });
    }
  }

  onLayoutDirectionChange(value: 'LR' | 'TB'): void {
    this._layoutDirection.set(value);
    const entity = this.selectedEntity();
    if (entity) {
      this.setTabState(entity, { layoutDirection: value });
    }
  }

  private rebuildDiagram(): void {
    const entityName = this.selectedEntity();
    if (!entityName) return;

    this.diagramLoading.set(true);

    setTimeout(() => {
      const result = this.diagramFacade.buildDiagram(entityName, this._depth(), {
        showSystemProps: this._showSystemProps(),
        layoutDirection: this._layoutDirection(),
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

  onEntityDeleted(entityName: string): void {
    this.sidebarOpen.set(false);
    this.onTabClosed(entityName);
    this.store.removeCustomEntity(entityName);
  }

  onCreateNewEntity(): void {
    const ns = this.store.namespace() || 'Terrasoft.Configuration.OData';
    const entity: ODataEntityType = {
      name: 'NewEntity',
      namespace: ns,
      properties: [
        { name: 'Id', type: 'Edm.Guid', nullable: false, isKey: true, creatioType: 'Unique identifier' },
      ],
      navigationProperties: [],
      keyPropertyNames: ['Id'],
      isCustom: true,
    };
    this.store.addCustomEntity(entity);
    this.onEntitySelected(entity.name);
    this.sidebarOpen.set(true);
  }

  onEntityNameChanged(event: { oldName: string; newName: string }): void {
    this.store.renameCustomEntity(event.oldName, event.newName);
    // Update tabs
    this._tabs.update(tabs => tabs.map(t => t === event.oldName ? event.newName : t));
    // Update tab states
    this._tabStates.update(map => {
      const newMap = new Map(map);
      const state = newMap.get(event.oldName);
      if (state) {
        newMap.delete(event.oldName);
        newMap.set(event.newName, state);
      }
      return newMap;
    });
    if (this.selectedEntity() === event.oldName) {
      this.selectedEntity.set(event.newName);
    }
    if (this.activeEntity() === event.oldName) {
      this.activeEntity.set(event.newName);
    }
    this.saveTabs();
    this.rebuildDiagram();
  }

  // Settings
  onSwitchEnvironment(): void {
    this.settingsOpen.set(false);
    this.store.reset();
    this._tabs.set([]);
    this._tabStates.set(new Map());
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
  async onExportSchema(options: { packageName: string; customOnly: boolean; entityNames: string[] }): Promise<void> {
    const entityNames = options.entityNames;
    const xml = this.schemaExport.exportCreatioSchema({
      entities: entityNames,
      includeCustomOnly: options.customOnly,
      packageName: options.packageName,
    });
    await this.schemaExport.downloadSchema(xml, `${options.packageName}.xml`);
  }

  onExportDocs(options: {
    aiEnhanced: boolean;
    aiDescriptionMode: 'fill-missing' | 'override-all';
    deltaOnly: boolean;
    baselineId: string | null;
    entityNames: string[];
  }): void {
    let entityNames = options.entityNames;
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
