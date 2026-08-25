# Distribution

Packaging Entity Map for other people to install.

---

## Building

```bash
npm run dist:mac     # DMG + zip  -> release/
npm run dist:win     # NSIS installer
npm run dist         # current platform
```

Config lives in the `build` field of `package.json` (electron-builder).

| Setting | Value |
|---|---|
| `appId` | `co.grantges.entitymap` |
| `productName` | `Entity Map` |
| Output | `release/` (gitignored) |
| Packed | `electron/**`, `dist/entity-map/browser/**`, `package.json` |

`files` is an allowlist. The Angular toolchain is a devDependency and must never end up
inside the installer — if the bundle size jumps by hundreds of megabytes, that is the
first thing to check.

`electron/launch.js` is excluded: it is a dev-time helper for stripping
`ELECTRON_RUN_AS_NODE` and has no purpose in a packaged app.

### Roughly what to expect

| Artifact | Size |
|---|---|
| `Entity Map-<version>-arm64.dmg` | ~131 MB |
| `Entity Map.app` | ~336 MB |

Most of that is the Electron runtime.

---

## Blockers before shipping to anyone

### 1. Code signing — required

Builds are currently unsigned:

```
skipped macOS application code signing
  reason=cannot find valid "Developer ID Application" identity
```

macOS Gatekeeper refuses to open an unsigned, un-notarised app downloaded from the
internet — users see *"Entity Map is damaged and can't be opened"*, which is not a
warning they can click through. `spctl -a -vv` on the current build already rejects it.

**macOS:** Apple Developer Program ($99/yr) for a Developer ID Application certificate,
plus notarisation. electron-builder handles both once credentials are in the environment:

```bash
export APPLE_ID="…"
export APPLE_APP_SPECIFIC_PASSWORD="…"
export APPLE_TEAM_ID="…"
```

**Windows:** an OV or EV code-signing certificate (~$200–400/yr). Without one, SmartScreen
warns on every download. EV certificates get reputation immediately; OV certificates have
to earn it over time.

Until signed, the app only runs on machines where the quarantine attribute is cleared by
hand — fine for your own use, not for distribution.

### 2. Application icon — cosmetic but obvious

```
default Electron icon is used  reason=application icon is not set
```

Add `build/icon.icns` (macOS) and `build/icon.ico` (Windows), 1024×1024 source. Shipping
with the Electron logo reads as unfinished.

### 3. Architecture coverage

The current build is `arm64` only — it will not run on Intel Macs.

```bash
npx electron-builder --mac --universal   # one binary, both architectures
npx electron-builder --mac --x64         # Intel only
```

Universal builds are roughly double the size.

---

## Verifying a packaged build

The packaged app exercises paths nothing else does — chiefly that the Angular bundle is
read from **inside `app.asar`** rather than from disk. Check these explicitly:

```bash
# The web bundle is actually packed
npx asar list "release/mac-arm64/Entity Map.app/Contents/Resources/app.asar" \
  | grep browser/index.html

# It launches and serves (note: strip ELECTRON_RUN_AS_NODE, see DEVELOPMENT.md)
env -u ELECTRON_RUN_AS_NODE \
  "release/mac-arm64/Entity Map.app/Contents/MacOS/Entity Map"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:43117/

# Storage did not fork — the app must read <appData>/entity-map,
# NOT a new directory named after productName
ls ~/Library/Application\ Support/entity-map
```

That last check matters: `userData` is pinned in `electron/main.js` and decoupled from
the app's display name on purpose. If a directory named `Entity Map` appears, the pin has
been lost and every user's saved environments will silently disappear on upgrade.

The packaged app rejects unknown CLI flags, so `--remote-debugging-port` does not work
against a built `.app`.

---

## Not yet set up

- **Auto-update.** `electron-updater` against GitHub Releases is the usual route and is
  free, but requires signed builds to be useful.
- **Versioning.** `package.json` is still `0.0.0`; artifacts are named from it.
- **CI.** Builds are local only. macOS artifacts must be built and notarised on macOS.
