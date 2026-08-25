# Security

Entity Map holds Creatio credentials and talks to production instances, so the trust
boundaries are worth stating explicitly.

---

## TLS verification

**Certificate verification is on by default.** It is disabled only for a single request
carrying an opt-in header, and only for an environment the user has explicitly trusted.

### How the opt-in works

`odata-connection.service.ts` sets `X-EM-Allow-Insecure-TLS: 1` when the environment's
`connection.allowInsecureTls` is true, or when the user has just ticked the trust box.
`electron/proxy-handler.js` reads it, applies `rejectUnauthorized: false` for that request
only, and **strips the header before forwarding** so it never reaches Creatio.

The proxy binds to `127.0.0.1`, so the header is reachable only by local processes —
which could make their own unverified request anyway. It grants no capability that did
not already exist.

### Why it is offered only after a failure

The trust checkbox is not on the connect form. It appears only when a certificate
actually fails verification, with the consequence spelled out. A pre-emptive checkbox is
a checkbox people tick to make an error go away.

Certificate failures are also reported **distinctly from authentication failures**. A bad
certificate previously surfaced as `Authentication failed: HTTP 502`, which sends people
hunting for a password problem. The proxy now returns `{ error, code, tlsError: true }`
for known TLS error codes and the UI names the real cause.

Trust is recorded per environment, shown in Settings as
*"Certificate verification disabled for this host"*, and revocable there.

### Verified behaviour

Against `badssl.com`:

| Case | Result |
|---|---|
| self-signed, no opt-in | `502` `DEPTH_ZERO_SELF_SIGNED_CERT` |
| self-signed, with opt-in | `200` |
| expired cert, no opt-in | `502` `CERT_HAS_EXPIRED` |
| valid cert, no opt-in | `200` |
| opt-in header sent upstream | stripped |

---

## Credential storage

### Connection passwords

**Desktop:** the OS keychain via Electron `safeStorage` — Keychain on macOS, DPAPI on
Windows, libsecret on Linux. Ciphertext lands in `<userData>/secrets.json`; the key never
leaves the OS.

**Web:** passwords are **not stored**. The app prompts every time.

This is enforced by `SecretStore.isSecure()`, which returns `false` for the browser
implementation. The "remember password" option is not rendered when it returns false, so
the web build cannot offer it. On Linux without a keyring, `safeStorage` reports
unavailable and the desktop build falls back to prompting rather than storing plaintext.

### OpenAI API key

Encrypted with AES-GCM using a non-extractable `CryptoKey` held in IndexedDB
(`crypto-storage.service.ts`), stored as ciphertext in localStorage. On desktop it
migrates into the keychain on first read.

This protects against casual inspection of localStorage, **not** against an attacker with
local code execution — the key lives in the same browser profile as the ciphertext. That
is why it is not considered good enough for connection passwords.

---

## Electron hardening

The renderer is treated as untrusted:

```js
contextIsolation: true,
nodeIntegration: false,
sandbox: true,
preload: electron/preload.js,
```

`preload.js` exposes an **enumerated** API over `contextBridge` — there is deliberately
no generic `invoke(channel, ...)` escape hatch, so the renderer can only reach the
main-process operations that were explicitly written for it.

`setWindowOpenHandler` denies in-app windows and sends external links to the system
browser, so a link can never open a window with app privileges.

`app.requestSingleInstanceLock()` prevents a second instance racing the first over the
same storage and port.

---

## The local server

`http://127.0.0.1:43117` is bound to the loopback interface only — never `0.0.0.0`.

Static serving resolves every path inside the build root and rejects anything that
escapes it. Verified against both `../` and percent-encoded `%2e%2e` traversal; both
return 404 without disclosing file contents.

Any local process can reach the server while the app runs. It serves the app bundle and
proxies to Creatio hosts the user has configured; it exposes no filesystem access beyond
the build output and holds no credentials — passwords live in the keychain and are sent
per-request.

---

## What is not addressed

- **Builds are unsigned.** See [DISTRIBUTION.md](DISTRIBUTION.md). Unsigned binaries
  cannot be verified as unmodified by the people who receive them.
- **No auto-update.** Security fixes require a manual re-download.
- **The proxy cookie jar is process-wide**, keyed by target host. Multiple environments on
  the same host share a session.
- **`entity-map-db` is not encrypted at rest.** Schema metadata is not secret, but it does
  describe the shape of a production Creatio instance.
