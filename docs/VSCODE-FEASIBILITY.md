# Shipping Entity Map as a VS Code extension — feasibility

Investigation, September 2026. **No decision has been made; nothing here is committed to.**

Two parallel investigations produced this: one reading this repository, one reading VS Code's
documentation and source. Where they disagreed, the source won.

---

## Verdict

**Conditionally yes.** Build it if — and only if — the workspace integration (§6) is in scope
from the start. Without it, the extension is the same product in a smaller window for five to
seven weeks, aimed at an audience where the incumbent Creatio extension has ~2,400 installs.

The platform seam is the right place to hang a third host. Most of the work is not writing the
VS Code implementations; it is widening a seam that never had to abstract storage or HTTP.

---

## 1. What the platform layer actually covers

`src/app/core/platform/` abstracts three things: `FILE_SAVER`, `SECRET_STORE`, `IS_ELECTRON`.
`docs/ARCHITECTURE.md` says it is "the only place that knows which host it is running in." That
is true about the *host*, but not that everything host-dependent goes through it:

| Capability | Where it actually lives | Abstracted? |
|---|---|---|
| Key/value storage | bare `localStorage` — **39 call sites across 8 files** | No |
| Blob storage | `IndexedDbStore` instantiated directly in `environment-storage.service.ts` and `baseline.service.ts` | No |
| HTTP to Creatio | `fetch()` in `odata-connection.service.ts` | No |
| HTTP to OpenAI | `fetch()` in `ai.service.ts` | No |
| Theme | `theme.service.ts` reads `prefers-color-scheme` directly | No |

Web and Electron are both Chromium on an `http://` origin, so those never needed abstracting.
VS Code is the first host where they may not hold.

### New tokens required

`KEY_VALUE_STORE`, `BLOB_STORE`, `HTTP_TRANSPORT`, `THEME_SOURCE`, `FILE_OPENER`, and
`HOST_KIND` (a `'web' | 'electron' | 'vscode'` union replacing the `IS_ELECTRON` boolean, which
has exactly one consumer outside the platform layer).

### The one design decision that sets the whole effort

All 39 `localStorage` calls are **synchronous**, and several are structurally load-bearing —
`environment-storage.service.ts` reads the index from its constructor, `metadata-store.service.ts`
persists inside an Angular `effect()`, `theme.service.ts` reads during field initialisation.

**Do not make 39 call sites async.** Give `KEY_VALUE_STORE` a synchronous `localStorage`-shaped
surface backed by an in-memory `Map`, hydrated once *before* `bootstrapApplication` and flushed
write-behind to the host. The snapshot is small. Web and Electron get a pass-through
implementation that is a literal alias for `localStorage`, so their behaviour is unchanged.

`BLOB_STORE` needs no such trick — `environment-storage.service.ts` and `baseline.service.ts`
are already `async` on those paths.

---

## 2. Constraints, with evidence

Every item below was verified against VS Code source or documentation. Items that could not be
verified are in §8.

### Secure context — works

`vscode-webview` is registered as a privileged scheme with `secure: true` in VS Code's
`src/main.ts`, so `window.isSecureContext === true` and `crypto.subtle` is available. Webviews
themselves depend on it: the bootstrap throws `'crypto.subtle' is not available so webviews will
not work` without it, and it registers a module service worker, which requires a secure context.

This matters because `crypto-storage.service.ts` needs `crypto.subtle`, and the desktop build
already runs a local HTTP server specifically because `file://` is not a secure context.

**The exception:** a self-hosted VS Code server on plain HTTP over a LAN is not a secure context
and webviews do not work there at all. Not our problem to solve.

### Storage — works, persists, explicitly not guaranteed

The webview origin is **deterministically stable**: a UUID stored in an `APPLICATION`-scoped,
machine-targeted memento, hashed together with the parent origin. Stable across restarts,
workspaces and profiles; different on every machine; reset when the user clears storage.

`localStorage`, `sessionStorage` and IndexedDB all work and persist. Widely-cited 2018 answers
saying otherwise are obsolete — they predate the current origin model.

**But VS Code's own 1.73 release notes say:**

> While VS Code makes a best effort to maintain a consistent origin for webviews, we cannot
> guarantee the origin will not change. You should also never use `localStorage` or similar APIs
> to store critical data, such as document contents.

**Design accordingly: route `KEY_VALUE_STORE` and `BLOB_STORE` to the extension host from the
first commit.** This project has already shipped an origin-change data-loss bug once — an
ephemeral port rotated the origin and orphaned every saved environment (see
`docs/ARCHITECTURE.md`). A webview UUID is the same failure with no port to pin and nothing under
our control. If browser storage turns out durable, that is a simplification available later; the
reverse mistake surfaces months afterwards as a bug report.

