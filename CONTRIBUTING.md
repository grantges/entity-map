# Contributing

## Branch model

```
main   ← release branch. Only ever receives merges from dev.
dev    ← integration branch. Default branch. All PRs target this.
<work> ← short-lived branches off dev.
```

`dev` is the repository's default branch, so a new PR targets it automatically. Nothing
is committed directly to `dev` or `main` — work happens on a branch and arrives by pull
request.

`main` moves only at a release: `dev` → `main`, then tag and build the distributables.

### Branch naming

| Prefix | For |
|---|---|
| `fix/` | Bug fixes — `fix/1-search-dropdown-lazy-load` |
| `feat/` | New capability — `feat/electron-shell` |
| `docs/` | Documentation only |
| `chore/` | Build, tooling, dependencies |

Prefix with the issue number when one exists.

---

## Workflow

```bash
git checkout dev && git pull
git checkout -b fix/12-thing

# ... work, committing as you go ...

npx tsc --noEmit -p tsconfig.app.json   # must be clean
npm run build                            # must succeed
npm test                                 # must pass

git push -u origin fix/12-thing
gh pr create --base dev
```

Then review and merge on GitHub. Delete the branch after it lands.

### Running tests

```bash
npm test           # single run, headless — what CI runs
npm run test:watch # re-runs on save, visible browser
npm run test:coverage
```

Fixtures and test doubles live in `src/testing/`. Build entities with `anEntity()` rather
than hand-rolling them, and use `FakeMetadataStore` instead of the real store.

Spec order is randomised (Jasmine's `random: true` default, left in place in
`karma.conf.js`) so specs run in a different order each run; a failure that only shows up
sometimes is more likely inter-spec state leakage than a fluke.

If Karma cannot find a browser (`karma-chrome-launcher` does not always auto-discover a
system Chrome install), point it at one explicitly:

```bash
export CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

### Releasing

```bash
git checkout main && git pull
git merge --ff-only dev
npm version <patch|minor|major>
git push && git push --tags
npm run dist:mac    # see docs/DISTRIBUTION.md
```

---

## Before opening a PR

**There is an automated test suite, and it does not cover everything.** `npm test` runs
Jasmine specs in headless Chrome. It covers the logic core — graph traversal, schema
diffing, `$metadata` parsing, schema export — and two component specs that assert
against real rendered DOM. It does not cover the export pipeline, the diagram page, the
network services, or persistence. Cite it for what it covers; do not cite it as evidence
about anything else.

The bar is:

1. **`npx tsc --noEmit -p tsconfig.app.json`** — clean
2. **`npm run build`** — succeeds
3. **`npm test`** — passes, with a spec covering the change where the change is testable
4. **Exercise the change in the running app** — not just the built output

Point 4 matters more than it sounds. Several bugs in this codebase shipped a correct-
looking rule that did nothing: a global CSS rule losing a specificity tie to a component
style, a `z-index` inert because the element was not positioned, an `@Output` declared
and never bound. Grepping the bundle proves the code shipped, not that it works. See the
traps section in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

For UI changes, verify in this order:

1. Interact with the real control and confirm the effect
2. Hit-test it — `document.elementFromPoint()` at its centre returns the control, not an
   overlay sitting on top of it
3. Read computed styles from the real rendered node, never a synthesised one

`docs/DEVELOPMENT.md` documents how to drive the desktop app over CDP for this.

---

## Commits

Explain **why**, not just what. The diff already shows what changed; what it cannot show
is the reasoning, the constraint, or the failure mode being avoided — which is exactly
what the next person needs.

Reference issues so they close on merge:

```
Fixes #1
```

Record non-obvious findings in the body. If a fix required a second attempt because the
first was subtly wrong, say so — that is the part worth reading later.

---

## Pull requests

State the problem, the change, and how it was verified. Include real evidence — actual
numbers, actual output — rather than an assertion that it works.

Call out anything left undone. A known gap named in the PR is a decision; the same gap
discovered later is a defect.

---

## Security-affecting changes

Anything touching the proxy, credential storage, TLS handling, or the Electron preload
bridge needs a note in the PR describing the trust-boundary change, and
[docs/SECURITY.md](docs/SECURITY.md) updated in the same PR.

Defaults must be safe. If a setting weakens security it is opt-in, per-connection, and
surfaced only when actually needed — never a convenience default.
