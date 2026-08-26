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

git push -u origin fix/12-thing
gh pr create --base dev
```

Then review and merge on GitHub. Delete the branch after it lands.

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

**There is no automated test suite.** `src/` contains zero `.spec.ts` files and the
Angular schematics are configured with `skipTests: true`, so `npm test` runs Karma
against nothing. A green `npm test` proves nothing today — do not cite it as evidence.

Until that changes, the bar is:

1. **`npx tsc --noEmit -p tsconfig.app.json`** — clean
2. **`npm run build`** — succeeds
3. **Exercise the change in the running app** — not just the built output

Point 3 matters more than it sounds. Several bugs in this codebase shipped a correct-
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

> Adding tests would replace most of this checklist and is the single highest-value
> improvement available to the project.

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
