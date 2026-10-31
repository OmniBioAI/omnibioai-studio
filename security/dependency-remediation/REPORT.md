# OmniBioAI Studio v0.8.1 dependency security remediation

Assessment run: 2026-10-31 (UTC), Node v22.23.3, npm 10.9.9, npm registry reachable.
Base: `b7f547516b12d13bbb1a4e29dae26129085731a8`.

## Executive result

The fresh baseline audit reproduced 51 findings (3 low, 33 moderate, 11 high,
4 critical). Targeted dependency updates reduced this to 29 (2 low, 27
moderate, no high or critical). The production-only audit went from one high
finding to zero. The full audit still exits 1 because moderate/low development,
build, test, and packaging findings remain. No findings were added by package
name compared with the baseline.

This is meaningful risk reduction, not a clean audit or release approval.
Electron 42 is now used by the desktop package and Linux ARM64 packaging was
verified, but packaged login and Node 20 qualification remain unverified. The
AppImage built; the DEB build stopped because the existing package metadata has
no project homepage, and RPM was not reached. Release readiness remains
NO-GO pending those gates and review of the residual moderate/low findings.

## Evidence and reproducibility

- Baseline full audit: `npm audit --json` against the lockfile at the base SHA.
- Final full audit: `npm audit --json` after remediation.
- Production-only audit: `npm audit --omit=dev --json` before and after.
- Registry access succeeded. Baseline and final raw npm audit data are saved
  alongside this report. `audit-classification.json` joins audit findings to
  locked versions, install locations, directness, and dependency exposure.
- `npm ci` completed successfully from the updated lockfile (1,022 packages
  installed; 29 audit findings reported).
- The two full-tree audit commands exit nonzero because npm reports remaining
  advisories; this is a findings result, not a network failure.
- `npm audit fix --dry-run` fails inside npm 10.9.9 with
  `Cannot read properties of null (reading 'edgesOut')`; bulk automatic fixes
  were not used. Several individual npm update attempts also hit peer-graph
  resolution errors; no force or legacy-peer-deps option was used.

## Before / after

| Scope | Total | Critical | High | Moderate | Low |
|---|---:|---:|---:|---:|---:|
| Full lockfile, before | 51 | 4 | 11 | 33 | 3 |
| Full lockfile, after | 29 | 0 | 0 | 27 | 2 |
| Production tree, before | 1 | 0 | 1 | 0 | 0 |
| Production tree, after | 0 | 0 | 0 | 0 | 0 |

The production-only result excludes dev dependencies. Electron is declared as
a dev dependency but is shipped in desktop installers, so it was separately
treated as runtime exposure and updated; it is not dismissed based on
`--omit=dev`.

## Critical/high baseline findings and disposition

| Package (locked baseline) | Severity and issue class | Baseline exposure / dependency path | Result |
|---|---|---|---|
| `@storybook/addon-vitest` 10.5.2; `storybook` 10.5.2 | Critical: preview origin validation / dev-server code injection (GHSA-f2ph-cmg5-wxc8, GHSA-px85-f4q5-jh77) | Storybook dev/test tooling in `packages/omnibioai-ui` | Resolved by upgrading the Storybook toolchain to 10.6.5. |
| `handlebars` 4.7.9 | Critical: template injection / prototype pollution advisories | Dev-only `standard-version` → conventional changelog writer | Resolved by compatible transitive update. |
| `shell-quote` 1.10.0 | Critical: command injection / argument parsing | Dev-only `concurrently` | Resolved by compatible transitive update. |
| `@xmldom/xmldom` 0.8.13 | High: XML injection, malformed parsing and resource exhaustion (10 GHSA records in baseline audit) | Electron packaging/signing toolchain | Resolved by lockfile update; no runtime XML usage change. |
| `brace-expansion` 1.1.16, 2.1.2, 5.0.7 | High: expansion DoS and recursion exhaustion (multiple GHSA records) | Build/test/package globs | Resolved across installed versions. |
| `browserslist` 4.28.6 | High: memory exhaustion and unsafe custom stats parsing | Build-time browser target data | Resolved by compatible update. |
| `electron` 41.7.1 | High: Electron runtime security advisories (multiple GHSA records) | Declared dev dependency, bundled as the desktop application runtime | Resolved by moving to patched Electron 42.11.18. This is a major runtime step and remains subject to Node 20 and packaged-login qualification. |
| `extract-zip` 2.0.1 | High: archive path traversal / symlink handling advisories | Build-time Electron packaging dependencies | Resolved by compatible transitive update. |
| `fast-uri` 3.1.4 | High: URI parsing and validation issues (multiple GHSA records) | Development/build dependency path | Resolved by compatible transitive update. |
| `js-yaml` 4.3.0 | High: unsafe YAML loading / prototype-related advisories | Also reachable through production `electron-updater`; packaging toolchain shares the package | Resolved; production-only audit now reports zero findings. |
| `nanoid` 3.3.16 | High: predictable/weak identifier generation advisory | Build/test dependency path | Resolved by lockfile update. |
| `source-map-js` 1.2.1 | High: source-map handling advisory | Build-time dependency path | Resolved by compatible update. |
| `undici` 6.28.0 and 7.28.0 | High: TLS validation, cache/cross-user disclosure, response handling and DoS advisories | Dev/test and tooling dependency paths | Resolved by lockfile update. |
| `vite` 8.1.5 | High: dev-server/custom middleware and editor command issues (5 GHSA records) | Direct development/build dependency | Resolved by compatible Vite 8.3.5 update. |