Where data goes instead:

| Data | Home |
|---|---|
| Environment index, annotations, tab state, theme | `context.globalState` |
| Cached schemas, baselines | `context.globalStorageUri` — one file per environment |
| Passwords, OpenAI key | `context.secrets` |

**Size:** VS Code warns above **512 KB** of extension state and advises `globalStorageUri`
explicitly. The whole memento is serialised as one JSON string per extension on every access, so
a multi-MB memento is a startup-latency problem as well as a size one. Schemas belong on disk.

### Web Workers — the current call breaks; blob is the documented fix

`metadata-parser.service.ts` uses `new Worker(new URL(...), { type: 'module' })`. In the built
bundle that resolves relative to the loading chunk, which under `asWebviewUri` is served from
`*.vscode-cdn.net` — **a different origin from the `vscode-webview://` document**. Worker scripts
must be same-origin; `{type:'module'}` does not relax that.

This is not a degraded experience. `MetadataParserService` throws `'Web Workers are required to
parse metadata'`, and every import path routes through it — **no schema could be loaded at all**.

VS Code's guide states the constraint and the fix directly:

> Workers can only be loaded using either a `data:` or `blob:` URI. You cannot directly load a
> worker from your extension's folder.

The fallback is unusually cheap here: the built worker chunk is **2,207 bytes with zero import
statements**, because `metadata-parser.worker.ts` is a thin adapter over the deliberately
dependency-free `metadata-parser.core.ts`. So:

```js
const src = await (await fetch(workerUrl)).text();
new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
```

No `type: 'module'` needed. Roughly 15 lines behind a `WORKER_FACTORY` token.

**CSP must include `worker-src blob:`** — `worker-src` falls back to `script-src`, and VS Code's
own MCP webview shipped this exact bug.

### CSP — no default, and Angular needs a nonce

**Omitting the CSP meta tag yields no CSP at all**, not a safe default — only a log line in
extension development mode. It is entirely on us.

Nineteen components use inline `styles: [...]`, which Angular injects as `<style>` elements at
runtime. The supported fix exists in this Angular version: `CSP_NONCE` / the `ngCspNonce`
attribute on the root node. Note VS Code's own webviews all use `style-src 'unsafe-inline'`
regardless, including the markdown preview at its strictest setting.

Not a problem: `[style.x]` bindings go through CSSOM, which CSP does not police, so
`@foblex/flow`'s transform-based positioning is fine.

Self-host the fonts. `src/index.html` pulls Inter and JetBrains Mono from Google — a network
dependency for typography is bad manners in an editor extension regardless of what CSP allows.

Working shape:

```
default-src 'none';
script-src 'nonce-${nonce}';
style-src ${cspSource} 'unsafe-inline';
font-src ${cspSource};
img-src ${cspSource} data: blob:;
worker-src blob: ${cspSource};
connect-src 'none';
```

### Routing and `<base href>`

The webview document lives at `vscode-webview://<hash>/fake.html?id=...` — VS Code loads an empty
page on the correct origin and writes the real HTML into it. Relative URLs resolve against the
webview origin, **not** the extension directory.

`<base href>` works and is the intended fix; VS Code uses it in its own markdown preview. Two
gotchas: it needs a **trailing slash**, and it only applies to relative paths — not paths starting
with `/`. So `src/index.html`'s `<base href="/">` must be rewritten per-load.

Use **`HashLocationStrategy`** for the VS Code build. There is no server, so any real reload lands
on the blank `fake.html`. With two top-level routes the URL cosmetics are irrelevant. Worth being
explicit that this is our inference — Microsoft has never documented SPA routing in webviews.

---

## 3. The proxy disappears — and that is the cleanest win

**CORS fully applies to webview `fetch`.** The webview service worker intercepts only three URL
classes (its own `vscode-cdn.net` resources, the remote authority, and mapped localhost);
everything else hits Chromium's normal network stack with standard CORS enforcement. Creatio sends
no `Access-Control-Allow-Origin`, so a direct webview fetch fails at preflight exactly as it does
today at `localhost:4200`.

So the proxy does not disappear by moving to a webview. It disappears by moving requests to the
**extension host**, which is plain Node with no CORS enforcement. That is strictly better than
either existing build:

