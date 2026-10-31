# OmniBioAI Studio v0.8.1-beta release execution

Date: 2026-10-31
Branch: `release/studio-v0.8.1-final-execution`
Tag: `v0.8.1-beta`
Decision: **GO for beta publication**

## Decision basis

The release owner explicitly accepted the documented beta limitations covering staging login, real operating-system keychain behavior, packaged session lifecycle, RPM, Node.js 20, and automatic-update metadata qualification. These limitations remain disclosed in `KNOWN_ISSUES_V0.8.1_BETA.md` and are not represented as verified.

Historical V5 qualification remains a NO-GO assessment from before that explicit beta risk acceptance. This execution record supersedes only its release decision; it does not rewrite or overstate the underlying evidence.

## Mandatory safeguards

- No critical or high dependency advisory was found in the fresh exact-tree audit. The production-only audit reported zero advisories.
- Electron authentication/security tests passed 30/30, including HTTPS-only packaged Auth, rejection of Linux `basic_text`, fail-closed protected storage, and no plaintext or authenticated in-memory-only fallback.
- The full UI suite passed 2,437 tests with two documented `WORKBENCH_SOURCE` skips.
- Desktop and web/PWA renderer builds passed on Node.js 22.23.3.
- The final ARM64 AppImage and DEB bytes match the recorded SHA-256 checksums. DEB package name, version, architecture, and homepage metadata were verified.
- Prior isolated AppImage process/runtime initialization passed after the packaged user-data path fix. Visual GUI and real packaged authentication remain unqualified beta limitations.
- No updater metadata is included in the qualified publication set.

## Qualified publication set

| File | Bytes | SHA-256 |
|---|---:|---|
| `OmniBioAI Studio-0.8.1-arm64.AppImage` | 95,800,883 | `188de8351ad4f2662669a246d0836eafd9d40e2e11849388f873ea4a0c33967e` |
| `omnibioai-studio_0.8.1_arm64.deb` | 96,623,392 | `e82d630772eb36e12967429498845b7dfb624e00f14a4a6d4dff5a80231fc893` |

The binaries were built from implementation commit `3230d41e24c7b8dc1a8813dc336300917e8cceb8`. Subsequent commits through the release tag contain qualification and release documentation only; packaged source files are unchanged.

## Excluded and unverified

- RPM and non-ARM64 packages
- Generated automatic-update metadata
- Signing and notarization claims
- Node.js 20 qualification
- Live staging login and packaged session lifecycle
- Real OS-keychain behavior
- Installation, upgrade, uninstall, and rollback qualification

The release is a prerelease beta for evaluation, not a production-readiness, regulatory, HIPAA, or security-certification claim.
