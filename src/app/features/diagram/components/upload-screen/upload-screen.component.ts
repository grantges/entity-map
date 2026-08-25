import {
  Component,
  inject,
  signal,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MetadataParserService } from '../../../../core/services/metadata-parser.service';
import { MetadataStoreService } from '../../../../core/services/metadata-store.service';
import { EnvironmentStorageService, Environment, hasSchema } from '../../../../core/services/environment-storage.service';
import { ODataConnectionService } from '../../../../core/services/odata-connection.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { IS_ELECTRON } from '../../../../core/platform/platform.model';
import { ParseResult } from '../../../../core/models/entity.model';
import { formatDate as sharedFormatDate, formatSize as sharedFormatSize } from '../../../../core/utils/format';
import { IconComponent } from '../../../../shared/atoms/icon/icon.component';
import { BadgeComponent } from '../../../../shared/atoms/badge/badge.component';

@Component({
  selector: 'em-upload-screen',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, BadgeComponent],
  template: `
    <div class="upload-screen">
      @if (isElectron) {
        <!-- The upload screen has no toolbar, so without this the window has
             no draggable region at all before a schema is loaded. -->
        <div class="upload-screen__drag-strip"></div>
      }
      <div class="upload-card">
        <div class="upload-card__icon">
          <em-icon name="database" [size]="48" />
        </div>
        <h1 class="upload-card__title">Entity Map</h1>
        <p class="upload-card__subtitle">
          Visualize Creatio OData metadata as interactive entity relationship diagrams
        </p>

        <!-- Unified environment picker: cached imports and live
             connections are the same kind of thing, so they share one list. -->
        @if (envService.hasEnvironments()) {
          <div class="env-picker">
            <div class="env-picker__label">Open an environment</div>
            <button class="env-picker__trigger" (click)="pickerOpen.set(!pickerOpen())">
              <span class="env-picker__trigger-text">
                {{ envService.environments().length }} saved
                {{ envService.environments().length === 1 ? 'environment' : 'environments' }}
              </span>
              <em-icon [name]="pickerOpen() ? 'chevron-up' : 'chevron-down'" [size]="16" />
            </button>

            @if (pickerOpen()) {
              <div class="env-picker__backdrop" (click)="pickerOpen.set(false)"></div>
              <div class="env-picker__list" role="menu">
                @for (env of envService.environments(); track env.id) {
                  <button class="env-option" (click)="chooseEnvironment(env)">
                    <em-icon [name]="env.connection ? 'wifi' : 'upload'" [size]="14" />
                    <span class="env-option__info">
                      <span class="env-option__name">{{ env.name }}</span>
                      <span class="env-option__meta">{{ describe(env) }}</span>
                    </span>
                    <em-badge
                      [text]="env.connection ? 'Connected' : 'File'"
                      [variant]="env.connection ? 'count' : 'custom'" />
                  </button>
                }
              </div>
            }
          </div>

          <!-- Password prompt for a connected environment with no stored password -->
          @if (needsPassword()) {
            <div class="pw-prompt">
              <div class="pw-prompt__title">
                Connect to {{ needsPassword()!.name }}
              </div>
              <div class="pw-prompt__meta">
                {{ needsPassword()!.connection!.username }} &middot;
                {{ needsPassword()!.connection!.url }}
              </div>
              <input class="live-connect__input" type="password" placeholder="Password"
                [(ngModel)]="pullPassword"
                (keydown.enter)="confirmPull()" />
              @if (canStorePassword()) {
                <label class="sidebar__checkbox">
                  <input type="checkbox" [(ngModel)]="rememberPassword" />
                  Remember in system keychain
                </label>
              }
              <div class="pw-prompt__actions">
                <button class="env-name-prompt__btn" [disabled]="!pullPassword || odataService.connecting()"
                  (click)="confirmPull()">
                  @if (odataService.connecting()) {
                    {{ odataService.progress() }}
                  } @else {
                    Connect & Pull
                  }
                </button>
                <button class="pw-prompt__cancel" (click)="cancelPull()">Cancel</button>
              </div>
              @if (odataService.error()) {
                <div class="upload-card__error">{{ odataService.error() }}</div>
              }
            </div>
          }

          <div class="env-section__divider">
            <span>or add a new environment</span>
          </div>
        }

        <!-- Tab selector: Upload vs Live Connect -->
        <div class="upload-tabs">
          <button class="upload-tab" [class.upload-tab--active]="uploadMode() === 'file'"
            (click)="uploadMode.set('file')">
            <em-icon name="upload" [size]="14" /> Upload File
          </button>
          <button class="upload-tab" [class.upload-tab--active]="uploadMode() === 'live'"
            (click)="uploadMode.set('live')">
            <em-icon name="wifi" [size]="14" /> Live Connect
          </button>
        </div>

        @if (uploadMode() === 'file') {
          <!-- Upload dropzone -->
          <div
            class="upload-card__dropzone"
            [class.upload-card__dropzone--active]="isDragging()"
            (dragover)="onDragOver($event)"
            (dragleave)="isDragging.set(false)"
            (drop)="onDrop($event)"
          >
            <em-icon name="upload" [size]="32" />
            <p>Drop your OData metadata XML file here</p>
            <span>or</span>
            <label class="upload-card__browse">
              Browse files
              <input
                type="file"
                accept=".xml"
                (change)="onFileSelected($event)"
                hidden
              />
            </label>
          </div>
        } @else {
          <!-- Live connection form -->
          <div class="live-connect">
            <input class="live-connect__input" placeholder="Environment URL (e.g., https://myorg.creatio.com)"
              [(ngModel)]="connectUrl" autocomplete="url" />
            <input class="live-connect__input" placeholder="Username"
              [(ngModel)]="connectUsername" autocomplete="username" />
            <input class="live-connect__input" type="password" placeholder="Password"
              [(ngModel)]="connectPassword" autocomplete="current-password" />

            @if (canStorePassword()) {
              <label class="sidebar__checkbox">
                <input type="checkbox" [(ngModel)]="connectSave" />
                Remember password in system keychain
              </label>
            }

            <button class="live-connect__btn"
              [disabled]="odataService.connecting() || !connectUrl || !connectUsername || !connectPassword"
              (click)="liveConnect()">
              @if (odataService.connecting()) {
                {{ odataService.progress() }}
              } @else {
                <em-icon name="wifi" [size]="14" /> Connect & Pull Schema
              }
            </button>

            @if (odataService.error()) {
              <div class="upload-card__error">{{ odataService.error() }}</div>
            }
          </div>
        }

        @if (parserService.parsing()) {
          <div class="upload-card__progress">
            <div class="upload-card__progress-bar">
              <div
                class="upload-card__progress-fill"
                [style.width.%]="parserService.progress()"
              ></div>
            </div>
            <span>Parsing metadata... {{ parserService.progress() }}%</span>
          </div>
        }

        <!-- Environment name prompt after parsing -->
        @if (pendingParseResult()) {
          <div class="env-name-prompt">
            <label class="env-name-prompt__label">Name this environment</label>
            <div class="env-name-prompt__row">
              <input class="env-name-prompt__input"
                [(ngModel)]="envName"
                placeholder="e.g. Production, Sandbox, Dev..."
                (keydown.enter)="confirmEnvironmentName()" />
              <button class="env-name-prompt__btn" (click)="confirmEnvironmentName()">
                Save & Continue
              </button>
            </div>
          </div>
        }

        @if (parseError()) {
          <div class="upload-card__error">
            {{ parseError() }}
          </div>
        }
      </div>

      <button class="upload-screen__theme-btn" (click)="themeService.toggle()">
        <em-icon [name]="themeService.isDark() ? 'sun' : 'moon'" [size]="16" />
      </button>
    </div>
  `,
  styles: [
    `
      /* Upload Screen */
      .upload-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: var(--em-color-bg-canvas);
        position: relative;
      }

      .upload-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--em-space-10);
        background: var(--em-color-bg-primary);
        border: 1px solid var(--em-color-border);
        border-radius: var(--em-radius-xl);
        box-shadow: var(--em-shadow-lg);
        max-width: 520px;
        width: 100%;
      }

      .upload-card__icon {
        color: var(--em-color-accent);
        margin-bottom: var(--em-space-4);
      }

      .upload-card__title {
        font-size: var(--em-font-size-2xl);
        font-weight: var(--em-font-weight-bold);
        color: var(--em-color-text-primary);
        letter-spacing: var(--em-letter-spacing-tight);
      }

      .upload-card__subtitle {
        font-size: var(--em-font-size-sm);
        color: var(--em-color-text-secondary);
        text-align: center;
        margin-top: var(--em-space-2);
        margin-bottom: var(--em-space-6);
      }

      .upload-card__dropzone {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--em-space-2);
        width: 100%;
        padding: var(--em-space-8) var(--em-space-6);
        border: 2px dashed var(--em-color-border-strong);
        border-radius: var(--em-radius-lg);
        color: var(--em-color-text-muted);
        font-size: var(--em-font-size-sm);
        transition: all var(--em-transition-fast);
        cursor: pointer;

        &:hover,
        &--active {
          border-color: var(--em-color-accent);
          background: var(--em-color-accent-subtle);
          color: var(--em-color-text-secondary);
        }

        span {
          font-size: var(--em-font-size-xs);
          text-transform: uppercase;
          letter-spacing: var(--em-letter-spacing-wide);
        }
      }

      .upload-card__browse {
        color: var(--em-color-accent);
        font-weight: var(--em-font-weight-semibold);
        cursor: pointer;
        padding: var(--em-space-2) var(--em-space-4);
        border-radius: var(--em-radius-md);
        transition: background var(--em-transition-fast);

        &:hover {
          background: var(--em-color-accent-subtle);
        }
      }

      .upload-card__progress {
        width: 100%;
        margin-top: var(--em-space-4);
        text-align: center;
        font-size: var(--em-font-size-sm);
        color: var(--em-color-text-secondary);
      }

      .upload-card__progress-bar {
        width: 100%;
        height: 4px;
        background: var(--em-color-bg-secondary);
        border-radius: var(--em-radius-full);
        overflow: hidden;
        margin-bottom: var(--em-space-2);
      }

      .upload-card__progress-fill {
        height: 100%;
        background: var(--em-color-accent);
        border-radius: var(--em-radius-full);
        transition: width 0.3s ease;
      }

      .upload-card__error {
        width: 100%;
        margin-top: var(--em-space-4);
        padding: var(--em-space-3);
        background: rgba(220, 38, 38, 0.1);
        border: 1px solid rgba(220, 38, 38, 0.2);
        border-radius: var(--em-radius-md);
        color: var(--em-color-error);
        font-size: var(--em-font-size-sm);
        text-align: center;
      }

      /* Saved environments */
      .env-section {
        width: 100%;
        margin-bottom: var(--em-space-4);
      }
      .env-section__label {
        font-size: var(--em-font-size-xs);
        font-weight: 600;
        color: var(--em-color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: var(--em-space-2);
      }
      .env-card {
        display: flex;
        align-items: center;
        border: 1px solid var(--em-color-border);
        border-radius: var(--em-radius-md);
        margin-bottom: var(--em-space-2);
        overflow: hidden;
        transition: border-color var(--em-transition-fast);
        &:hover { border-color: var(--em-color-accent); }
      }
      .env-card__main {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--em-space-3) var(--em-space-4);
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        color: var(--em-color-text-primary);
      }
      .env-card__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .env-card__name {
        font-weight: 600;
        font-size: var(--em-font-size-sm);
      }
      .env-card__meta {
        font-size: var(--em-font-size-xs);
        color: var(--em-color-text-muted);
      }
      .env-card__delete {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 100%;
        min-height: 48px;
        background: none;
        border: none;
        border-left: 1px solid var(--em-color-border);
        color: var(--em-color-text-muted);
        cursor: pointer;
        &:hover { background: rgba(220, 38, 38, 0.05); color: var(--em-color-error); }
      }
      .env-section__divider {
        display: flex;
        align-items: center;
        gap: var(--em-space-3);
        margin: var(--em-space-4) 0;
        color: var(--em-color-text-muted);
        font-size: var(--em-font-size-xs);
        &::before, &::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--em-color-border);
        }
      }

      /* Upload tabs */
      .upload-tabs {
        display: flex; gap: 4px; width: 100%; margin-bottom: var(--em-space-4);
        background: var(--em-color-bg-secondary); border-radius: var(--em-radius-md); padding: 3px;
      }
      .upload-tab {
        flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
        padding: 8px 12px; border: none; border-radius: var(--em-radius-sm);
        background: transparent; color: var(--em-color-text-muted); font-size: 13px;
        font-weight: 500; cursor: pointer; transition: all 0.15s;
        &:hover { color: var(--em-color-text-primary); }
      }
      .upload-tab--active {
        background: var(--em-color-bg-primary); color: var(--em-color-text-primary);
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }

      /* Live connection form */
      .live-connect {
        width: 100%; display: flex; flex-direction: column; gap: var(--em-space-3);
      }
      .live-connect__saved { margin-bottom: var(--em-space-2); }
      .live-connect__label {
        font-size: var(--em-font-size-xs); font-weight: 600;
        color: var(--em-color-text-muted); text-transform: uppercase;
        letter-spacing: 0.05em; margin-bottom: var(--em-space-2);
      }
      .live-connect__input {
        width: 100%; padding: 10px 12px;
        background: var(--em-color-bg-input); border: 1px solid var(--em-color-border-input);
        border-radius: var(--em-radius-md); color: var(--em-color-text-primary);
        font-size: 13px; outline: none;
        &:focus { border-color: var(--em-color-border-focus); }
      }
      .live-connect__btn {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        width: 100%; padding: 10px; border: none; border-radius: var(--em-radius-md);
        background: var(--em-color-accent); color: white; font-weight: 600;
        font-size: 13px; cursor: pointer; transition: opacity 0.15s;
        &:hover:not(:disabled) { opacity: 0.9; }
        &:disabled { opacity: 0.5; cursor: not-allowed; }
      }

      /* Environment name prompt */
      .env-name-prompt {
        width: 100%;
        margin-top: var(--em-space-4);
      }
      .env-name-prompt__label {
        display: block;
        font-size: var(--em-font-size-sm);
        font-weight: 500;
        color: var(--em-color-text-secondary);
        margin-bottom: var(--em-space-2);
      }
      .env-name-prompt__row {
        display: flex;
        gap: var(--em-space-2);
      }
      .env-name-prompt__input {
        flex: 1;
        height: 36px;
        padding: 0 var(--em-space-3);
        background: var(--em-color-bg-input);
        border: 1px solid var(--em-color-border-input);
        border-radius: var(--em-radius-md);
        color: var(--em-color-text-primary);
        font-size: var(--em-font-size-sm);
        outline: none;
        &:focus { border-color: var(--em-color-border-focus); }
      }
      .env-name-prompt__btn {
        height: 36px;
        padding: 0 var(--em-space-4);
        background: var(--em-color-accent);
        color: white;
        border: none;
        border-radius: var(--em-radius-md);
        font-size: var(--em-font-size-sm);
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        &:hover { background: var(--em-color-accent-hover); }
      }

      /* Unified environment picker */
      .env-picker { width: 100%; margin-bottom: var(--em-space-3); position: relative; }
      .env-picker__label {
        font-size: var(--em-font-size-xs); font-weight: 600;
        color: var(--em-color-text-muted); text-transform: uppercase;
        letter-spacing: 0.05em; margin-bottom: var(--em-space-2);
      }
      .env-picker__trigger {
        display: flex; align-items: center; justify-content: space-between;
        width: 100%; padding: 10px 12px;
        background: var(--em-color-bg-input);
        border: 1px solid var(--em-color-border-input);
        border-radius: var(--em-radius-md);
        color: var(--em-color-text-primary); font-size: 13px; cursor: pointer;
        &:hover { border-color: var(--em-color-accent); }
      }
      .env-picker__trigger-text { font-weight: 500; }
      /* Overlays the card rather than expanding it -- an expanding panel
       * reflows everything below it and grows without bound as environments
       * accumulate. */
      .env-picker__list {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 20;
        background: var(--em-color-bg-primary);
        border: 1px solid var(--em-color-border);
        border-radius: var(--em-radius-md);
        box-shadow: var(--em-shadow-lg);
        overflow: hidden auto;
        max-height: 280px;
      }
      /* Catches the outside click that dismisses the menu. */
      .env-picker__backdrop {
        position: fixed;
        inset: 0;
        z-index: 10;
      }
      .env-option {
        display: flex; align-items: center; gap: var(--em-space-3);
        width: 100%; padding: var(--em-space-3) var(--em-space-4);
        background: none; border: none; border-bottom: 1px solid var(--em-color-border);
        color: var(--em-color-text-primary); cursor: pointer; text-align: left;
        &:last-child { border-bottom: none; }
        &:hover { background: var(--em-color-bg-hover); }
      }
      .env-option__info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .env-option__name {
        font-weight: 600; font-size: var(--em-font-size-sm);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .env-option__meta { font-size: var(--em-font-size-xs); color: var(--em-color-text-muted); }

      /* Password prompt for a connected environment */
      .pw-prompt {
        width: 100%; display: flex; flex-direction: column; gap: var(--em-space-3);
        padding: var(--em-space-4); margin-bottom: var(--em-space-3);
        border: 1px solid var(--em-color-border);
        border-radius: var(--em-radius-md);
        background: var(--em-color-bg-secondary);
      }
      .pw-prompt__title { font-weight: 600; font-size: var(--em-font-size-sm); }
      .pw-prompt__meta {
        font-size: var(--em-font-size-xs); color: var(--em-color-text-muted);
        margin-top: calc(-1 * var(--em-space-2));
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pw-prompt__actions { display: flex; gap: var(--em-space-2); align-items: center; }
      .pw-prompt__cancel {
        height: 36px; padding: 0 var(--em-space-3);
        background: none; border: 1px solid var(--em-color-border);
        border-radius: var(--em-radius-md); color: var(--em-color-text-secondary);
        font-size: var(--em-font-size-sm); cursor: pointer;
        &:hover { background: var(--em-color-bg-hover); }
      }

      .upload-screen__theme-btn {
        position: absolute;
        top: var(--em-space-4);
        right: var(--em-space-4);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: 1px solid var(--em-color-border);
        background: var(--em-color-bg-primary);
        color: var(--em-color-text-secondary);
        border-radius: var(--em-radius-md);
        cursor: pointer;
        transition: all var(--em-transition-fast);

        &:hover {
          background: var(--em-color-bg-hover);
          color: var(--em-color-text-primary);
        }
      }
    `,
  ],
})
export class UploadScreenComponent {
  readonly parserService = inject(MetadataParserService);
  private readonly store = inject(MetadataStoreService);
  readonly envService = inject(EnvironmentStorageService);
  readonly odataService = inject(ODataConnectionService);
  readonly themeService = inject(ThemeService);
  readonly isElectron = inject(IS_ELECTRON);