Every baseline package record, advisory URL/title/range, lock location, and
transitive propagation is preserved in `audit-before.json` and
`audit-classification.json`; the full final classification is in the same
classification file. That JSON is the per-finding machine-readable inventory,
including findings whose audit record inherits an issue from another package.

## Changes made

| Dependency | Before | After | Rationale / compatibility evidence |
|---|---:|---:|---|
| `electron` | 41.7.1 | 42.11.18 | First patched major line reported by the audit; 41.x had no patched version. Linux ARM64 unpacked packaging and AppImage creation succeeded. Major runtime upgrade; login is not verified. |
| `electron-builder` | 26.15.7 | 26.18.1 | Patch/minor within existing `^26.15.3` range; updated packaging toolchain. |
| `vite` | 8.1.5 | 8.3.5 | Patch/minor within existing `^8.0.16` range; all renderer and web production builds passed. |
| `postcss` | 8.5.19 | 8.5.32 | Compatible patch within existing `^8.5.10` range. |
| Storybook suite | 10.5.2 | 10.6.5 | Compatible minor within the UI package’s `^10.4.5` ranges; UI suite passed. |
| `@storybook/addon-mcp` | 0.6.0 | removed | No source/config import or configured addon use found in the UI package. It introduced `@storybook/mcp`/Valibot dependencies and had no safe 0.x patch; removal is dev-only. |
| Transitive package lock entries | varied | targeted patched releases where existing constraints allowed | Addresses high/critical findings such as Handlebars, shell-quote, brace-expansion, browserslist, fast-uri, js-yaml, xmldom, extract-zip and related packages. |

No application source, auth, licensing, API, service routing, or version
display code was changed. The Studio version remains 0.8.1 and BETA remains.
The root lockfile has 189 package-record changes (16 added, 63 removed, 110
version changes); the UI package lock has 61 (1 added, 15 removed, 45 version
changes). This churn is larger than the direct manifest delta because npm
re-resolved the Electron/Vite/Storybook dependency graphs; it passed clean
install, tests, and builds, but deserves review before publication.

## Residual moderate/low findings

The final full audit has 29 vulnerable package records (27 moderate, 2 low),
all under development, test, build, PWA-generation, or desktop-packaging
dependency paths. The production-only tree is clean. Remaining package names
and exact locations are in `audit-classification.json`; the material groups
are:

- Electron Builder/package tooling: `@electron/asar`, `@electron/universal`,
  `app-builder-lib`, `dmg-builder`, `electron-builder`, `electron-winstaller`,
  `electron-builder-squirrel-windows`, `ejs`, `jake`, `temp`, `filelist`,
  `rimraf`, plus `glob`/`minimatch`. npm’s suggested fix is a major downgrade
  to electron-builder 20.23.1; that is not accepted as a safe fix.
