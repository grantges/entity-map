# Entity Map

Visualise a Creatio OData schema as an interactive entity-relationship diagram.

Point it at a Creatio instance (or drop in an exported `$metadata` XML file), pick an
entity, and explore its relationships outward one hop at a time. Annotate entities and
columns with descriptions, capture baselines to diff schema changes over time, and export
documentation or Creatio package schemas.

Ships as both a **web app** and a **macOS/Windows desktop app** from the same codebase.

---

## Quick start

### Web

Creatio does not send CORS headers to external origins, so browser `fetch` fails at
preflight. A small local proxy forwards those requests:

```bash
npm install
npm run start:live      # proxy on :3100 + ng serve on :4200
```

Open <http://localhost:4200>. Use `npm start` instead if you only need file import.

### Desktop

```bash
npm run electron:start  # build, then launch the desktop app
npm run electron:dev    # or: live reload against ng serve
```

### Distributables

```bash
npm run dist:mac        # DMG + zip into release/
npm run dist:win        # NSIS installer
```

> Builds are currently **unsigned**. macOS Gatekeeper will refuse to open the app on
> another machine. See [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

---

## Core concept: everything is an environment

An **environment** is one Creatio schema you work with. A connection is not a separate
thing you manage — it is an optional capability of an environment:

| State | Meaning |
|---|---|
| schema, no connection | Imported from a file. Update it by importing again. |
| schema + connection | Connected. Can pull a fresh schema from the server. |
| connection, no schema | Connected but never pulled yet. |

Opening an environment is always instant — it reads a cached schema from IndexedDB.
Connected environments can **pull latest** from the toolbar; a banner nudges you when a
cache is more than 7 days old.

A pull never applies silently. It fetches, diffs against what is loaded, and shows what
would change before you confirm. Descriptions and custom columns are stored separately
from the server schema and survive a pull, so the warning flags only the narrow real
risk: entities you have annotated or extended that the server no longer has.

---

## Features

- **Interactive ERD** — depth-limited relationship traversal (1–3 hops), horizontal or
  vertical layout, per-tab view state
- **Two import paths** — live OData pull, or drag-and-drop `$metadata` XML
- **Annotations** — descriptions for entities and columns, plus locally-added custom
  entities and columns, stored per environment
- **AI descriptions** — optional OpenAI-generated entity and column documentation
- **Baselines and diffs** — snapshot a schema, compare later, export only what changed
- **Exports** — Word documentation (`.docx`) and Creatio package schema XML

---

## Project layout

```
electron/                  Desktop shell (main process, preload, local server, proxy)
proxy-server.js            Standalone CORS proxy for web development
src/app/
  core/
    models/                Domain types (Environment, entity/schema models)
    platform/              Platform abstraction — the one web/desktop seam
    services/              Metadata store, OData, environments, export, AI, baselines
    workers/               Off-thread $metadata XML parsing
  features/diagram/        Environment picker, diagram page, canvas
  shared/                  Atoms / molecules / organisms
docs/                      Architecture, development, security, distribution
```

---

## Documentation

| | |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Domain model, the web/desktop seam, storage, proxy design |
| [Development](docs/DEVELOPMENT.md) | Scripts, workflows, and the traps that will cost you an hour |
| [Security](docs/SECURITY.md) | TLS trust model, credential storage, Electron hardening |
| [Distribution](docs/DISTRIBUTION.md) | Packaging, signing, notarisation, what is still missing |
| [Contributing](CONTRIBUTING.md) | Branch model, PR workflow, verification bar |

---

## Requirements

Developed and tested on **Node 24**; no minimum is enforced in `package.json`, so older
versions are untested rather than known-bad.

A Creatio instance and credentials are needed for live connections. File import works
entirely offline.
