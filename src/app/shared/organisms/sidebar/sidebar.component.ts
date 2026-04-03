import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../atoms/icon/icon.component';
import { BadgeComponent } from '../../atoms/badge/badge.component';
import {
  ODataEntityType,
  ODataProperty,
  CREATIO_DATA_TYPES,
  CreatioDataType,
  EntityMetadata,
  getEdmTypeShort,
} from '../../../core/models/entity.model';
import { MetadataStoreService } from '../../../core/services/metadata-store.service';
import { AiService } from '../../../core/services/ai.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'em-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, BadgeComponent],
  template: `
    @if (isOpen && entity) {
      <div class="sidebar">
        <div class="sidebar__header">
          <div class="sidebar__title">
            <em-icon name="database" [size]="16" />
            <span>{{ entity.name }}</span>
            @if (entity.isCustom) { <em-badge text="custom" variant="custom" /> }
          </div>
          <button class="sidebar__close" (click)="closed.emit()">
            <em-icon name="x" [size]="16" />
          </button>
        </div>

        <div class="sidebar__body">
          <!-- Entity Description -->
          <div class="sidebar__section">
            <div class="sidebar__section-header">
              <span>Entity Description</span>
              @if (aiService.isConfigured()) {
                <button class="sidebar__ai-btn"
                  [disabled]="aiService.generating()"
                  (click)="aiDescribeEntity()">
                  <em-icon name="sparkles" [size]="12" />
                  {{ aiService.generating() ? 'Generating...' : 'AI Describe' }}
                </button>
              }
            </div>
            <textarea class="sidebar__textarea"
              [value]="metadata.description || ''"
              (blur)="onEntityDescriptionChange($event)"
              placeholder="Add a description for this entity..."
              rows="3"
            ></textarea>
            @if (aiService.generating()) {
              <div class="sidebar__ai-progress">{{ aiService.progress() }}</div>
            }
          </div>

          <!-- Entity Info -->
          <div class="sidebar__section">
            <div class="sidebar__section-header">Info</div>
            <div class="sidebar__info-row">
              <span class="sidebar__label">Namespace</span>
              <span class="sidebar__value">{{ entity.namespace }}</span>
            </div>
            @if (entity.baseType) {
              <div class="sidebar__info-row">
                <span class="sidebar__label">Inherits from</span>
                <button class="sidebar__link" (click)="navigateToEntity.emit(entity.baseType!)">
                  {{ entity.baseType }}
                </button>
              </div>
            }
            <div class="sidebar__info-row">
              <span class="sidebar__label">Properties</span>
              <span class="sidebar__value">{{ entity.properties.length }}</span>
            </div>
          </div>

          <!-- Properties with editable descriptions -->
          <div class="sidebar__section">
            <div class="sidebar__section-header">
              <span>Properties</span>
              <em-badge [text]="entity.properties.length.toString()" variant="count" />
            </div>
            <div class="sidebar__prop-list">
              @for (prop of entity.properties; track prop.name) {
                <div class="sidebar__prop" [class.sidebar__prop--custom]="prop.isCustom">
                  <div class="sidebar__prop-header">
                    <span class="sidebar__prop-name">{{ prop.name }}</span>
                    <em-badge [text]="getTypeLabel(prop)" [variant]="prop.isKey ? 'fk' : 'count'" />
                    @if (prop.isCustom) {
                      <button class="sidebar__prop-remove" (click)="removeCustomProperty.emit(prop.name)">
                        <em-icon name="trash" [size]="12" />
                      </button>
                    }
                  </div>
                  <input class="sidebar__prop-desc"
                    [value]="metadata.columnDescriptions[prop.name] || ''"
                    (blur)="onColumnDescriptionChange(prop.name, $event)"
                    [placeholder]="'Describe ' + prop.name + '...'"
                  />
                </div>
              }
            </div>
          </div>

          <!-- Relationships -->
          <div class="sidebar__section">
            <div class="sidebar__section-header">Relationships</div>
            @for (nav of entity.navigationProperties; track nav.name) {
              @if (!nav.isCollection) {
                <button class="sidebar__nav-item" (click)="navigateToEntity.emit(nav.targetEntity)">
                  <span class="sidebar__nav-name">{{ nav.name }}</span>
                  <em-badge [text]="nav.targetEntity" variant="fk" />
                </button>
              }
            }
          </div>

          <!-- Add Property (Creatio types) -->
          <div class="sidebar__section">
            <div class="sidebar__section-header">Add Property</div>
            <div class="sidebar__form">
              <input class="sidebar__input" placeholder="Property name"
                [(ngModel)]="newPropName" />

              <select class="sidebar__select" [(ngModel)]="newPropCreatioType"
                (ngModelChange)="onCreatioTypeChange()">
                @for (ct of creatioTypes; track ct.name) {
                  <option [value]="ct.name">{{ ct.name }} ({{ ct.csharpType }})</option>
                }
              </select>

              @if (selectedCreatioType?.requiresLookup) {
                <div class="sidebar__lookup-field">
                  <label class="sidebar__field-label">Linked Entity</label>
                  <input class="sidebar__input" placeholder="Search entity..."
                    [(ngModel)]="lookupSearch"
                    (input)="onLookupSearch()" />
                  @if (lookupResults.length > 0) {
                    <div class="sidebar__lookup-results">
                      @for (name of lookupResults; track name) {
                        <button class="sidebar__lookup-item"
                          [class.sidebar__lookup-item--selected]="name === newPropLinkedEntity"
                          (click)="selectLookupEntity(name)">
                          {{ name }}
                        </button>
                      }
                    </div>
                  }
                  @if (newPropLinkedEntity) {
                    <div class="sidebar__lookup-selected">
                      Linked to: <strong>{{ newPropLinkedEntity }}</strong>
                    </div>
                  }
                </div>
              }

              <label class="sidebar__checkbox">
                <input type="checkbox" [(ngModel)]="newPropNullable" /> Nullable
              </label>

              <button class="sidebar__btn-add" (click)="addProperty()"
                [disabled]="!newPropName.trim() || (selectedCreatioType?.requiresLookup && !newPropLinkedEntity)">
                <em-icon name="plus" [size]="14" /> Add Property
              </button>
            </div>
          </div>

          <!-- Create New Entity -->
          <div class="sidebar__section">
            <div class="sidebar__section-header">Create New Entity</div>
            <div class="sidebar__form">
              <input class="sidebar__input" placeholder="Entity name"
                [(ngModel)]="newEntityName" />

              <div class="sidebar__field">
                <label class="sidebar__field-label">Inherits from (optional)</label>
                <input class="sidebar__input" placeholder="Search base entity..."
                  [(ngModel)]="baseEntitySearch"
                  (input)="onBaseEntitySearch()" />
                @if (baseEntityResults.length > 0) {
                  <div class="sidebar__lookup-results">
                    @for (name of baseEntityResults; track name) {
                      <button class="sidebar__lookup-item"
                        [class.sidebar__lookup-item--selected]="name === newEntityBaseType"
                        (click)="selectBaseEntity(name)">
                        {{ name }}
                      </button>
                    }
                  </div>
                }
                @if (newEntityBaseType) {
                  <div class="sidebar__lookup-selected">
                    Inherits: <strong>{{ newEntityBaseType }}</strong>
                    <button class="sidebar__link-clear" (click)="newEntityBaseType = ''">clear</button>
                  </div>
                }
              </div>

              <button class="sidebar__btn-add" (click)="createEntity()"
                [disabled]="!newEntityName.trim()">
                <em-icon name="plus" [size]="14" /> Create Entity
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .sidebar {
      position: absolute; top: 0; right: 0; width: 380px; height: 100%;
      background: var(--em-color-bg-primary); border-left: 1px solid var(--em-color-border);
      box-shadow: var(--em-shadow-xl); z-index: 20;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .sidebar__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid var(--em-color-border); flex-shrink: 0;
    }
    .sidebar__title {
      display: flex; align-items: center; gap: 8px;
      font-weight: 600; font-size: 14px; color: var(--em-color-text-primary);
    }
    .sidebar__close {
      display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
      border: none; background: transparent; color: var(--em-color-text-muted);
      border-radius: 4px; cursor: pointer;
      &:hover { background: var(--em-color-bg-hover); }
    }
    .sidebar__body { flex: 1; overflow-y: auto; padding-bottom: 16px; }
    .sidebar__section {
      padding: 12px 0;
      & + & { border-top: 1px solid var(--em-color-border); }
    }
    .sidebar__section-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 16px 8px; font-size: 13px; font-weight: 600; color: var(--em-color-text-primary);
    }
    .sidebar__info-row {
      display: flex; justify-content: space-between; padding: 4px 16px; font-size: 13px;
    }
    .sidebar__label { color: var(--em-color-text-muted); }
    .sidebar__value { color: var(--em-color-text-primary); font-weight: 500; }
    .sidebar__link {
      color: var(--em-color-text-link); background: none; border: none; cursor: pointer;
      font-size: inherit; font-weight: 500; &:hover { text-decoration: underline; }
    }

    /* Textarea for entity description */
    .sidebar__textarea {
      display: block; width: calc(100% - 32px); margin: 0 16px; padding: 8px;
      background: var(--em-color-bg-input); border: 1px solid var(--em-color-border-input);
      border-radius: 6px; color: var(--em-color-text-primary); font-size: 12px;
      font-family: inherit; resize: vertical; outline: none;
      &:focus { border-color: var(--em-color-border-focus); }
    }

    /* Property list with inline descriptions */
    .sidebar__prop-list { max-height: 400px; overflow-y: auto; }
    .sidebar__prop { padding: 6px 16px; }
    .sidebar__prop--custom { border-left: 2px solid var(--em-color-custom); }
    .sidebar__prop-header {
      display: flex; align-items: center; gap: 6px;
    }
    .sidebar__prop-name {
      flex: 1; font-size: 12px; font-family: var(--em-font-mono);
      color: var(--em-color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sidebar__prop-remove {
      display: flex; align-items: center; background: none; border: none;
      color: var(--em-color-error); cursor: pointer; padding: 2px;
      &:hover { opacity: 0.7; }
    }
    .sidebar__prop-desc {
      display: block; width: 100%; margin-top: 4px; padding: 4px 8px;
      background: var(--em-color-bg-input); border: 1px solid transparent;
      border-radius: 4px; color: var(--em-color-text-secondary); font-size: 11px;
      outline: none;
      &:focus { border-color: var(--em-color-border-focus); }
      &::placeholder { color: var(--em-color-text-muted); }
    }

    /* Nav items */
    .sidebar__nav-item {
      display: flex; align-items: center; justify-content: space-between; width: 100%;
      padding: 6px 16px; border: none; background: transparent; text-align: left; cursor: pointer;
      &:hover { background: var(--em-color-bg-hover); }
    }
    .sidebar__nav-name { font-size: 12px; font-family: var(--em-font-mono); color: var(--em-color-text-primary); }

    /* Form elements */
    .sidebar__form { display: flex; flex-direction: column; gap: 8px; padding: 0 16px; }
    .sidebar__field { display: flex; flex-direction: column; gap: 4px; }
    .sidebar__field-label { font-size: 11px; color: var(--em-color-text-muted); font-weight: 500; }
    .sidebar__input, .sidebar__select {
      height: 32px; padding: 0 10px;
      background: var(--em-color-bg-input); border: 1px solid var(--em-color-border-input);
      border-radius: 6px; color: var(--em-color-text-primary); font-size: 12px; outline: none;
      &:focus { border-color: var(--em-color-border-focus); }
    }
    .sidebar__checkbox {
      display: flex; align-items: center; gap: 6px; font-size: 12px;
      color: var(--em-color-text-secondary); cursor: pointer;
    }
    .sidebar__btn-add {
      display: flex; align-items: center; justify-content: center; gap: 4px;
      height: 32px; background: var(--em-color-accent); color: white; border: none;
      border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;
      &:hover { background: var(--em-color-accent-hover); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    /* Lookup search results */
    .sidebar__lookup-field { display: flex; flex-direction: column; gap: 4px; }
    .sidebar__lookup-results {
      max-height: 150px; overflow-y: auto;
      border: 1px solid var(--em-color-border); border-radius: 6px;
      background: var(--em-color-bg-primary);
    }
    .sidebar__lookup-item {
      display: block; width: 100%; padding: 6px 10px; border: none;
      background: transparent; text-align: left; font-size: 12px;
      color: var(--em-color-text-primary); cursor: pointer;
      &:hover { background: var(--em-color-bg-hover); }
      &--selected { background: var(--em-color-accent-subtle); color: var(--em-color-accent); font-weight: 500; }
    }
    .sidebar__lookup-selected {
      font-size: 12px; color: var(--em-color-text-secondary); padding: 4px 0;
      strong { color: var(--em-color-accent); }
    }
    .sidebar__link-clear {
      margin-left: 8px; color: var(--em-color-text-muted); background: none; border: none;
      font-size: 11px; cursor: pointer; text-decoration: underline;
    }
    .sidebar__ai-btn {
      display: flex; align-items: center; gap: 4px; padding: 3px 8px;
      font-size: 11px; font-weight: 500; border: 1px solid var(--em-color-border);
      border-radius: 4px; background: var(--em-color-bg-input); color: var(--em-color-accent);
      cursor: pointer; transition: all 0.15s;
      &:hover:not(:disabled) { background: var(--em-color-accent); color: white; border-color: var(--em-color-accent); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .sidebar__ai-progress {
      padding: 4px 16px; font-size: 11px; color: var(--em-color-accent); font-style: italic;
    }
  `],
})
export class SidebarComponent {
  private readonly store = inject(MetadataStoreService);
  private readonly toast = inject(ToastService);
  readonly aiService = inject(AiService);