  constructor() {
    // Only offer to remember a password when the host can do it securely.
    this.envService.canStorePassword().then((ok) => this.canStorePassword.set(ok));
  }

  readonly environmentReady = output<void>();

  // State
  readonly isDragging = signal(false);
  readonly parseError = signal<string | null>(null);
  readonly pendingParseResult = signal<ParseResult | null>(null);
  envName = '';
  readonly uploadMode = signal<'file' | 'live'>('file');

  // Environment picker
  readonly pickerOpen = signal(false);
  /** Connected environment awaiting a password before it can pull. */
  readonly needsPassword = signal<Environment | null>(null);
  readonly canStorePassword = signal(false);
  pullPassword = '';
  rememberPassword = true;

  // Live connection form
  connectUrl = '';
  connectUsername = '';
  connectPassword = '';
  connectSave = true;

  // File handling
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file && file.name.endsWith('.xml')) {
      this.loadFile(file);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.loadFile(file);
    }
  }

  private loadFile(file: File): void {
    this.parseError.set(null);
    this.pendingParseResult.set(null);
    this.parserService.parseFile(file).subscribe({
      next: (result) => {
        this.pendingParseResult.set(result);
        this.envName = file.name.replace(/\.xml$/i, '');
      },
      error: (err) => {
        this.parseError.set(err.message || 'Failed to parse XML file');
      },
    });
  }

  async confirmEnvironmentName(): Promise<void> {
    const result = this.pendingParseResult();
    if (!result) return;

    const name = this.envName.trim() || 'Untitled';
    const saved = await this.envService.createFromFile(name, result);
    this.store.setEnvironmentId(saved.id);
    this.store.loadFromParseResult(result);
    this.pendingParseResult.set(null);
    this.envName = '';
    this.environmentReady.emit();
  }

  /** One-line summary used in the picker. */
  describe(env: Environment): string {
    if (!hasSchema(env)) return 'Connected \u00b7 not pulled yet';
    const parts = [`${env.entityCount} entities`, this.formatDate(env.savedAt!)];
    if (env.sizeBytes) parts.push(this.formatSize(env.sizeBytes));
    return parts.join(' \u00b7 ');
  }

  /**
   * Opening is always instant when a schema is cached; a connected environment
   * that has never pulled needs credentials first.
   */
  async chooseEnvironment(env: Environment): Promise<void> {
    this.pickerOpen.set(false);
    if (hasSchema(env)) {
      await this.openFromCache(env);
      return;
    }
    await this.beginPull(env);
  }

  private async openFromCache(env: Environment): Promise<void> {
    const result = await this.envService.load(env.id);
    if (!result) {
      this.parseError.set('That environment\u2019s schema could not be read.');
      return;
    }
    this.store.setEnvironmentId(env.id);
    this.store.loadFromParseResult(result);
    this.environmentReady.emit();
  }

  /** Use a stored password when there is one, otherwise ask. */
  private async beginPull(env: Environment): Promise<void> {
    const stored = env.connection?.hasStoredPassword
      ? await this.envService.getPassword(env.id)
      : null;
    if (stored) {
      await this.runPull(env, stored, false);
      return;
    }
    this.pullPassword = '';
    this.needsPassword.set(env);
  }

  async confirmPull(): Promise<void> {
    const env = this.needsPassword();
    if (!env || !this.pullPassword) return;
    await this.runPull(env, this.pullPassword, this.rememberPassword);
  }

  cancelPull(): void {
    this.needsPassword.set(null);
    this.pullPassword = '';
  }

  private async runPull(env: Environment, password: string, remember: boolean): Promise<void> {
    const conn = env.connection;
    if (!conn) return;
    try {
      const xml = await this.odataService.connect(conn.url, conn.username, password);
      const result = await this.parseXmlOnce(xml);
      await this.envService.setSchema(env.id, result, true);
      if (remember && this.canStorePassword()) {
        await this.envService.savePassword(env.id, password);
      }
      this.needsPassword.set(null);
      this.pullPassword = '';
      this.store.setEnvironmentId(env.id);
      this.store.loadFromParseResult(result);
      this.environmentReady.emit();
    } catch {
      // odataService.error() carries the message; the prompt stays open.
    }
  }

  /** Promise wrapper around the worker-backed parser. */
  private parseXmlOnce(xml: string): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      this.parserService.parseXml(xml).subscribe({
        next: resolve,
        error: (e) => reject(e instanceof Error ? e : new Error('Failed to parse metadata')),
      });
    });
  }

  async liveConnect(): Promise<void> {
    try {
      const xml = await this.odataService.connect(
        this.connectUrl, this.connectUsername, this.connectPassword
      );
      const result = await this.parseXmlOnce(xml);
      const host = new URL(this.connectUrl).hostname;

      // A connection is not a separate record -- it creates an environment.
      const env = await this.envService.createFromConnection(
        host,
        { url: this.connectUrl.replace(/\/+$/, ''), username: this.connectUsername },
        result
      );
      if (this.connectSave && this.canStorePassword()) {
        await this.envService.savePassword(env.id, this.connectPassword);
      }

      this.connectPassword = '';
      this.store.setEnvironmentId(env.id);
      this.store.loadFromParseResult(result);
      this.environmentReady.emit();
    } catch (e: unknown) {
      if (!this.odataService.error()) {
        this.parseError.set(e instanceof Error ? e.message : 'Connection failed');
      }
    }
  }


  formatDate(iso: string): string {
    return sharedFormatDate(iso);
  }

  formatSize(bytes: number): string {
    return sharedFormatSize(bytes);
  }
}
