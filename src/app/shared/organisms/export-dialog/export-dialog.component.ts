import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../atoms/icon/icon.component';
import { AiService } from '../../../core/services/ai.service';
import { BaselineService } from '../../../core/services/baseline.service';
import { formatDate as sharedFormatDate } from '../../../core/utils/format';

@Component({
  selector: 'em-export-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    @if (isOpen) {
      <div class="overlay" (click)="closed.emit()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog__header">
            <span class="dialog__title">Export & Settings</span>
            <button class="dialog__close" (click)="closed.emit()">
              <em-icon name="x" [size]="16" />
            </button>
          </div>

          <div class="dialog__tabs">
            <button class="dialog__tab" [class.dialog__tab--active]="activeTab() === 'docs'"
              (click)="activeTab.set('docs')">
              <em-icon name="file-text" [size]="14" /> Documentation
            </button>
            <button class="dialog__tab" [class.dialog__tab--active]="activeTab() === 'schema'"
              (click)="activeTab.set('schema')">
              <em-icon name="database" [size]="14" /> Creatio Schema
            </button>
            <!-- Baseline and AI settings moved to Settings dialog -->
          </div>

          <div class="dialog__body">
            <!-- ===== DOCUMENTATION TAB ===== -->
            @if (activeTab() === 'docs') {
              <div class="dialog__section">
                <p class="dialog__hint">
                  Exports a Word document (.docx) with property tables, type annotations,
                  and FK cross-references linking to target entities within the document.
                </p>
              </div>

              @if (aiService.isConfigured()) {
                <div class="dialog__section">
                  <label class="dialog__checkbox-label">
                    <input type="checkbox" [(ngModel)]="aiEnhancedDocs" />
                    <em-icon name="sparkles" [size]="12" />
                    AI-enhanced documentation
                  </label>

                  @if (aiEnhancedDocs) {
                    <div class="dialog__radio-group">
                      <label class="dialog__radio-label">
                        <input type="radio" name="aiMode" value="fill-missing"
                          [(ngModel)]="aiDescriptionMode" />
                        Fill missing descriptions only
                        <span class="dialog__radio-hint">Adds AI descriptions where none exist, keeps your existing text</span>
                      </label>
                      <label class="dialog__radio-label">
                        <input type="radio" name="aiMode" value="override-all"
                          [(ngModel)]="aiDescriptionMode" />
                        Override all descriptions
                        <span class="dialog__radio-hint">Regenerates all entity & column descriptions using AI</span>
                      </label>
                    </div>
                  }
                </div>
              }

              <!-- Baseline diff option -->
              @if (baselineService.baselinesForCurrentEnv().length > 0) {
                <div class="dialog__section">
                  <label class="dialog__checkbox-label">
                    <input type="checkbox" [(ngModel)]="deltaOnly" (ngModelChange)="onDeltaToggle($event)" />
                    <em-icon name="git-compare" [size]="12" />
                    Document changes only (delta from baseline)
                  </label>
                  @if (deltaOnly) {
                    <select class="dialog__select" [(ngModel)]="selectedBaselineId">
                      @for (bl of baselineService.baselinesForCurrentEnv(); track bl.id) {
                        <option [value]="bl.id">{{ bl.name }} ({{ formatDate(bl.capturedAt) }})</option>
                      }
                    </select>
                  }
                </div>
              }

              <div class="dialog__section">
                <label class="dialog__label">Entities to include ({{ entityNames.length }})</label>
                <div class="dialog__entity-list">
                  @for (name of entityNames; track name) {
                    <span class="dialog__entity-tag">{{ name }}</span>
                  }
                </div>
              </div>
            }

            <!-- ===== SCHEMA TAB ===== -->
            @if (activeTab() === 'schema') {
              <div class="dialog__section">
                <label class="dialog__label">Package Name</label>
                <input class="dialog__input" [(ngModel)]="packageName" placeholder="CustomPackage" />
              </div>
              <div class="dialog__section">
                <label class="dialog__checkbox-label">
                  <input type="checkbox" [(ngModel)]="customOnly" />
                  Export custom properties only
                </label>
              </div>
              <div class="dialog__section">
                <label class="dialog__label">Entities</label>
                <div class="dialog__entity-list">
                  @for (name of entityNames; track name) {
                    <span class="dialog__entity-tag">{{ name }}</span>
                  }
                </div>
              </div>
            }

            <!-- Baseline and AI settings are in the Settings dialog -->
          </div>

          <div class="dialog__footer">
            <button class="dialog__btn dialog__btn--secondary" (click)="closed.emit()">
              Cancel
            </button>
            @if (activeTab() === 'docs' || activeTab() === 'schema') {
              <button class="dialog__btn dialog__btn--primary" (click)="onExport()">
                <em-icon name="download" [size]="14" /> Export
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0;
      background: var(--em-color-bg-overlay);
      display: flex; align-items: center; justify-content: center; z-index: 50;
    }
    .dialog {
      width: 520px; max-height: 80vh;
      background: var(--em-color-bg-primary); border: 1px solid var(--em-color-border);
      border-radius: var(--em-radius-lg); box-shadow: var(--em-shadow-xl);
      display: flex; flex-direction: column;
    }
    .dialog__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--em-space-4); border-bottom: 1px solid var(--em-color-border);
    }
    .dialog__title {
      font-weight: var(--em-font-weight-semibold); font-size: var(--em-font-size-lg);
      color: var(--em-color-text-primary);
    }
    .dialog__close {
      display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
      border: none; background: transparent; color: var(--em-color-text-muted);
      border-radius: var(--em-radius-sm); cursor: pointer;
      &:hover { background: var(--em-color-bg-hover); }
    }
    .dialog__tabs { display: flex; border-bottom: 1px solid var(--em-color-border); }
    .dialog__tab {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
      padding: var(--em-space-3); border: none; background: transparent;
      color: var(--em-color-text-secondary); font-size: 12px; font-weight: 500;
      cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: all 0.15s;
      &:hover { color: var(--em-color-text-primary); background: var(--em-color-bg-hover); }
    }
    .dialog__tab--active {
      color: var(--em-color-accent); border-bottom-color: var(--em-color-accent);
    }
    .dialog__body { padding: var(--em-space-4); overflow-y: auto; flex: 1; }
    .dialog__section { & + & { margin-top: var(--em-space-3); } }
    .dialog__label {
      display: block; font-size: var(--em-font-size-sm); font-weight: 500;
      color: var(--em-color-text-secondary); margin-bottom: var(--em-space-1);
    }
    .dialog__input {
      width: 100%; height: 36px; padding: 0 var(--em-space-3);
      background: var(--em-color-bg-input); border: 1px solid var(--em-color-border-input);
      border-radius: var(--em-radius-md); color: var(--em-color-text-primary);
      font-size: var(--em-font-size-sm); outline: none;
      &:focus { border-color: var(--em-color-border-focus); }
    }
    .dialog__select {
      width: 100%; height: 36px; padding: 0 var(--em-space-3); margin-top: var(--em-space-2);
      background: var(--em-color-bg-input); border: 1px solid var(--em-color-border-input);
      border-radius: var(--em-radius-md); color: var(--em-color-text-primary);
      font-size: var(--em-font-size-sm); outline: none;
      &:focus { border-color: var(--em-color-border-focus); }
    }
    .dialog__checkbox-label {
      display: flex; align-items: center; gap: var(--em-space-2);
      font-size: var(--em-font-size-sm); color: var(--em-color-text-secondary);
      cursor: pointer; padding: var(--em-space-1) 0;
    }
    .dialog__row { display: flex; gap: var(--em-space-2); }
    .dialog__radio-group {
      display: flex; flex-direction: column; gap: 8px;
      margin-top: 10px; padding-left: 24px;
    }
    .dialog__radio-label {
      display: flex; align-items: flex-start; gap: 8px;
      font-size: 13px; color: var(--em-color-text-secondary);
      cursor: pointer; line-height: 1.4;
      input { margin-top: 3px; }
    }
    .dialog__radio-hint {
      display: block; font-size: 11px; color: var(--em-color-text-muted);
      margin-top: 1px;
    }
    .dialog__entity-list {
      display: flex; flex-wrap: wrap; gap: var(--em-space-1);
      max-height: 120px; overflow-y: auto;
    }
    .dialog__hint {
      font-size: var(--em-font-size-sm); color: var(--em-color-text-secondary); line-height: 1.5;
    }
    .dialog__entity-tag {
      display: inline-flex; padding: 2px 8px;
      background: var(--em-color-bg-secondary); border: 1px solid var(--em-color-border);
      border-radius: var(--em-radius-sm); font-size: var(--em-font-size-xs);
      color: var(--em-color-text-secondary);
    }
    .dialog__footer {
      display: flex; justify-content: flex-end; gap: var(--em-space-2);
      padding: var(--em-space-4); border-top: 1px solid var(--em-color-border);
    }
    .dialog__btn {
      display: flex; align-items: center; gap: var(--em-space-2);
      height: 36px; padding: 0 var(--em-space-4); border: 1px solid transparent;
      border-radius: var(--em-radius-md); font-size: var(--em-font-size-sm);
      font-weight: 500; cursor: pointer; transition: all 0.15s;
    }
    .dialog__btn--primary {
      background: var(--em-color-accent); color: white;
      &:hover { opacity: 0.9; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .dialog__btn--secondary {
      background: transparent; color: var(--em-color-text-secondary);
      border-color: var(--em-color-border);
      &:hover { background: var(--em-color-bg-hover); }
    }
    .dialog__status { font-size: 12px; padding: 8px 0; }
    .dialog__status--ok { color: #059669; }
    .dialog__status--warn { color: #d97706; }
    .dialog__success {
      margin-top: var(--em-space-3); padding: var(--em-space-3);
      background: rgba(5,150,105,0.08); border: 1px solid rgba(5,150,105,0.2);
      border-radius: var(--em-radius-md); color: #059669; font-size: 13px; text-align: center;
    }
    .baseline-card {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; border: 1px solid var(--em-color-border);
      border-radius: var(--em-radius-md); margin-bottom: var(--em-space-2);
    }
    .baseline-card__info { display: flex; flex-direction: column; gap: 2px; }
    .baseline-card__name { font-weight: 600; font-size: 13px; color: var(--em-color-text-primary); }
    .baseline-card__meta { font-size: 11px; color: var(--em-color-text-muted); }
    .baseline-card__delete {
      display: flex; align-items: center; background: none; border: none;
      color: var(--em-color-text-muted); cursor: pointer;
      &:hover { color: var(--em-color-error); }
    }
  `],
})
export class ExportDialogComponent {
  readonly aiService = inject(AiService);
  readonly baselineService = inject(BaselineService);

  @Input() isOpen = false;
  @Input() entityNames: string[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() exportSchema = new EventEmitter<{ packageName: string; customOnly: boolean }>();
  @Output() exportDocs = new EventEmitter<{
    aiEnhanced: boolean;
    aiDescriptionMode: 'fill-missing' | 'override-all';
    deltaOnly: boolean;
    baselineId: string | null;
  }>();

  readonly activeTab = signal<'schema' | 'docs'>('docs');

  packageName = 'CustomPackage';
  customOnly = false;
  aiEnhancedDocs = false;
  aiDescriptionMode: 'fill-missing' | 'override-all' = 'fill-missing';
  deltaOnly = false;
  selectedBaselineId = '';

  onDeltaToggle(enabled: boolean): void {
    if (enabled) {
      // Auto-select the first baseline so the select isn't empty
      const baselines = this.baselineService.baselinesForCurrentEnv();
      if (baselines.length > 0) {
        this.selectedBaselineId = baselines[0].id;
      }
    }
  }

  formatDate(iso: string): string {
    return sharedFormatDate(iso);
  }

  onExport(): void {
    if (this.activeTab() === 'schema') {
      this.exportSchema.emit({ packageName: this.packageName, customOnly: this.customOnly });
    } else if (this.activeTab() === 'docs') {
      this.exportDocs.emit({
        aiEnhanced: this.aiEnhancedDocs,
        aiDescriptionMode: this.aiDescriptionMode,
        deltaOnly: this.deltaOnly,
        baselineId: this.deltaOnly ? this.selectedBaselineId : null,
      });
    }
    this.closed.emit();
  }
}
