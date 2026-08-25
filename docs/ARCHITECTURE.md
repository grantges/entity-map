# Architecture

How Entity Map is put together, and why the non-obvious parts are the way they are.

---

## One codebase, two hosts

The web app and the desktop app ship from the same branch. This is deliberate: a
long-lived desktop branch would need to modify the *same files* the web app is actively
changing (file saving, secret storage, chrome), so every merge would land on the same
lines. That is the worst case for a divergent branch.

Instead the difference is expressed three ways, in descending order of preference:

1. **Nothing at all.** Most of the app is unaware of its host. Serving the desktop build
   over `http://127.0.0.1` rather than `file://` is what buys this (see below).
2. **A DI swap** in `src/app/core/platform/` for behaviour that genuinely differs.
3. **A CSS class** on `<html>` for host chrome.

### The platform seam

`src/app/core/platform/` is the only place that knows which host it is running in.

```
platform.model.ts       Interfaces + InjectionTokens + the preload bridge type
browser-platform.ts     Web implementations
electron-platform.ts    Desktop implementations
platform.providers.ts   Picks at bootstrap by feature-detecting window.electronAPI
```

| Token | Web | Desktop |
|---|---|---|
| `FILE_SAVER` | anchor-click download | native save dialog via IPC |
| `SECRET_STORE` | AES-GCM in localStorage | OS keychain via `safeStorage` |
| `IS_ELECTRON` | `false` | `true` |

`providePlatform()` also stamps `em-platform-electron` and `em-platform-mac-frameless`
onto `<html>`, which is how `styles.scss` adapts the chrome without any component
knowing about Electron.

Adding a capability: define the interface and token in `platform.model.ts`, implement it
in both files, register it in `platform.providers.ts`. Feature code injects the token and
stays host-agnostic.

---

## Why the desktop app runs a local HTTP server

`electron/static-server.js` serves the built Angular bundle over
`http://127.0.0.1:43117` instead of loading it from `file://`. Three things break on a
`file://` origin:

1. **`crypto.subtle` requires a secure context.** `file://` is not one in Chromium, so
   the encrypted API-key storage in `crypto-storage.service.ts` fails outright.
2. **Angular's `PathLocationStrategy`** cannot resolve against `<base href="/">`.
3. **Module Web Workers** (`new URL(..., import.meta.url)`) load unreliably.

`http://localhost` *is* a secure context, so all three keep working with no
desktop-specific renderer code. It also means the relative `/creatio-proxy/...` URLs in
`odata-connection.service.ts` resolve to the same origin, so the OData layer needs no
awareness of its host at all.

### The port is fixed on purpose

`43117`, not an ephemeral port.

IndexedDB and localStorage are scoped **per origin**, and the port is part of the origin.
An ephemeral port means a new origin on every launch, which silently orphans every saved
environment, connection and stored password — the app comes up blank each time and the
old data is unreachable.

For the same reason, a port collision **fails loudly** with a dialog rather than binding
elsewhere. Quietly moving to another port is precisely what destroys the data.

---

## The Creatio proxy

Creatio does not set `Access-Control-Allow-Origin` for external origins, so a browser
`fetch` from `localhost` fails at preflight. Requests are routed through a local proxy:

```
/creatio-proxy/<url-safe-base64 target origin>/<path>
```

The forwarding logic lives in `electron/proxy-handler.js` and is shared by both hosts:

- `proxy-server.js` — standalone on `:3100` for `ng serve`
- `electron/static-server.js` — mounted on the app's own origin in the desktop build

One implementation on purpose: a fix to cookie handling or auth relay must land for both
at once. The proxy keeps a simple in-memory cookie jar per target host, since Creatio
auth is cookie-based.

TLS verification is on by default and is disabled only per-request, for hosts the user
has explicitly trusted. See [SECURITY.md](SECURITY.md).

---

## Domain model: everything is an environment

Earlier there were two records — a saved environment (cached schema) and a saved
connection (URL + username). The same Creatio instance appeared twice under the same
hostname and read as a duplicate. A connection is not a peer of an environment; it is an
optional capability of one.

```ts
interface Environment {
  id: string;
  name: string;
  createdAt: string;
  entityCount?: number;   // schema metadata; absent until first import
  namespace?: string;
  savedAt?: string;
  sizeBytes?: number;
  connection?: {
    url: string;
    username: string;
    hasStoredPassword?: boolean;
    lastPulledAt?: string;
    allowInsecureTls?: boolean;
  };
}
```

`hasSchema(env)` and `isConnected(env)` are the predicates; the three valid states are
described in the README.

### Migration

`EnvironmentStorageService.migrateIfNeeded()` folds the two legacy lists into one,
pairing by hostname (names defaulted to the host, so `foo.creatio.com` and
`https://foo.creatio.com` are the same place).

**Environments keep their original id.** The schema blob in IndexedDB and the
per-environment annotations in localStorage are both keyed by it — a fresh id would
orphan all of it. Legacy keys are left in place as a backup rather than deleted, and a
`em-environments-migrated-v2` flag makes the migration idempotent.

---

## Storage layout

| Where | What |
|---|---|
| `localStorage: em-environments-v2` | Environment index (small, synchronous) |
| `IndexedDB: entity-map-db/environments` | Parsed schemas, keyed by environment id |
| `localStorage: em-<envId>-{custom-entities,custom-properties,metadata}` | Per-environment local work |
| `IndexedDB: entity-map-baselines` | Baseline snapshots for diffing |
| `IndexedDB: em-keys` | Non-extractable AES-GCM key (web secret storage) |
| OS keychain | Connection passwords (desktop only) |
| `<userData>/secrets.json` | `safeStorage` ciphertext for the above |
| `<userData>/window-state.json` | Window bounds |

`userData` is pinned to `<appData>/entity-map` in `electron/main.js`, **decoupled from
the app's display name on purpose**. Renaming the app would otherwise move Chromium's
storage directory and orphan every saved environment.

### Server schema vs local work

`metadata-store.service.ts` keeps these separate:

- `_entities` — parsed from the server. Replaced wholesale on a pull.
- `_customEntities`, `_customProperties`, `_metadata` — local. Keyed by environment id,
  merged at read time in `allEntitiesMap()`.

This separation is what makes "pull latest" safe. The only real exposure is an entity
you annotated that the server no longer has; `entitiesWithLocalWork()` identifies exactly
that set, and it is what the pull warning reports.

---

## Rendering

Diagrams use `@foblex/flow` with `dagre` for layout. `$metadata` XML is parsed off the
main thread in `core/workers/metadata-parser.worker.ts` — schemas run to thousands of
entities and would otherwise block the UI for seconds.
