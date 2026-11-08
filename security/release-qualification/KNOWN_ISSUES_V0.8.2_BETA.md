# OmniBioAI Studio v0.8.2-beta — Known Issues and Limitations

## Release status

This is a beta release intended for early evaluation and feedback. Some platform and authentication scenarios have not yet received complete end-to-end qualification.

## Authentication and sessions

- The v0.8.1 desktop authentication architecture is unchanged in this release; its limitations still apply.
- Packaged HTTPS staging login has not been independently verified.
- Real operating-system keychain behavior and packaged session restoration have not been fully qualified.
- Session expiry, server-side revocation and logout have automated test coverage but remain unverified against a live staging Auth service.

Users should report authentication or session-restoration problems with relevant non-sensitive diagnostic information. Never include passwords, tokens, cookies or credentials in bug reports.

## Self-hosted stack

- The Workbench gunicorn change applies to `docker-compose.yml` only and needs a Workbench image built with Workbench #790 (`docker/workbench/serve.sh`). The release compose files still pull the published Workbench image, which does not include it, and keep the previous start command.
- JupyterLab, RStudio and VS Code rely on the router for authentication. RStudio has no login of its own and no published port; do not expose the `ide-rstudio` network or re-publish port 8787.
- VS Code access uses a router-injected session cookie derived from `VSCODE_PASSWORD`. Treat `VSCODE_SESSION_COOKIE` as a password-equivalent secret.
- IDE home directories now live in the `jupyter-home`, `rstudio-home` and `vscode-home` volumes. Recreating an IDE container without its home volume discards user files.
- The docker-socket-proxy now rejects `VolumesFrom`, `container:` and named networks, sysctls, host cgroupns and socket binds. Any custom client that relied on these will receive a deny response.
- The "Run analyses" mode description says it finds and runs tools, workflows and plugins; plugin search and execution from this mode is not yet implemented in the backend.

## Packaging and platform support

- Only the ARM64 AppImage (`OmniBioAI.Studio-0.8.2-arm64.AppImage`) and ARM64 DEB (`omnibioai-studio_0.8.2_arm64.deb`) are qualified. Both were built on the DGX from the release tag. The other 7 installers were built by GitHub Actions from the same tag.
- `SHA256SUMS-v0.8.2-beta.txt` lists all 9 published installers so you can check your download. A file being listed there does not mean it is qualified.
- RPM, x64 Linux, macOS and Windows installers have build-only coverage; installation and launch on those platforms have not been qualified.
- macOS and Windows installers are unsigned and not notarized.
- Installation, upgrade, uninstall and rollback procedures have not all been independently verified.
- Automatic-update metadata has not been qualified; use only explicitly published, checksum-verified artifacts.

## Build and dependency notes

- Release CI builds use Node.js 20; local qualification uses Node.js 22.23.3.
- Full official Docker-backed Gitleaks history scanning remains incomplete.

## Beta expectations

This release is provided for evaluation. Users should retain backups of important data and report reproducible defects.

The beta status does not imply regulatory certification, HIPAA certification or production suitability for regulated workloads.