| | Today | Extension |
|---|---|---|
| Listening socket | `127.0.0.1:3100` or `:43117` | **none** |
| Reachable by other local processes | yes | **no** |
| Passwords in flight | webview → local HTTP → Creatio | webview → `postMessage` → Node → Creatio |
| Path-traversal surface | `static-server.js` | **gone** |
| CSP `connect-src` | n/a | `'none'` |

`docs/SECURITY.md` currently has to argue that "any local process can reach the server" is
acceptable. In the extension there is no server to argue about.

### Cookie jar

`proxy-handler.js` holds a module-scope jar keyed by target host — `docs/SECURITY.md` already
lists as a known limitation that two environments on the same host share a session. Moving to the
host is the chance to key it by **environment id** instead, which is what users expect when they
have prod and a sandbox on one domain.

Extract the shared core (`authenticate`, `fetch`, cookies, TLS error classification) into a
`creatio-transport` module consumed by all three hosts. A third independent copy of Creatio auth
is exactly what `docs/ARCHITECTURE.md` warns against.

### TLS trust survives and gets safer

The `X-EM-Allow-Insecure-TLS` header exists only because the renderer had to signal intent across
an HTTP boundary. In the extension host there is no such boundary — the flag is a field on a
`postMessage` payload and `rejectUnauthorized` is set directly. The header, and the paragraph in
`docs/SECURITY.md` justifying why a locally-reachable header is acceptable, both disappear.

**Port the TLS error classification verbatim** — the seven Node error codes and the `tlsError`
flag. `docs/SECURITY.md` records that a bad certificate once surfaced as `Authentication failed:
HTTP 502` and sent people hunting for a password problem. The test suite does not cover the
network services, so losing this would be a silent regression.

---

## 4. Credentials — one real gap

`context.secrets` maps cleanly onto the `SecretStore` interface, and on desktop it is backed by
Electron `safeStorage` — the same primitive `electron-platform.ts` already uses. On macOS and
Windows the security properties are identical to the desktop build.

**The gap is `isSecure()`.** `platform.model.ts` defines it as gating whether the app offers to
remember passwords at all, and `ElectronSecretStore` implements it honestly via
`safeStorage.isEncryptionAvailable()`.

`vscode.SecretStorage` exposes **no equivalent capability query** — and the failure it hides is
worse than expected. On Linux with no keyring, VS Code **silently falls back to in-memory
storage**: secrets vanish on restart, with only a trace-level log.

**Return `isSecure() === true` only on macOS and Windows.** Erring toward prompting is consistent
with how this project already reasons — the web build stores no passwords at all. If the extension
is ever marked web-compatible, exclude that host too.

Port the one-time migration from `ElectronSecretStore.get()`: the OpenAI key may already exist in
webview `localStorage` from an earlier version.

---

## 5. Effort

Estimates assume one developer familiar with this codebase and exclude the spike.

| Phase | Work | Estimate |
|---|---|---|
| 0. Spike | §7. **Gate — do not proceed without it.** | half a day |
| 1. Storage seam | `KEY_VALUE_STORE` + `BLOB_STORE`; pass-through impls; 39 call sites; bootstrap hydration. All three hosts stay green. | 1–2 weeks |
| 2. Host bridge | Extension scaffold, panel lifecycle, `index.html` rewrite, CSP + nonce, typed postMessage RPC, `vscode-platform.ts`, theme bridging, worker fallback. | 1–1.5 weeks |
| 3. Networking | Extract `creatio-transport`; per-environment cookie jars; port TLS classification; `HTTP_TRANSPORT`. | 1 week |
| 4. Workspace integration | §6. **The phase that justifies the project.** | 1–2 weeks |
| 5. Polish and publish | Theming, self-hosted fonts, `.vscodeignore`, publisher setup, CI. | 3–5 days |

**Realistic total: 5–7 weeks.** About three weeks gets a webview that renders and persists — but
per §6 that version is not worth shipping.

Two things that will inflate this: `CONTRIBUTING.md` is explicit that the test suite does not
cover persistence or the network services, and phase 1 rewrites persistence with no safety net —
**budget spec-writing inside phase 1, not after it.** And verifying UI by real interaction, which
this project requires, is more awkward in a webview than the CDP approach in `docs/DEVELOPMENT.md`.

### Shape

One Angular app, three hosts. `vscode-platform.ts` sits beside its siblings; host selection stays
runtime feature-detection, so the bundle is byte-identical across hosts and only `index.html`
differs. The extension itself is a plain TypeScript project under `projects/vscode-extension/`
built with esbuild — not an Angular project.

