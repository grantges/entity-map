import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../atoms/icon/icon.component';
import { AiService } from '../../../core/services/ai.service';
import { EnvironmentStorageService } from '../../../core/services/environment-storage.service';
import { ODataConnectionService } from '../../../core/services/odata-connection.service';
import { BaselineService } from '../../../core/services/baseline.service';
import { ThemeService } from '../../../core/services/theme.service';
import { formatDate as sharedFormatDate } from '../../../core/utils/format';

@Component({
  selector: 'em-settings-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    @if (isOpen) {
      <div class="overlay" (click)="closed.emit()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog__header">
            <span class="dialog__title">Settings</span>
            <button class="dialog__close" (click)="closed.emit()">
              <em-icon name="x" [size]="16" />
            </button>
          </div>

          <div class="dialog__nav">
            <button class="nav-item" [class.nav-item--active]="activeTab() === 'general'"
              (click)="activeTab.set('general')">General</button>
            <button class="nav-item" [class.nav-item--active]="activeTab() === 'ai'"
              (click)="activeTab.set('ai')">AI / OpenAI</button>
            <button class="nav-item" [class.nav-item--active]="activeTab() === 'connections'"
              (click)="activeTab.set('connections')">Environments</button>
            <button class="nav-item" [class.nav-item--active]="activeTab() === 'baselines'"
              (click)="activeTab.set('baselines')">Baselines</button>
          </div>

          <div class="dialog__body">
            <!-- ===== GENERAL ===== -->
            @if (activeTab() === 'general') {
              <div class="section">
                <h3 class="section__title">Appearance</h3>
                <div class="setting-row">
                  <div class="setting-row__info">
                    <span class="setting-row__label">Theme</span>
                    <span class="setting-row__desc">Choose your preferred appearance</span>
                  </div>
                  <div class="theme-switcher">
                    <button class="theme-opt" [class.theme-opt--active]="themeService.preference() === 'system'"
                      (click)="themeService.setPreference('system')">System</button>
                    <button class="theme-opt" [class.theme-opt--active]="themeService.preference() === 'light'"
                      (click)="themeService.setPreference('light')">
                      <em-icon name="sun" [size]="12" /> Light
                    </button>
                    <button class="theme-opt" [class.theme-opt--active]="themeService.preference() === 'dark'"
                      (click)="themeService.setPreference('dark')">
                      <em-icon name="moon" [size]="12" /> Dark
                    </button>
                  </div>
                </div>
              </div>

              <div class="section">
                <h3 class="section__title">Environment</h3>
                <div class="setting-row">
                  <div class="setting-row__info">
                    <span class="setting-row__label">Current environment</span>
                    <span class="setting-row__desc">{{ currentEnvironmentName || 'None loaded' }}</span>
                  </div>
                  <button class="action-btn" (click)="switchEnvironment.emit()">
                    Switch
                  </button>
                </div>
              </div>

              <div class="section">
                <h3 class="section__title">Data</h3>
                <div class="setting-row">
                  <div class="setting-row__info">
                    <span class="setting-row__label">Clear custom data</span>
                    <span class="setting-row__desc">Remove all custom properties, entities, and descriptions for this environment</span>
                  </div>
                  <button class="action-btn action-btn--danger" (click)="confirmClearData()">
                    Clear
                  </button>
                </div>
              </div>
            }

            <!-- ===== AI ===== -->
            @if (activeTab() === 'ai') {
              <div class="section">
                <h3 class="section__title">OpenAI Configuration</h3>
                <p class="section__desc">
                  Configure OpenAI for automatic entity/column descriptions and AI-enhanced documentation export.
                </p>

                <div class="field">
                  <label class="field__label">API Key</label>
                  <input class="field__input" type="password"
                    [value]="aiService.apiKey()"
                    (blur)="onApiKeyChange($event)"
                    placeholder="sk-..." autocomplete="off" />
                  <span class="field__hint">Stored in browser localStorage. Never sent anywhere except OpenAI.</span>
                </div>

                <div class="field">
                  <label class="field__label">Model</label>
                  <select class="field__select" [value]="aiService.model()"
                    (change)="onModelChange($event)">
                    <option value="gpt-4o-mini">GPT-4o Mini (fast, affordable)</option>
                    <option value="gpt-4o">GPT-4o (best quality)</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo (fastest)</option>
                  </select>
                </div>

                <div class="status-badge" [class.status-badge--ok]="aiService.isConfigured()"
                  [class.status-badge--warn]="!aiService.isConfigured()">
                  @if (aiService.isConfigured()) {
                    <em-icon name="eye" [size]="12" /> API key configured — AI features enabled
                  } @else {
                    <em-icon name="eye-off" [size]="12" /> No API key set — AI features disabled
                  }
                </div>
              </div>
            }

            <!-- ===== ENVIRONMENTS ===== -->
            @if (activeTab() === 'connections') {
              <div class="section">
                <h3 class="section__title">Environments</h3>
                <p class="section__desc">
                  Every schema you have imported. A connected environment can pull a
                  fresh schema; a file environment is updated by importing again.
                  Deleting removes the cached schema and any saved password.
                </p>

                @if (envService.environments().length === 0) {
                  <div class="empty-state">No environments yet</div>
                }

                @for (env of envService.environments(); track env.id) {
                  <div class="conn-card">
                    <div class="conn-card__info">
                      <input class="field__input" [value]="env.name"
                        (change)="renameEnv(env.id, $event)" />
                      <span class="conn-card__meta">
                        @if (env.connection) {
                          {{ env.connection.url }} &middot; {{ env.connection.username }}
                        } @else {
                          Imported from file
                        }
                        @if (env.entityCount) {
                          &middot; {{ env.entityCount }} entities
                        } @else {
                          &middot; not pulled yet
                        }
                      </span>
                      @if (env.connection?.hasStoredPassword) {
                        <button class="link-btn" (click)="forgetPassword(env.id)">
                          Forget saved password
                        </button>
                      }
                    </div>
                    <button class="conn-card__delete" (click)="deleteEnv(env.id)"
                      [title]="'Delete ' + env.name">
                      <em-icon name="trash" [size]="12" />
                    </button>
                  </div>
                }
              </div>
            }

            <!-- ===== BASELINES ===== -->
            @if (activeTab() === 'baselines') {
              <div class="section">
                <h3 class="section__title">Schema Baselines</h3>
                <p class="section__desc">
                  Capture snapshots of the current schema to compare changes over time.
                  Use "Document changes only" in the export dialog to generate delta documentation.
                </p>

                <div class="field">
                  <label class="field__label">New Baseline</label>
                  <div class="field__row">
                    <input class="field__input" [(ngModel)]="baselineName"
                      placeholder="e.g. Sprint 1 baseline, Pre-release..." />
                    <button class="action-btn" [disabled]="!baselineName.trim()"
                      (click)="captureBaseline()">
                      <em-icon name="camera" [size]="14" /> Capture
                    </button>
                  </div>
                </div>

                @if (baselineMessage()) {
                  <div class="status-badge status-badge--ok">{{ baselineMessage() }}</div>
                }

                @if (baselineService.baselinesForCurrentEnv().length > 0) {
                  <div class="field" style="margin-top: 16px">
                    <label class="field__label">Saved Baselines</label>
                    @for (bl of baselineService.baselinesForCurrentEnv(); track bl.id) {
                      <div class="conn-card">
                        <div class="conn-card__info">
                          <span class="conn-card__name">{{ bl.name }}</span>
                          <span class="conn-card__meta">
                            {{ bl.entityCount }} entities · {{ formatDate(bl.capturedAt) }}
                          </span>
                        </div>
                        <button class="conn-card__delete" (click)="baselineService.deleteBaseline(bl.id)">
                          <em-icon name="trash" [size]="12" />
                        </button>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="empty-state">No baselines captured for this environment</div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: var(--em-color-bg-overlay);
      display: flex; align-items: center; justify-content: center; z-index: 50;
    }
    .dialog {
      width: 580px; max-height: 80vh;
      background: var(--em-color-bg-primary); border: 1px solid var(--em-color-border);
      border-radius: var(--em-radius-lg); box-shadow: var(--em-shadow-xl);
      display: flex; flex-direction: column;
    }
    .dialog__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid var(--em-color-border);
    }
    .dialog__title {
      font-weight: 600; font-size: 16px; color: var(--em-color-text-primary);
    }
    .dialog__close {
      display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
      border: none; background: transparent; color: var(--em-color-text-muted);
      border-radius: 4px; cursor: pointer;
      &:hover { background: var(--em-color-bg-hover); }
    }

    /* Nav tabs */
    .dialog__nav {
      display: flex; border-bottom: 1px solid var(--em-color-border);
      padding: 0 20px; gap: 4px;
    }
    .nav-item {
      padding: 10px 14px; border: none; background: transparent;
      color: var(--em-color-text-secondary); font-size: 13px; font-weight: 500;
      cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: all 0.15s;
      &:hover { color: var(--em-color-text-primary); }
    }
    .nav-item--active {
      color: var(--em-color-accent); border-bottom-color: var(--em-color-accent);
    }

    /* Body */
    .dialog__body { flex: 1; overflow-y: auto; padding: 20px; }

    /* Sections */
    .section { & + .section { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--em-color-border); } }
    .section__title {
      font-size: 14px; font-weight: 600; color: var(--em-color-text-primary); margin-bottom: 4px;
    }
    .section__desc {
      font-size: 12px; color: var(--em-color-text-muted); margin-bottom: 16px; line-height: 1.5;
    }

    /* Setting rows */
    .setting-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 0;
      & + .setting-row { border-top: 1px solid var(--em-color-border); }
    }
    .setting-row__info { display: flex; flex-direction: column; gap: 2px; }
    .setting-row__label { font-size: 13px; font-weight: 500; color: var(--em-color-text-primary); }
    .setting-row__desc { font-size: 12px; color: var(--em-color-text-muted); }

    /* Buttons */
    .theme-switcher {
      display: flex; gap: 2px; padding: 2px;
      background: var(--em-color-bg-secondary); border-radius: 6px;
    }
    .theme-opt {
      display: flex; align-items: center; gap: 4px; padding: 5px 10px;
      border: none; border-radius: 4px; background: transparent;
      color: var(--em-color-text-muted); font-size: 11px; font-weight: 500;
      cursor: pointer; transition: all 0.12s;
      &:hover { color: var(--em-color-text-primary); }
    }
    .theme-opt--active {
      background: var(--em-color-bg-primary); color: var(--em-color-text-primary);
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }
    .action-btn {
      display: flex; align-items: center; gap: 4px; padding: 6px 14px;
      border: 1px solid var(--em-color-border); border-radius: 6px;
      background: var(--em-color-bg-input); color: var(--em-color-text-primary);
      font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap;
      &:hover { border-color: var(--em-color-accent); color: var(--em-color-accent); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .action-btn--danger {
      &:hover { border-color: var(--em-color-error); color: var(--em-color-error); }
    }

    /* Fields */
    .field { margin-top: 12px; }
    .field__label {
      display: block; font-size: 12px; font-weight: 500;
      color: var(--em-color-text-secondary); margin-bottom: 6px;
    }
    .field__input {
      width: 100%; padding: 8px 12px;
      background: var(--em-color-bg-input); border: 1px solid var(--em-color-border-input);
      border-radius: 6px; color: var(--em-color-text-primary); font-size: 13px; outline: none;
      &:focus { border-color: var(--em-color-border-focus); }
    }
    .field__select {
      width: 100%; padding: 8px 12px;
      background: var(--em-color-bg-input); border: 1px solid var(--em-color-border-input);
      border-radius: 6px; color: var(--em-color-text-primary); font-size: 13px; outline: none;
      &:focus { border-color: var(--em-color-border-focus); }
    }
    .field__hint { display: block; font-size: 11px; color: var(--em-color-text-muted); margin-top: 4px; }
    .field__row { display: flex; gap: 8px; }

    /* Status badge */
    .status-badge {
      display: flex; align-items: center; gap: 6px;
      margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 12px;
    }
    .status-badge--ok { background: rgba(5,150,105,0.08); color: #059669; }
    .status-badge--warn { background: rgba(217,119,6,0.08); color: #d97706; }

    /* Connection cards */
    .conn-card {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border: 1px solid var(--em-color-border);
      border-radius: 6px; margin-top: 8px;
    }
    .conn-card__info { display: flex; flex-direction: column; gap: 2px; }
    .conn-card__name { font-weight: 500; font-size: 13px; color: var(--em-color-text-primary); }
    .conn-card__meta { font-size: 11px; color: var(--em-color-text-muted); }
    .link-btn {
      align-self: flex-start; margin-top: 4px; padding: 0;
      background: none; border: none; color: var(--em-color-accent);
      font-size: 11px; cursor: pointer; text-decoration: underline;
    }
    .conn-card__delete {
      display: flex; align-items: center; background: none; border: none;
      color: var(--em-color-text-muted); cursor: pointer; padding: 4px;
      &:hover { color: var(--em-color-error); }
    }

    .empty-state {
      padding: 20px; text-align: center; font-size: 13px;
      color: var(--em-color-text-muted); border: 1px dashed var(--em-color-border);
      border-radius: 6px; margin-top: 8px;
    }
  `],
})
export class SettingsDialogComponent {
  readonly aiService = inject(AiService);
  readonly odataService = inject(ODataConnectionService);
  readonly envService = inject(EnvironmentStorageService);
  readonly baselineService = inject(BaselineService);
  readonly themeService = inject(ThemeService);

  @Input() isOpen = false;
  @Input() currentEnvironmentName = '';
  @Output() closed = new EventEmitter<void>();
  @Output() switchEnvironment = new EventEmitter<void>();
  @Output() clearCustomData = new EventEmitter<void>();

  readonly activeTab = signal<'general' | 'ai' | 'connections' | 'baselines'>('general');

  renameEnv(id: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value.trim();
    if (name) this.envService.rename(id, name);
  }

  async deleteEnv(id: string): Promise<void> {
    await this.envService.delete(id);
  }

  async forgetPassword(id: string): Promise<void> {
    await this.envService.deletePassword(id);
  }
  readonly baselineMessage = signal('');
  baselineName = '';

  async onApiKeyChange(event: Event): Promise<void> {
    await this.aiService.setApiKey((event.target as HTMLInputElement).value);
  }

  onModelChange(event: Event): void {
    this.aiService.setModel((event.target as HTMLSelectElement).value);
  }

  confirmClearData(): void {
    if (confirm('This will remove all custom properties, entities, and descriptions for this environment. Continue?')) {
      this.clearCustomData.emit();
    }
  }

  async captureBaseline(): Promise<void> {
    const name = this.baselineName.trim();
    if (!name) return;
    await this.baselineService.captureBaseline(name);
    this.baselineName = '';
    this.baselineMessage.set('Baseline captured!');
    setTimeout(() => this.baselineMessage.set(''), 3000);
  }

  formatDate(iso: string): string {
    return sharedFormatDate(iso);
  }
}
