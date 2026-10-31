# Studio v0.8.1 packaged application qualification

Date: 2026-10-31
Branch: `security/studio-v0.8.1-electron-hardening`
Exact implementation commit: `3230d41e24c7b8dc1a8813dc336300917e8cceb8`

## Artifacts

Built with Node 22.23.3, npm 10.9.9, Electron 42.11.18 and electron-builder 26.18.1, publishing disabled.

| Artifact | Bytes | SHA-256 | Result |
|---|---:|---|---|
| `/tmp/studio-v0.8.1-auth-3230-mYy6i7/OmniBioAI Studio-0.8.1-arm64.AppImage` | 95,800,883 | `188de8351ad4f2662669a246d0836eafd9d40e2e11849388f873ea4a0c33967e` | PASS build/hash; process smoke only |
| `/tmp/studio-v0.8.1-auth-3230-mYy6i7/omnibioai-studio_0.8.1_arm64.deb` | 96,623,392 | `e82d630772eb36e12967429498845b7dfb624e00f14a4a6d4dff5a80231fc893` | PASS build/hash/metadata; not installed |
| RPM | — | — | BLOCKED: `rpmbuild`/`rpm` unavailable |

DEB metadata is package `omnibioai-studio`, version `0.8.1`, architecture `arm64`, homepage `https://omnibioai.org`. The packaged `electron/main.js` Git blob exactly matched the implementation commit.

## Runtime smoke

The first exact-candidate attempt exposed a real startup defect: packaged secrets were directed inside `app.asar`. Commit `3230d41e` moved packaged `.env` storage to Electron user data and added a regression test. The rebuilt AppImage was then launched for 30 seconds with temporary XDG config/cache roots, a no-op Docker shim, and `--disable-gpu`. It stayed running, initialized Chromium state, and created `.env` plus Redis ACL credential files only under temporary user data with `0600` file modes. No archive-path exception recurred.

The remote X11 runner exposed no inspectable application window. Therefore process/runtime initialization is PASS, but visual GUI launch is BLOCKED and is not claimed as a GUI pass.

## Authentication and packaging gates

- Approved HTTPS staging Auth origin: BLOCKED; none found in repository/config/environment.
- Approved non-production account injection: BLOCKED; no credentials were available or used.
- Packaged HTTPS login and API access: BLOCKED.
- Real OS-keychain session restoration/refresh/logout/revocation: BLOCKED.
- Install/upgrade/uninstall/rollback: NOT RUN.
- Updater metadata: FAIL. `latest-linux-arm64.yml` names `OmniBioAI-Studio-0.8.1-arm64.AppImage`, while the built filename contains spaces.
- `desktopName`/window association: warning remains.
- Reproducibility, signing/notarization and complete artifact-set integrity: unverified.

The package build and process smoke do not establish packaged authentication or release readiness.