  @Input() entity: ODataEntityType | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() navigateToEntity = new EventEmitter<string>();
  @Output() propertyAdded = new EventEmitter<ODataProperty>();
  @Output() removeCustomProperty = new EventEmitter<string>();
  @Output() entityCreated = new EventEmitter<ODataEntityType>();

  creatioTypes = CREATIO_DATA_TYPES;
  metadata: EntityMetadata = { columnDescriptions: {} };

  // Add Property form
  newPropName = '';
  newPropCreatioType = 'Text (250)';
  newPropNullable = true;
  newPropLinkedEntity = '';
  lookupSearch = '';
  lookupResults: string[] = [];

  // Create Entity form
  newEntityName = '';
  newEntityBaseType = '';
  baseEntitySearch = '';
  baseEntityResults: string[] = [];

  get selectedCreatioType(): CreatioDataType | undefined {
    return this.creatioTypes.find((t) => t.name === this.newPropCreatioType);
  }

  ngOnChanges(): void {
    if (this.entity) {
      this.metadata = this.store.getMetadata(this.entity.name);
    }
  }

  getTypeLabel(prop: ODataProperty): string {
    if (prop.creatioType) return prop.creatioType;
    return getEdmTypeShort(prop.type);
  }

  async aiDescribeEntity(): Promise<void> {
    if (!this.entity || this.aiService.generating()) return;
    try {
      const result = await this.aiService.describeEntity(this.entity, this.metadata);
      // Apply entity description
      if (result.entityDescription) {
        this.store.setEntityDescription(this.entity.name, result.entityDescription);
      }
      // Apply column descriptions
      for (const [col, desc] of Object.entries(result.columnDescriptions)) {
        if (desc) {
          this.store.setColumnDescription(this.entity.name, col, desc);
        }
      }
      // Refresh metadata
      this.metadata = this.store.getMetadata(this.entity.name);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.toast.error('AI generation failed', msg);
    }
  }

