import { Injectable, signal } from '@angular/core';
import { CreatioConnection } from '../models/app.model';
import { generateId } from '../utils/generate-id';

export type { CreatioConnection } from '../models/app.model';

const LS_KEY_CONNECTIONS = 'em-creatio-connections';

@Injectable({ providedIn: 'root' })
export class ODataConnectionService {
  private _connections = signal<CreatioConnection[]>([]);
  private _connecting = signal<boolean>(false);
  private _progress = signal<string>('');
  private _error = signal<string>('');

  readonly connections = this._connections.asReadonly();
  readonly connecting = this._connecting.asReadonly();
  readonly progress = this._progress.asReadonly();
  readonly error = this._error.asReadonly();

  constructor() {
    this.loadConnections();
  }

  /**
   * Connect to a Creatio environment, authenticate, and pull OData metadata.
   *
   * Because Creatio doesn't set CORS headers for external origins, browser
   * fetch() from localhost will fail with a preflight error.  We work around
   * this by routing all requests through a small local proxy server that the
   * user starts alongside `ng serve`.
   *
   * The proxy listens on the same origin (localhost:4200 via Angular proxy,
   * or localhost:3100 standalone) and forwards to the real Creatio host.
   *
   * URL rewriting: /creatio-proxy/<encoded-base-url>/rest-of-path
   */
  async connect(url: string, username: string, password: string): Promise<string> {
    this._connecting.set(true);
    this._error.set('');
    this._progress.set('Authenticating...');

    try {
      const baseUrl = url.replace(/\/+$/, '');

      // Step 1: Authenticate via Creatio login endpoint
      await this.authenticate(baseUrl, username, password);

      // Step 2: Fetch OData $metadata
      this._progress.set('Fetching metadata schema...');
      const metadataXml = await this.fetchMetadata(baseUrl);

      return metadataXml;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      this._error.set(msg);
      throw e;
    } finally {
      this._connecting.set(false);
      this._progress.set('');
    }
  }

  /** Save connection info (NOT password — browser handles that via autocomplete) */
  saveConnection(name: string, url: string, username: string): CreatioConnection {
    const conn: CreatioConnection = {
      id: generateId(),
      name,
      url: url.replace(/\/+$/, ''),
      username,
      savedAt: new Date().toISOString(),
    };

    const conns = [...this._connections(), conn];
    this._connections.set(conns);
    localStorage.setItem(LS_KEY_CONNECTIONS, JSON.stringify(conns));
    return conn;
  }

  deleteConnection(id: string): void {
    const conns = this._connections().filter((c) => c.id !== id);
    this._connections.set(conns);
    localStorage.setItem(LS_KEY_CONNECTIONS, JSON.stringify(conns));
  }

  // === Private ===

  /**
   * Build a proxied URL.  In dev, Angular's proxy config rewrites
   * /creatio-proxy/TARGET_BASE64/path  →  <decoded target>/path
   */
  private proxyUrl(baseUrl: string, path: string): string {
    // URL-safe base64: replace +→- /→_ and strip =
    const encoded = btoa(baseUrl).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/creatio-proxy/${encoded}${path}`;
  }

  private async authenticate(baseUrl: string, username: string, password: string): Promise<void> {
    const loginPath = '/ServiceModel/AuthService.svc/Login';

    const response = await fetch(this.proxyUrl(baseUrl, loginPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        UserName: username,
        UserPassword: password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.Code !== 0) {
      throw new Error(result.Message || 'Authentication failed. Check credentials.');
    }
  }

  private async fetchMetadata(baseUrl: string): Promise<string> {
    const metadataPath = '/0/odata/$metadata';

    const response = await fetch(this.proxyUrl(baseUrl, metadataPath), {
      method: 'GET',
      headers: { 'Accept': 'application/xml' },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired or unauthorized. Please re-authenticate.');
      }
      throw new Error(`Failed to fetch metadata: HTTP ${response.status}`);
    }

    const xml = await response.text();

    if (!xml.includes('<edmx:Edmx') && !xml.includes('<Edmx')) {
      throw new Error('Response is not valid OData metadata XML');
    }

    return xml;
  }

  private loadConnections(): void {
    try {
      const json = localStorage.getItem(LS_KEY_CONNECTIONS);
      if (json) {
        this._connections.set(JSON.parse(json));
      }
    } catch {
      this._connections.set([]);
    }
  }
}
