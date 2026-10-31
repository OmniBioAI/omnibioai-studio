# Studio v0.8.1 desktop session lifecycle test report

Date: 2026-10-31
Branch: `security/studio-v0.8.1-electron-hardening`
Implementation commit: `3230d41e24c7b8dc1a8813dc336300917e8cceb8`

## Automated evidence

`npm run test:electron-security` passed 30/30. `npm run test:ui -- --run tests/ui/session.test.js tests/ui/auth.test.jsx tests/ui/app-shell.test.jsx` passed 46/46. The full UI suite passed 2,437 tests with two existing `WORKBENCH_SOURCE`-dependent skips.

| Scenario | Result | Evidence/limit |
|---|---|---|
| Fresh password login | PASS (unit/UI) | Tokens are validated and persisted only through protected storage; desktop sign-in is reachable after the license entitlement gate. |
| MFA and recovery code | PASS (unit/UI) | Renderer receives an opaque challenge ID; invalid attempts retain that handle; raw challenge/token values remain in main. |
| Application restart | PASS (unit), BLOCKED (package) | Protected refresh restoration and rotation are covered with a fake `safeStorage`; no real keychain restart test. |
| Access-token refresh | PASS (unit) | Existing rotating `/auth/refresh` contract used; network failure does not downgrade transport. |
| Expired/revoked refresh | PASS (unit) | 400/401/403 invalidates memory and protected state. |
| Explicit logout | PASS (unit) | Local state is cleared before best-effort server revocation. |
| Network/Auth outage | PASS (unit) | Safe `AUTH_NETWORK` result, 15-second timeout, no token/error disclosure or HTTP fallback. |
| Secure storage unavailable | PASS (unit) | Login fails before credential submission; no in-memory/plaintext session. Existing ciphertext is not decrypted or deleted. |
| Corrupt protected state | PASS (unit) | Corrupt state is cleared and status becomes `corrupt`. |
| Application reload | PASS (UI/unit) | Renderer exposes only an opaque desktop marker and safe profile metadata. |
| Multiple windows / foreign frames | PASS (policy unit) | Only the registered main window's exact main frame may invoke auth IPC. |
| Unexpected navigation | PASS (policy unit) | Main/guest navigation and window creation restrictions deny untrusted origins. |
| Actual packaged lifecycle | BLOCKED | No approved HTTPS staging Auth origin/account and no verified OS keychain/inspectable GUI runner. |

These are unit/helper and renderer tests, not evidence of a real Auth deployment. Packaged staging login, restart, expiry, revocation, logout, and secure-storage failure remain mandatory external qualification gates.
