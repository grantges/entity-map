# Development

## Scripts

| Script | What it does |
|---|---|
| `npm start` | `ng serve` only. File import works; live connections do not. |
| `npm run start:live` | Proxy on `:3100` + `ng serve` on `:4200`. **Use this for live connections.** |
| `npm run proxy` | Standalone CORS proxy only. |
| `npm run build` | Production build into `dist/entity-map/browser`. |
| `npm run electron:dev` | Proxy + `ng serve` + Electron pointed at `:4200`, with devtools. |
| `npm run electron:start` | Build, then launch the desktop app against `dist/`. |
| `npm run dist:mac` / `dist:win` | Packaged installers into `release/`. |
| `npm test` | Karma/Jasmine. |

### Dev mode and packaged mode use different origins

`electron:dev` loads `http://localhost:4200`; the packaged app serves
`http://127.0.0.1:43117`. Storage is per-origin, so **environments saved in dev mode are
not visible to the packaged app** and vice versa. This is expected, but it will look like
data loss if you are not expecting it.

Dev mode is opt-in via `EM_DEV=1`, not `!app.isPackaged` — running `electron .` against a
local build is also unpackaged, and must serve `dist/` rather than wait on `ng serve`.

---

## Traps

Every one of these cost real debugging time. They are not hypothetical.

### `ELECTRON_RUN_AS_NODE` breaks Electron in the VS Code terminal

VS Code exports `ELECTRON_RUN_AS_NODE=1` into its integrated terminal. With it set,
Electron starts as a plain Node process: `require('electron')` returns the **binary path
string** instead of the module, so `const { app } = require('electron')` yields
`undefined` and main.js dies with:

```
TypeError: Cannot read properties of undefined (reading 'requestSingleInstanceLock')
```

`electron/launch.js` strips the variable and spawns Electron properly. **Always launch
through the npm scripts**, never `npx electron .` directly, or prefix with
`env -u ELECTRON_RUN_AS_NODE`.

### Global CSS loses specificity ties to Angular component styles

Angular scopes component styles as `.toolbar[_ngcontent-xxx]` — specificity `0-2-0`. A
global `.some-class .toolbar` is *also* `0-2-0`, so the tie breaks on source order, and
Angular injects component styles **after** `styles.scss`. The component wins and your
global rule silently does nothing.

Rules in `styles.scss` that compete with a component declaration are written with an
`html` prefix to reach `0-2-1`:

```scss
html.em-platform-mac-frameless .toolbar { padding-left: ...; }
```

The `html` is load-bearing, not decoration. This only matters when the component declares
the same property — `-webkit-app-region` has no competitor, so those rules work unprefixed.

> Testing this against a synthesised element gives a **false pass**: an element you build
> in the console has no `_ngcontent` attribute, so the component rule never competes.
> Verify against the real rendered element.

### `z-index` does nothing without `position`

`.toolbar` sets `z-index: 10` but no `position`, so the z-index is inert. Any positioned
overlay paints above it regardless. A viewport-fixed drag strip therefore covered the
entire toolbar and swallowed every click.

Drag regions are per-screen, not a global overlay. The upload screen renders its own
strip because it has no toolbar of its own.

### Angular templates do not support arrow functions

```html
<!-- fails to compile: Parser Error: Missing expected ) -->
(openSidebar)="sidebarOpen.update((v) => !v)"
```

Use a component method.

### Backticks inside component `styles`

The styles array is a template literal. A backtick in a CSS comment terminates it, and
the error is unhelpful:

```
FatalDiagnosticError: Failed to resolve styles at position 0 to a string
```

### Outputs can be declared and never bound

`(fitToScreen)` was emitted by the toolbar and bound nowhere, so the button did nothing
while the keyboard shortcut worked. Nothing warns about this. When a control "does
nothing", check the binding exists before debugging the handler.

---

## Debugging the desktop app

Launch with a remote debugging port and drive it over CDP:

```bash
env -u ELECTRON_RUN_AS_NODE npx electron . --remote-debugging-port=9222
curl -s http://127.0.0.1:9222/json    # find webSocketDebuggerUrl
```

Node 22+ has a global `WebSocket`, so a CDP client is a few lines — useful for asserting
computed styles, hit-testing controls, and reading `localStorage` without clicking.

Two cautions:

- Only one instance runs (single-instance lock). Kill stale processes and free ports
  `9222`/`43117` first, or the new instance silently fails to start its debug server and
  you end up querying a zombie.
- Do not drive the UI while someone is using it. Your clicks race theirs.

The packaged app rejects unknown CLI flags, so `--remote-debugging-port` will not work
against a built `.app`.

---

## Verifying UI changes

Shipped CSS is not the same as correct rendering, and computed styles are not the same as
a working control. Prefer, in order:

1. **Interact with the real element** — click it, check the effect.
2. **Hit-test** — `document.elementFromPoint()` at the control's centre, and confirm the
   topmost element is the control and not an overlay.
3. **Computed style on the real rendered node** — never on a synthesised one.
4. Grep the bundle. Proves it shipped, not that it works.