- Workbox/PWA build tooling: `vite-plugin-pwa`, `workbox-build`,
  `@trickfilm400/rollup-plugin-off-main-thread`, `@rollup/plugin-node-resolve`,
  `deepmerge`, and associated `glob`/`minimatch`. npm suggests PWA 1.1.0, but
  that version’s peer range stops at Vite 7 while Studio uses Vite 8; no
  downgrade was applied.
- Storybook React docgen’s `glob` chain remains; npm suggests downgrading
  `@storybook/react-vite` to 8.5.3, a major downgrade from the compatible 10.x
  toolchain.
- Vitest 4.1.10 / `@vitest/mocker` remain moderate. npm exposes patched 4.1.12,
  but updating the exact-peer Vitest/browser package set failed with ERESOLVE;
  no peer checks were bypassed. This is dev/test-only and merits a separate
  aligned lock update.
- `standard-version` and its `minimatch`/`dotgitignore` chain remain moderate.

The audit records are version/range evidence, not proof that each vulnerable
code path is reachable in Studio's actual behavior. Runtime exploitability was
not independently demonstrated. CI, local developer tooling, the PWA build,
and packaging remain relevant attack surfaces even though the production-only
tree is clean.

## Verification

- `npm ci`: PASS; lockfile installation succeeded. Deprecation warnings remain
  for older transitive packages such as `glob@7`, `rimraf@2`, `inflight`, and
  legacy conventional-changelog modules.
- Focused version/sidebar/header suite using the package's intended Vitest
  runner: PASS, 2 files / 51 tests. An initial root-level `npx vitest` command
  selected a mismatched runner context and failed before collection; rerunning
  via `npm --prefix packages/omnibioai-ui run test:app -- ...` passed.
- Full UI suite: PASS, 153 files passed, 2 skipped; 2,434 passed, 2 skipped.
  The skipped Workbench contract suites require `WORKBENCH_SOURCE`.
- Desktop renderer build: PASS, minified JS 1,452.37 kB (baseline 1,453.20 kB).
- Web/PWA build: PASS, minified JS 1,453.30 kB (baseline 1,454.13 kB); service
  worker generated. Existing large-chunk and Vite config-loader warnings remain.
- Both generated builds contain `v0.8.1` and `BETA`. The remaining `v0.8.0`
  string is a Workbench example log, not a Studio release label.
- Linux ARM64 unpacked Electron packaging: PASS with Electron 42.11.18.
- Linux ARM64 AppImage: PASS, generated under `/tmp` (not committed).
- Linux ARM64 DEB: BLOCKED by existing missing `homepage` metadata in
  `package.json`; RPM was not reached. No metadata-only workaround was added.
- Packaged desktop login: BLOCKED / not run. No Electron-specific auth
  regression suite is configured in this repository.
- Changed-file Gitleaks directory scans: PASS for both package manifests,
  both lockfiles, and the new dependency-remediation report directory.
- A separate full-worktree directory scan reported 23 matches in unchanged
  baseline files (`docs/DEPLOYMENT.md`, two developer-test files, and existing
  `security-artifacts/*` reports). None of those files is modified or staged
  by this workstream. Treat the full-worktree scan as NOT CLEAN; the matches
  were not independently classified as real secrets versus false positives.
- Official repository history scanner (`bash scripts/secret-scan.sh`): PASS,
  721 commits / approximately 240.18 MB scanned, no leaks found.
- Node 20: BLOCKED; only Node 22.23.3 is available in checked environments.
  Node 20 CI qualification was not claimed.
- `npm run check-docs`: PASS; service catalog matches 42 Compose services.
- `npm run test:secrets`: PASS, 1 test.

## Release decision and next steps

Security remediation status: PARTIAL. Critical/high and production-only
findings are cleared by the current audit, but moderate/low build and packaging
findings remain. Release readiness: NO-GO until Node 20 CI-compatible
qualification, installer packaging (including the existing missing homepage
metadata), packaged login, and explicit review of remaining moderate findings
are completed. No HIPAA, legal-compliance, or security-certification claim is
made.

The branch is intended for review, not publication. No push, tag, GitHub
release, or deployment is authorized or performed. The original v0.8.1 branch,
v0.9 stabilization branch, and original checkout remain separate and
unchanged.
