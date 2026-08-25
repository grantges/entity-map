import { Injectable, signal } from '@angular/core';

/**
 * Fetches OData metadata from a live Creatio.
 *
 * Connection RECORDS are not stored here -- they are part of an Environment
 * (see EnvironmentStorageService). This service is stateless with respect to
 * which environment is being pulled; it just authenticates and fetches.
 */

@Injectable({ providedIn: 'root' })
export class ODataConnectionService {
  /** Set when the last failure was a certificate problem, not a bad password. */
  private _tlsError = signal<boolean>(false);
  private _connecting = signal<boolean>(false);
  private _progress = signal<string>('');
  private _error = signal<string>('');

  readonly connecting = this._connecting.asReadonly();
  readonly tlsError = this._tlsError.asReadonly();
  readonly progress = this._progress.asReadonly();
  readonly error = this._error.asReadonly();

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
  async connect(
    url: string,
    username: string,
    password: string,
    allowInsecureTls = false
  ): Promise<string> {
    this._connecting.set(true);
    this._error.set('');
    this._tlsError.set(false);
    this._progress.set('Authenticating...');

    try {
      const baseUrl = url.replace(/\/+$/, '');

      // Step 1: Authenticate via Creatio login endpoint
      await this.authenticate(baseUrl, username, password, allowInsecureTls);

      // Step 2: Fetch OData $metadata
      this._progress.set('Fetching metadata schema...');
      const metadataXml = await this.fetchMetadata(baseUrl, allowInsecureTls);

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

  /** Opt-in header consumed by the local proxy; omitted unless trusted. */
  private tlsHeaders(allowInsecureTls: boolean): Record<string, string> {
    return allowInsecureTls ? { 'X-EM-Allow-Insecure-TLS': '1' } : {};
  }

  /**
   * Turn a proxy 502 into a message the user can act on. A certificate failure
   * is not a credentials problem and must not be reported as one.
   */
  private async raiseProxyError(response: Response, fallback: string): Promise<never> {
    let body: { error?: string; tlsError?: boolean; code?: string } = {};
    try {
      body = await response.json();
    } catch {
      /* non-JSON body; fall through to the generic message */
    }
    if (body.tlsError) {
      this._tlsError.set(true);
      throw new Error(
        `The server's TLS certificate could not be verified (${body.code}). ` +
        `This is common for on-premise Creatio instances using a self-signed certificate.`
      );
    }
    throw new Error(body.error || fallback);
  }

  private async authenticate(
    baseUrl: string,
    username: string,
    password: string,
    allowInsecureTls = false
  ): Promise<void> {
    const loginPath = '/ServiceModel/AuthService.svc/Login';

    const response = await fetch(this.proxyUrl(baseUrl, loginPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.tlsHeaders(allowInsecureTls) },
      credentials: 'include',
      body: JSON.stringify({
        UserName: username,
        UserPassword: password,
      }),
    });

    if (!response.ok) {
      await this.raiseProxyError(response, `Authentication failed: HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.Code !== 0) {
      throw new Error(result.Message || 'Authentication failed. Check credentials.');
    }
  }

  private async fetchMetadata(baseUrl: string, allowInsecureTls = false): Promise<string> {
    const metadataPath = '/0/odata/$metadata';

    const response = await fetch(this.proxyUrl(baseUrl, metadataPath), {
      method: 'GET',
      headers: { 'Accept': 'application/xml', ...this.tlsHeaders(allowInsecureTls) },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired or unauthorized. Please re-authenticate.');
      }
      await this.raiseProxyError(response, `Failed to fetch metadata: HTTP ${response.status}`);
    }

    const xml = await response.text();

    if (!xml.includes('<edmx:Edmx') && !xml.includes('<Edmx')) {
      throw new Error('Response is not valid OData metadata XML');
    }

    return xml;
  }

}