  onEntityDescriptionChange(event: Event): void {
    if (!this.entity) return;
    const value = (event.target as HTMLTextAreaElement).value;
    this.store.setEntityDescription(this.entity.name, value);
    this.metadata = this.store.getMetadata(this.entity.name);
  }

  onColumnDescriptionChange(columnName: string, event: Event): void {
    if (!this.entity) return;
    const value = (event.target as HTMLInputElement).value;
    this.store.setColumnDescription(this.entity.name, columnName, value);
    this.metadata = this.store.getMetadata(this.entity.name);
  }

  onCreatioTypeChange(): void {
    this.newPropLinkedEntity = '';
    this.lookupSearch = '';
    this.lookupResults = [];
  }

  onLookupSearch(): void {
    if (this.lookupSearch.length < 1) {
      this.lookupResults = [];
      return;
    }
    this.lookupResults = this.store.allEntityNames()
      .filter((n) => n.toLowerCase().includes(this.lookupSearch.toLowerCase()))
      .slice(0, 15);
  }

  selectLookupEntity(name: string): void {
    this.newPropLinkedEntity = name;
    this.lookupResults = [];
    this.lookupSearch = name;
  }

  onBaseEntitySearch(): void {
    if (this.baseEntitySearch.length < 1) {
      this.baseEntityResults = [];
      return;
    }
    this.baseEntityResults = this.store.allEntityNames()
      .filter((n) => n.toLowerCase().includes(this.baseEntitySearch.toLowerCase()))
      .slice(0, 15);
  }