Size is a non-issue: `dist/entity-map/browser` is **1.2 MB**, against a ~225 MB DMG. The extension
is ~200× smaller because VS Code *is* the runtime.

---

## 6. What the extension adds — be skeptical

**Weak arguments.** Opening a `$metadata` file from the workspace saves a drag; the app already
takes drag-and-drop and a file picker. A custom editor for `*.xml` is actively harmful — Creatio
packages are full of XML, and hijacking every `.xml` file so it opens an ERD viewer that cannot
parse it would be worse than useless. "One less window" is a preference, not a capability.

**One real distribution argument.** The Marketplace requires no code-signing certificate and no
notarisation. `docs/DISTRIBUTION.md` documents that unsigned builds are a hard blocker costing
$99/yr Apple plus $200–400/yr Windows to clear. **The extension is the only build that could be
handed to a stranger today.** That is an argument about distribution economics, not the product.

**The one strong argument — workspace integration.** Neither the web nor desktop build can see the
user's workspace:

- **ERD → source.** Click `Contact`, open its schema descriptor in the workspace. This is the
  "where is this actually defined" question that otherwise sends people grepping.
- **Source → ERD.** Right-click a schema file → "Show in Entity Map", focused on that entity.
- **Diff against the workspace.** The baseline machinery currently compares a snapshot against a
  server pull. In a workspace it could compare the live schema against what is committed — "the
  server has three columns your package doesn't." This is the most interesting of the three and
  is not expressible in either existing build.

**Market reality.** [Clio Explorer](https://marketplace.visualstudio.com/items?itemName=AdvanceTechnologiesFoundation.clio-explorer)
already exists — ~2,400 installs, 5/5 from 17 reviews, contributing environment/package tree views
and driving clio. Encouraging that the audience lives in VS Code; sobering as a ceiling. If reach
is the goal, this is not the lever.

A clio `appsettings.json` holds registered environments and could pre-populate the connect form.
Its schema is unverified — the read was correctly blocked as a credentials file. If pursued it
must be an explicit user action ("Import environments from clio"), never automatic, and documented
per `CONTRIBUTING.md`'s security-change rule.

---

## 7. The spike

Four of the six original questions were answered from VS Code source, so this is now an afternoon,
not a day. What remains is genuinely specific to *our* bundle.

One throwaway extension loading the **existing, unmodified** `dist/entity-map/browser` into a
webview. Rewrite `index.html` (base href → `asWebviewUri` with trailing slash, CSP + nonce,
`ngCspNonce` on `<app-root>`), set `localResourceRoots`, and answer:

1. **Does the Angular app boot** under that CSP, with the runtime-injected component styles?
2. **Does the blob worker parse a real multi-megabyte `$metadata`** at acceptable speed?
3. **Does `@foblex/flow` render** a thousand-node graph in a webview without layout or perf
   surprises?
4. **Does the extension host reach Creatio** unimpeded — `https.request` from `extension.ts`,
   confirming no proxy interception.

If the diagram renders and a real schema parses, essentially everything uncertain is de-risked.

**Biggest risk if we proceed anyway:** storage durability (§2). Not because it is unsolvable, but
because the failure is silent and delayed. The mitigation is a design decision made on day one,
not a fix.

---

## 8. Not verified

Listed so nobody mistakes them for established fact.

| Claim | Status |
|---|---|
| `Origin` header value on cross-origin fetch from a webview | No authoritative source; a server cannot reliably allowlist it either way |
| SPA routing / `pushState` in webviews | **Zero official documentation.** `HashLocationStrategy` is our inference from the `fake.html` mechanism |
| Maximum `.vsix` size | No official number; Microsoft declined to state one publicly. Moot at 1.2 MB |
| Webview count / memory / DOM limits | Not documented anywhere |
| `SharedArrayBuffer` availability | Inferred unavailable from source; not documented. No zero-copy worker transfers |
| `SecretStorage` value size limit | Not documented, none in source |
| clio `appsettings.json` schema | Read correctly blocked as a credentials file |

---

## 9. Incidental findings worth acting on

- **`@vscode/webview-ui-toolkit` was archived in January 2025.** Do not adopt it.
- **Azure DevOps retires global PATs on 1 December 2026.** Publishing moves to Entra workload
  identity federation, or OIDC trusted publishing from GitHub Actions. Any publishing instructions
  written now will date quickly.
- The Marketplace signs extensions itself; publishers do nothing.
- Verified-publisher status needs six months of both domain registration and extension history.
- `.vscodeignore` is minimatch, not gitignore syntax, and is mutually exclusive with a `files`
  field in `package.json`.
