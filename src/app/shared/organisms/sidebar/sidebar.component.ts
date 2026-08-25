import { Component, Input, Output, EventEmitter, signal, inject, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
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
        <!-- Header: icon + name + close -->
        <div class="sidebar__header">
          <div class="sidebar__title">
            <em-icon name="database" [size]="16" />
            @if (entity.isCustom) {
              <input #nameInput class="sidebar__name-input"
                [value]="entity.name"
                (blur)="onEntityNameChange($event)"
                (keydown.enter)="onEntityNameBlur($event)"
                placeholder="Entity name" />
            } @else {
              <span class="sidebar__entity-name">{{ entity.name }}</span>
            }
          </div>
          <div class="sidebar__header-actions">
            @if (entity.isCustom) {
              <button class="sidebar__delete-btn" (click)="confirmDeleteEntity()" title="Delete entity">
                <em-icon name="trash" [size]="14" />
              </button>
            }
            <button class="sidebar__close" (click)="closed.emit()">
              <em-icon name="x" [size]="16" />
            </button>
          </div>
        </div>

        <div class="sidebar__body">
          <!-- Inherits from (custom entities: inline dropdown; existing: show if set) -->
          @if (entity.isCustom) {
            <div class="sidebar__inherit-section">
              <div class="sidebar__inherit-row">
                <span class="sidebar__inherit-label">Inherits from</span>
                <div class="sidebar__inherit-field">
                  <input class="sidebar__inherit-input"
                    [placeholder]="entity.baseType ? entity.baseType : 'None'"
                    [(ngModel)]="baseEntitySearch"
                    (input)="onBaseEntitySearch()"
                    (focus)="onBaseEntitySearch()" />
                  @if (baseEntityResults.length > 0) {
                    <div class="sidebar__lookup-results">
                      @for (name of baseEntityResults; track name) {
                        <button class="sidebar__lookup-item"
                          [class.sidebar__lookup-item--selected]="name === entity.baseType"
                          (click)="selectBaseEntityForCurrent(name)">
                          {{ name }}
                        </button>
                      }
                    </div>
                  }
                  @if (entity.baseType) {
                    <div class="sidebar__inherit-selected">
                      <button class="sidebar__link" (click)="navigateToEntity.emit(entity.baseType!)">
                        {{ entity.baseType }}
                      </button>
                      <button class="sidebar__link-clear" (click)="clearBaseType()">clear</button>
                    </div>
                  }
                </div>
              </div>
            </div>
          } @else if (entity.baseType) {
            <div class="sidebar__inherit-section">
              <div class="sidebar__inherit-row">
                <span class="sidebar__inherit-label">Inherits from</span>
                <button class="sidebar__link" (click)="navigateToEntity.emit(entity.baseType!)">
                  {{ entity.baseType }}
                </button>
              </div>
            </div>
          }

          <!-- Description -->
          <div class="sidebar__section-block">
            <textarea class="sidebar__textarea"
              [value]="metadata.description || ''"
              (blur)="onEntityDescriptionChange($event)"
              placeholder="Add a description for this entity..."
              rows="3"
            ></textarea>
            @if (aiService.generating()) {
              <div class="sidebar__ai-progress">{{ aiService.progress() }}</div>
            }
            <!-- Existing entity: show AI Describe button -->
            @if (!entity.isCustom && aiService.isConfigured()) {
              <button class="sidebar__ai-btn"
                [disabled]="aiService.generating()"
                (click)="aiDescribeEntity()">
                <em-icon name="sparkles" [size]="12" />
                {{ aiService.generating() ? 'Generating...' : 'AI Describe' }}
              </button>
            }
            <!-- New custom entity with 1+ properties: show generate description button -->
            @if (entity.isCustom && aiService.isConfigured() && getCustomPropertyCount() > 0) {
              <button class="sidebar__ai-ghost-btn"
                [disabled]="aiService.generating()"
                (click)="aiDescribeEntity()">
                <em-icon name="sparkles" [size]="12" />
                {{ aiService.generating() ? 'Generating...' : 'Generate description from properties' }}
              </button>
            }
          </div>

          <!-- AI Generate Properties (for custom entities with description and no custom props) -->
          @if (entity.isCustom && aiService.isConfigured() && metadata.description && getCustomPropertyCount() === 0) {
            <div class="sidebar__section-block">
              <button class="sidebar__ai-generate-btn"
                [disabled]="aiGeneratingProps"
                (click)="aiGenerateProperties()">
                @if (aiGeneratingProps) {
                  <span class="sidebar__spinner"></span>
                  Generating properties...
                } @else {
                  <em-icon name="sparkles" [size]="14" />
                  AI Generate Properties
                }
              </button>
            </div>
          }

          <!-- Properties -->
          <div class="sidebar__section-block">
            <div class="sidebar__section-header">
              <span>Properties <span class="sidebar__count">({{ entity.properties.length }})</span></span>
              <button class="sidebar__add-prop-toggle"
                [class.sidebar__add-prop-toggle--active]="addPropOpen"
                (click)="toggleAddProperty()">
                <em-icon name="plus" [size]="14" />
              </button>
            </div>

            @if (getCustomPropertyCount() === 0 && !addPropOpen) {
              <button class="sidebar__add-prop-dashed" (click)="toggleAddProperty()">
                <em-icon name="plus" [size]="14" />
                Add property
              </button>
            }

            <div class="sidebar__prop-list">
              @for (prop of entity.properties; track prop.name) {
                <div class="sidebar__prop" [class.sidebar__prop--custom]="prop.isCustom">
                  <div class="sidebar__prop-header">
                    <span class="sidebar__prop-name">{{ prop.name }}</span>
                    <em-badge [text]="getTypeLabel(prop)" [variant]="prop.isKey ? 'fk' : 'count'" />
                    @if (prop.isCustom) {
                      <button class="sidebar__prop-remove" (click)="confirmRemoveProperty(prop.name)">
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

            <!-- Inline Add Property Card -->
            @if (addPropOpen) {
              <div class="sidebar__add-card" [class.sidebar__add-card--closing]="addPropClosing">
                <div class="sidebar__add-card-inner">
                  <input #propNameInput class="sidebar__input"
                    placeholder="Property name"
                    [(ngModel)]="newPropName"
                    (blur)="onPropNameBlur()"
                    [class.sidebar__input--error]="propNameError" />
                  @if (propNameError) {
                    <div class="sidebar__field-error">{{ propNameError }}</div>
                  }

                  <select class="sidebar__select" [(ngModel)]="newPropCreatioType"
                    (ngModelChange)="onCreatioTypeChange()">
                    @for (ct of creatioTypes; track ct.name) {
                      <option [value]="ct.name">{{ ct.name }} ({{ ct.csharpType }})</option>
                    }
                  </select>

                  @if (selectedCreatioType?.requiresLookup) {
                    <div class="sidebar__lookup-field sidebar__lookup-field--animated">
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

                  <div class="sidebar__add-row">
                    <label class="sidebar__checkbox">
                      <input type="checkbox" [(ngModel)]="newPropNullable" /> Nullable
                    </label>
                    <button class="sidebar__desc-toggle"
                      [class.sidebar__desc-toggle--active]="showPropDescription"
                      (click)="showPropDescription = !showPropDescription"
                      title="Add description">
                      <em-icon name="file-text" [size]="12" />
                    </button>
                  </div>

                  @if (showPropDescription) {
                    <textarea class="sidebar__add-desc"
                      [(ngModel)]="newPropDescription"
                      placeholder="Property description..."
                      rows="2"
                    ></textarea>
                  }

                  <div class="sidebar__add-actions">
                    <button class="sidebar__btn-add sidebar__btn-add--compact" (click)="addProperty()"
                      [disabled]="!newPropName.trim() || (selectedCreatioType?.requiresLookup && !newPropLinkedEntity)">
                      Add
                    </button>
                    <button class="sidebar__btn-cancel" (click)="cancelAddProperty()">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- Relationships: hidden if 0 non-collection nav properties -->
          @if (getNonCollectionNavCount() > 0) {
            <div class="sidebar__section-block">
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
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .sidebar { position:absolute;top:0;right:0;width:380px;height:100%;background:var(--em-color-bg-primary);border-left:1px solid var(--em-color-border);box-shadow:var(--em-shadow-xl);z-index:20;display:flex;flex-direction:column;overflow:hidden }
    .sidebar__header { display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--em-color-border);flex-shrink:0 }
    .sidebar__title { display:flex;align-items:center;gap:8px;flex:1;min-width:0 }
    .sidebar__entity-name { font-weight:600;font-size:14px;color:var(--em-color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
    .sidebar__name-input { flex:1;min-width:0;height:32px;padding:0 2px;background:transparent;border:none;border-bottom:2px solid var(--em-color-accent);border-radius:0;color:var(--em-color-text-primary);font-size:16px;font-weight:600;outline:none }
    .sidebar__header-actions { display:flex;align-items:center;gap:4px;flex-shrink:0 }
    .sidebar__close { display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:transparent;color:var(--em-color-text-muted);border-radius:4px;cursor:pointer;flex-shrink:0;&:hover{background:var(--em-color-bg-hover)} }
    .sidebar__delete-btn { display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:transparent;color:var(--em-color-text-muted);border-radius:4px;cursor:pointer;flex-shrink:0;&:hover{background:rgba(220,38,38,0.1);color:var(--em-color-error)} }
    .sidebar__body { flex:1;overflow-y:auto;padding:24px 0 16px }

    .sidebar__section-block { padding:0 16px }
    .sidebar__section-block + .sidebar__section-block { margin-top:16px }

    .sidebar__section-header { display:flex;align-items:center;justify-content:space-between;padding:0 0 8px;font-size:13px;font-weight:600;color:var(--em-color-text-primary) }
    .sidebar__count { font-weight:400;color:var(--em-color-text-muted) }

    /* Inherits from */
    .sidebar__inherit-section { padding:0 16px;margin-bottom:16px }
    .sidebar__inherit-row { display:flex;align-items:flex-start;gap:8px;font-size:13px }
    .sidebar__inherit-label { color:var(--em-color-text-muted);flex-shrink:0;padding-top:4px }
    .sidebar__inherit-field { display:flex;flex-direction:column;gap:4px;flex:1;min-width:0 }
    .sidebar__inherit-input { height:28px;padding:0 8px;width:100%;box-sizing:border-box;background:var(--em-color-bg-input);border:1px solid var(--em-color-border-input);border-radius:4px;color:var(--em-color-text-primary);font-size:12px;outline:none;&:focus{border-color:var(--em-color-border-focus)} }
    .sidebar__inherit-selected { font-size:12px;color:var(--em-color-text-secondary);padding:2px 0 }

    .sidebar__link { color:var(--em-color-text-link);background:none;border:none;cursor:pointer;font-size:inherit;font-weight:500;&:hover{text-decoration:underline} }
    .sidebar__link-clear { margin-left:8px;color:var(--em-color-text-muted);background:none;border:none;font-size:11px;cursor:pointer;text-decoration:underline }

    .sidebar__textarea { display:block;width:100%;box-sizing:border-box;padding:8px;background:var(--em-color-bg-input);border:1px solid var(--em-color-border-input);border-radius:6px;color:var(--em-color-text-primary);font-size:12px;font-family:inherit;resize:vertical;outline:none;&:focus{border-color:var(--em-color-border-focus)} }
    .sidebar__ai-btn { display:flex;align-items:center;gap:4px;padding:3px 8px;font-size:11px;font-weight:500;border:1px solid var(--em-color-border);border-radius:4px;background:var(--em-color-bg-input);color:var(--em-color-accent);cursor:pointer;transition:all .15s;margin-top:6px;&:hover:not(:disabled){background:var(--em-color-accent);color:#fff;border-color:var(--em-color-accent)}&:disabled{opacity:0.5;cursor:not-allowed} }
    .sidebar__ai-ghost-btn { display:flex;align-items:center;gap:4px;padding:5px 10px;font-size:11px;font-weight:500;border:1px dashed var(--em-color-border);border-radius:4px;background:transparent;color:var(--em-color-text-muted);cursor:pointer;transition:all .15s;margin-top:6px;&:hover:not(:disabled){color:var(--em-color-accent);border-color:var(--em-color-accent)}&:disabled{opacity:0.5;cursor:not-allowed} }
    .sidebar__ai-progress { padding:4px 0;font-size:11px;color:var(--em-color-accent);font-style:italic }
    .sidebar__ai-generate-btn { display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:36px;background:var(--em-color-accent-subtle);color:var(--em-color-accent);border:1px dashed var(--em-color-accent);border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;&:hover:not(:disabled){background:var(--em-color-accent);color:#fff}&:disabled{opacity:0.6;cursor:not-allowed} }

    /* Add property dashed button (0 custom props) */
    .sidebar__add-prop-dashed { display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:40px;background:transparent;color:var(--em-color-text-muted);border:1px dashed var(--em-color-border);border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;&:hover{color:var(--em-color-accent);border-color:var(--em-color-accent);background:var(--em-color-accent-subtle)} }

    .sidebar__prop-list { max-height:400px;overflow-y:auto }
    .sidebar__prop { padding:6px 0 }
    .sidebar__prop--custom { border-left:2px solid var(--em-color-custom);padding-left:8px }
    .sidebar__prop-header { display:flex;align-items:center;gap:6px }
    .sidebar__prop-name { flex:1;font-size:12px;font-family:var(--em-font-mono);color:var(--em-color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
    .sidebar__prop-remove { display:flex;align-items:center;background:none;border:none;color:var(--em-color-error);cursor:pointer;padding:2px;&:hover{opacity:0.7} }
    .sidebar__prop-desc { display:block;width:100%;margin-top:4px;padding:4px 8px;background:var(--em-color-bg-input);border:1px solid transparent;border-radius:4px;color:var(--em-color-text-secondary);font-size:11px;outline:none;box-sizing:border-box;&:focus{border-color:var(--em-color-border-focus)}&::placeholder{color:var(--em-color-text-muted)} }
    .sidebar__nav-item { display:flex;align-items:center;justify-content:space-between;width:100%;padding:6px 0;border:none;background:transparent;text-align:left;cursor:pointer;&:hover{background:var(--em-color-bg-hover);border-radius:4px} }
    .sidebar__nav-name { font-size:12px;font-family:var(--em-font-mono);color:var(--em-color-text-primary) }
    .sidebar__input,.sidebar__select { height:32px;padding:0 10px;width:100%;box-sizing:border-box;background:var(--em-color-bg-input);border:1px solid var(--em-color-border-input);border-radius:6px;color:var(--em-color-text-primary);font-size:12px;outline:none;&:focus{border-color:var(--em-color-border-focus)} }
    .sidebar__input--error { border-color:var(--em-color-error)!important }
    .sidebar__field-label { font-size:11px;color:var(--em-color-text-muted);font-weight:500 }
    .sidebar__field-error { font-size:11px;color:var(--em-color-error);padding:2px 0 }
    .sidebar__checkbox { display:flex;align-items:center;gap:6px;font-size:12px;color:var(--em-color-text-secondary);cursor:pointer }
    .sidebar__btn-add { display:flex;align-items:center;justify-content:center;gap:4px;height:32px;padding:0 16px;background:var(--em-color-accent);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;&:hover{background:var(--em-color-accent-hover)}&:disabled{opacity:0.5;cursor:not-allowed} }
    .sidebar__btn-add--compact { height:28px;padding:0 14px }
    .sidebar__btn-cancel { background:none;border:none;color:var(--em-color-text-muted);font-size:12px;cursor:pointer;padding:0 8px;&:hover{color:var(--em-color-text-primary)} }
    .sidebar__add-prop-toggle { display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid var(--em-color-border);background:var(--em-color-bg-input);color:var(--em-color-text-muted);border-radius:4px;cursor:pointer;transition:all .15s;&:hover{color:var(--em-color-accent);border-color:var(--em-color-accent)}&--active{color:var(--em-color-accent);border-color:var(--em-color-accent);background:var(--em-color-accent-subtle);transform:rotate(45deg)} }
    .sidebar__add-card { margin:8px 0 0;border-left:2px solid var(--em-color-accent);background:var(--em-color-accent-subtle);border-radius:0 6px 6px 0;overflow:hidden;animation:expandCard .2s ease-out }
    .sidebar__add-card--closing { animation:collapseCard .15s ease-in forwards }
    .sidebar__add-card-inner { display:flex;flex-direction:column;gap:8px;padding:12px }
    @keyframes expandCard { from{max-height:0;opacity:0}to{max-height:500px;opacity:1} }
    @keyframes collapseCard { from{max-height:500px;opacity:1}to{max-height:0;opacity:0;padding-top:0;padding-bottom:0} }
    .sidebar__add-row { display:flex;align-items:center;justify-content:space-between }
    .sidebar__desc-toggle { display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid var(--em-color-border);background:transparent;color:var(--em-color-text-muted);border-radius:4px;cursor:pointer;transition:all .15s;&:hover{color:var(--em-color-accent)}&--active{color:var(--em-color-accent);border-color:var(--em-color-accent);background:var(--em-color-accent-subtle)} }
    .sidebar__add-desc { width:100%;box-sizing:border-box;padding:6px 8px;background:var(--em-color-bg-input);border:1px solid var(--em-color-border-input);border-radius:4px;color:var(--em-color-text-primary);font-size:11px;font-family:inherit;resize:vertical;outline:none;animation:expandCard .15s ease-out;&:focus{border-color:var(--em-color-border-focus)} }
    .sidebar__add-actions { display:flex;align-items:center;gap:4px;justify-content:flex-end }
    .sidebar__lookup-field { display:flex;flex-direction:column;gap:4px }
    .sidebar__lookup-field--animated { animation:expandCard .15s ease-out }
    .sidebar__lookup-results { max-height:150px;overflow-y:auto;border:1px solid var(--em-color-border);border-radius:6px;background:var(--em-color-bg-primary) }
    .sidebar__lookup-item { display:block;width:100%;padding:6px 10px;border:none;background:transparent;text-align:left;font-size:12px;color:var(--em-color-text-primary);cursor:pointer;&:hover{background:var(--em-color-bg-hover)}&--selected{background:var(--em-color-accent-subtle);color:var(--em-color-accent);font-weight:500} }
    .sidebar__lookup-selected { font-size:12px;color:var(--em-color-text-secondary);padding:4px 0;strong{color:var(--em-color-accent)} }
    .sidebar__spinner { display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin .6s linear infinite }
    @keyframes spin { to{transform:rotate(360deg)} }
  `],
})
export class SidebarComponent implements AfterViewChecked {
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
  @Output() entityNameChanged = new EventEmitter<{ oldName: string; newName: string }>();
  @Output() entityDeleted = new EventEmitter<string>();

  @ViewChild('propNameInput') propNameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  creatioTypes = CREATIO_DATA_TYPES;
  metadata: EntityMetadata = { columnDescriptions: {} };

  // Inline Add Property state
  addPropOpen = false;
  addPropClosing = false;
  newPropName = '';
  newPropCreatioType = 'Text (250)';
  newPropNullable = true;
  newPropLinkedEntity = '';
  lookupSearch = '';
  lookupResults: string[] = [];
  showPropDescription = false;
  newPropDescription = '';
  propNameError = '';

  // Base entity search (for custom entities)
  baseEntitySearch = '';
  baseEntityResults: string[] = [];

  // AI generate properties
  aiGeneratingProps = false;

  // Auto-focus tracking
  private needsNameFocus = false;

  get selectedCreatioType(): CreatioDataType | undefined {
    return this.creatioTypes.find((t) => t.name === this.newPropCreatioType);
  }

  ngOnChanges(): void {
    if (this.entity) {
      this.metadata = this.store.getMetadata(this.entity.name);
      this.baseEntitySearch = '';
      this.baseEntityResults = [];
      // Auto-focus name input for custom entities when sidebar opens
      if (this.entity.isCustom && this.isOpen) {
        this.needsNameFocus = true;
      }
    }
  }

  ngAfterViewChecked(): void {
    if (this.needsNameFocus && this.nameInput) {
      this.nameInput.nativeElement.focus();
      this.nameInput.nativeElement.select();
      this.needsNameFocus = false;
    }
  }

  getTypeLabel(prop: ODataProperty): string {
    if (prop.creatioType) return prop.creatioType;
    return getEdmTypeShort(prop.type);
  }

  getCustomPropertyCount(): number {
    if (!this.entity) return 0;
    return this.entity.properties.filter(p => p.isCustom).length;
  }

  getNonCollectionNavCount(): number {
    if (!this.entity) return 0;
    return this.entity.navigationProperties.filter(n => !n.isCollection).length;
  }

  // === Entity name editing (custom entities) ===
  onEntityNameBlur(event: Event): void {
    (event.target as HTMLInputElement).blur();
  }

  confirmDeleteEntity(): void {
    if (!this.entity) return;
    if (confirm(`Delete "${this.entity.name}"? This will remove the entity and all its custom properties. This action cannot be undone.`)) {
      this.entityDeleted.emit(this.entity.name);
    }
  }

  confirmRemoveProperty(propName: string): void {
    if (confirm(`Remove property "${propName}"? This cannot be undone.`)) {
      this.removeCustomProperty.emit(propName);
    }
  }

  onEntityNameChange(event: Event): void {
    if (!this.entity || !this.entity.isCustom) return;
    const newName = (event.target as HTMLInputElement).value.trim();
    if (!newName || newName === this.entity.name) return;
    this.entityNameChanged.emit({ oldName: this.entity.name, newName });
  }

  // === Base type for custom entities ===
  onBaseEntitySearch(): void {
    if (this.baseEntitySearch.length < 1) {
      this.baseEntityResults = this.store.allEntityNames().slice(0, 15);
      return;
    }
    this.baseEntityResults = this.store.allEntityNames()
      .filter((n) => n.toLowerCase().includes(this.baseEntitySearch.toLowerCase()))
      .slice(0, 15);
  }

  selectBaseEntityForCurrent(name: string): void {
    if (!this.entity || !this.entity.isCustom) return;
    this.baseEntityResults = [];
    this.baseEntitySearch = '';
    this.store.updateCustomEntityBaseType(this.entity.name, name);
  }

  clearBaseType(): void {
    if (!this.entity || !this.entity.isCustom) return;
    this.store.updateCustomEntityBaseType(this.entity.name, undefined);
  }

  // === AI Description ===
  async aiDescribeEntity(): Promise<void> {
    if (!this.entity || this.aiService.generating()) return;
    try {
      const result = await this.aiService.describeEntity(this.entity, this.metadata);
      if (result.entityDescription) {
        this.store.setEntityDescription(this.entity.name, result.entityDescription);
      }
      for (const [col, desc] of Object.entries(result.columnDescriptions)) {
        if (desc) {
          this.store.setColumnDescription(this.entity.name, col, desc);
        }
      }
      this.metadata = this.store.getMetadata(this.entity.name);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.toast.error('AI generation failed', msg);
    }
  }

  // === AI Generate Properties ===
  async aiGenerateProperties(): Promise<void> {
    if (!this.entity || this.aiGeneratingProps) return;
    this.aiGeneratingProps = true;
    try {
      const description = this.metadata.description || this.entity.name;
      const generated = await this.aiService.generateProperties(
        this.entity.name, description, this.entity.baseType
      );

      if (generated.length === 0) {
        this.toast.info('No properties generated', 'AI could not determine appropriate properties.');
        return;
      }

      let addedCount = 0;
      for (const gp of generated) {
        // Skip if property already exists
        if (this.entity.properties.some(p => p.name === gp.name)) continue;

        const prop: ODataProperty = {
          name: gp.name,
          type: gp.type || 'Edm.String',
          nullable: true,
          isKey: false,
          isCustom: true,
          creatioType: gp.creatioType || 'Text (250)',
          linkedEntity: gp.linkedEntity,
        };
        this.propertyAdded.emit(prop);
        addedCount++;

        // Set description for the new property
        if (gp.description) {
          this.store.setColumnDescription(this.entity.name, gp.name, gp.description);
        }
      }

      this.metadata = this.store.getMetadata(this.entity.name);
      this.toast.success('Properties generated', `${addedCount} properties added to ${this.entity.name}.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.toast.error('AI generation failed', msg);
    } finally {
      this.aiGeneratingProps = false;
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

  // === Inline Add Property ===
  toggleAddProperty(): void {
    if (this.addPropOpen) {
      this.cancelAddProperty();
    } else {
      this.addPropOpen = true;
      this.addPropClosing = false;
      setTimeout(() => this.propNameInput?.nativeElement.focus(), 50);
    }
  }

  cancelAddProperty(): void {
    this.addPropClosing = true;
    setTimeout(() => {
      this.addPropOpen = false;
      this.addPropClosing = false;
      this.resetAddForm();
    }, 150);
  }

  onPropNameBlur(): void {
    if (!this.newPropName.trim()) {
      this.propNameError = '';
      return;
    }
    if (this.entity?.properties.some(p => p.name.toLowerCase() === this.newPropName.trim().toLowerCase())) {
      this.propNameError = 'A property with this name already exists';
    } else {
      this.propNameError = '';
    }
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

  addProperty(): void {
    if (!this.newPropName.trim()) {
      this.propNameError = 'Name and type required';
      return;
    }
    const ct = this.selectedCreatioType;
    if (!ct) {
      this.propNameError = 'Name and type required';
      return;
    }
    if (ct.requiresLookup && !this.newPropLinkedEntity) return;

    if (this.entity?.properties.some(p => p.name.toLowerCase() === this.newPropName.trim().toLowerCase())) {
      this.propNameError = 'A property with this name already exists';
      return;
    }

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

    if (this.newPropDescription.trim() && this.entity) {
      this.store.setColumnDescription(this.entity.name, propName, this.newPropDescription.trim());
      this.metadata = this.store.getMetadata(this.entity.name);
    }

    this.addPropClosing = true;
    setTimeout(() => {
      this.addPropOpen = false;
      this.addPropClosing = false;
      this.resetAddForm();
    }, 150);
  }

  private resetAddForm(): void {
    this.newPropName = '';
    this.newPropCreatioType = 'Text (250)';
    this.newPropNullable = true;
    this.newPropLinkedEntity = '';
    this.lookupSearch = '';
    this.lookupResults = [];
    this.showPropDescription = false;
    this.newPropDescription = '';
    this.propNameError = '';
  }
}