  selectBaseEntity(name: string): void {
    this.newEntityBaseType = name;
    this.baseEntityResults = [];
    this.baseEntitySearch = name;
  }

  addProperty(): void {
    if (!this.newPropName.trim()) return;
    const ct = this.selectedCreatioType;
    if (!ct) return;
    if (ct.requiresLookup && !this.newPropLinkedEntity) return;

    const propName = ct.requiresLookup
      ? (this.newPropName.trim().endsWith('Id') ? this.newPropName.trim() : this.newPropName.trim() + 'Id')
      : this.newPropName.trim();

    const prop: ODataProperty = {
      name: propName,
      type: ct.edmType,
      nullable: this.newPropNullable,
      isKey: false,
      isCustom: true,
      creatioType: ct.name,
      linkedEntity: ct.requiresLookup ? this.newPropLinkedEntity : undefined,
    };

    this.propertyAdded.emit(prop);
    this.newPropName = '';
    this.newPropLinkedEntity = '';
    this.lookupSearch = '';
  }

  createEntity(): void {
    if (!this.newEntityName.trim()) return;

    const ns = this.store.namespace() || 'Terrasoft.Configuration.OData';
    const entity: ODataEntityType = {
      name: this.newEntityName.trim(),
      namespace: ns,
      baseType: this.newEntityBaseType || undefined,
      properties: [
        { name: 'Id', type: 'Edm.Guid', nullable: false, isKey: true, creatioType: 'Unique identifier' },
      ],
      navigationProperties: [],
      keyPropertyNames: ['Id'],
      isCustom: true,
    };

    this.entityCreated.emit(entity);
    this.newEntityName = '';
    this.newEntityBaseType = '';
    this.baseEntitySearch = '';
  }
}
