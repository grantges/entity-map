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
import { EnvironmentStorageService, SavedEnvironment } from '../../../../core/services/environment-storage.service';
import { ODataConnectionService, CreatioConnection } from '../../../../core/services/odata-connection.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ParseResult } from '../../../../core/models/entity.model';
import { formatDate as sharedFormatDate, formatSize as sharedFormatSize } from '../../../../core/utils/format';
import { IconComponent } from '../../../../shared/atoms/icon/icon.component';

@Component({
  selector: 'em-upload-screen',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="upload-screen">
      <div class="upload-card">
        <div class="upload-card__icon">
          <em-icon name="database" [size]="48" />
        </div>
        <h1 class="upload-card__title">Entity Map</h1>
        <p class="upload-card__subtitle">
          Visualize Creatio OData metadata as interactive entity relationship diagrams
        </p>

        <!-- Saved Environments -->
        @if (envService.hasEnvironments()) {
          <div class="env-section">
            <div class="env-section__label">Saved Environments</div>
            @for (env of envService.environments(); track env.id) {
              <div class="env-card">
                <button class="env-card__main" (click)="loadEnvironment(env)">
                  <div class="env-card__info">
                    <span class="env-card__name">{{ env.name }}</span>
                    <span class="env-card__meta">
                      {{ env.entityCount }} entities
                      &middot; {{ formatDate(env.savedAt) }}
                      &middot; {{ formatSize(env.sizeBytes) }}
                    </span>
                  </div>
                  <em-icon name="chevron-right" [size]="16" />
                </button>
                <button class="env-card__delete" (click)="deleteEnvironment(env.id, $event)"
                  title="Delete environment">
                  <em-icon name="trash" [size]="14" />
                </button>
              </div>
            }
            <div class="env-section__divider">
              <span>or upload a new file</span>
            </div>
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
            @if (odataService.connections().length > 0) {
              <div class="live-connect__saved">
                <div class="live-connect__label">Saved Connections</div>
                @for (conn of odataService.connections(); track conn.id) {
                  <div class="env-card">
                    <button class="env-card__main" (click)="prefillConnection(conn)">
                      <div class="env-card__info">
                        <span class="env-card__name">{{ conn.name }}</span>
                        <span class="env-card__meta">{{ conn.url }} &middot; {{ conn.username }}</span>
                      </div>
                    </button>
                    <button class="env-card__delete" (click)="odataService.deleteConnection(conn.id)" title="Remove">
                      <em-icon name="trash" [size]="14" />
                    </button>
                  </div>
                }
                <div class="env-section__divider"><span>or connect to a new environment</span></div>
              </div>
            }

            <input class="live-connect__input" placeholder="Environment URL (e.g., https://myorg.creatio.com)"
              [(ngModel)]="connectUrl" autocomplete="url" />
            <input class="live-connect__input" placeholder="Username"
              [(ngModel)]="connectUsername" autocomplete="username" />
            <input class="live-connect__input" type="password" placeholder="Password"
              [(ngModel)]="connectPassword" autocomplete="current-password" />

            <label class="sidebar__checkbox">
              <input type="checkbox" [(ngModel)]="connectSave" /> Save connection for later
            </label>

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

  readonly environmentReady = output<void>();

  // State
  readonly isDragging = signal(false);
  readonly parseError = signal<string | null>(null);
  readonly pendingParseResult = signal<ParseResult | null>(null);
  envName = '';
  readonly uploadMode = signal<'file' | 'live'>('file');

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
    const saved = await this.envService.save(name, result);
    this.store.setEnvironmentId(saved.id);
    this.store.loadFromParseResult(result);
    this.pendingParseResult.set(null);
    this.envName = '';
    this.environmentReady.emit();
  }

  async loadEnvironment(env: SavedEnvironment): Promise<void> {
    const result = await this.envService.load(env.id);
    if (result) {
      this.store.setEnvironmentId(env.id);
      this.store.loadFromParseResult(result);
      this.environmentReady.emit();
    }
  }

  async deleteEnvironment(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.envService.delete(id);
  }

  // Live connection
  prefillConnection(conn: CreatioConnection): void {
    this.connectUrl = conn.url;
    this.connectUsername = conn.username;
    this.connectPassword = '';
    this.connectSave = false;
  }

  async liveConnect(): Promise<void> {
    try {
      const xml = await this.odataService.connect(
        this.connectUrl, this.connectUsername, this.connectPassword
      );

      if (this.connectSave) {
        this.odataService.saveConnection(
          new URL(this.connectUrl).hostname,
          this.connectUrl,
          this.connectUsername
        );
      }

      this.parserService.parseXml(xml).subscribe({
        next: (result) => {
          this.pendingParseResult.set(result);
          this.envName = new URL(this.connectUrl).hostname;
        },
        error: (err) => {
          this.parseError.set(err.message || 'Failed to parse metadata');
        },
      });
    } catch (e: unknown) {
      // Error is already set by odataService
    }
  }

  formatDate(iso: string): string {
    return sharedFormatDate(iso);
  }

  formatSize(bytes: number): string {
    return sharedFormatSize(bytes);
  }
}
