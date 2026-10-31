# Studio v0.8.1 remaining infrastructure dependencies

Date: 2026-10-31
Implementation commit: `3230d41e24c7b8dc1a8813dc336300917e8cceb8`

The mandatory packaged-authentication gate needs:

1. An Auth/release-owner-approved HTTPS staging origin implementing the inspected `/auth/login`, `/auth/refresh`, `/auth/validate`, `/auth/logout`, `/users/me/mfa/*`, and `/me` contract.
2. A dedicated non-production account delivered through an approved secret-injection method, with MFA/revocation/expiry controls available to the tester.
3. A disposable Linux ARM64 GUI environment with a supported OS key store (not Electron Linux `basic_text`), working GL/X11 or Wayland, and permission to install/test AppImage and DEB.
4. RPM tooling only if RPM is declared in the v0.8.1 Linux ARM64 release scope.
5. An approved local Gitleaks binary or explicitly trusted scanning environment. The Docker scan was denied because it would mount Git history into a third-party container.

Do not substitute production credentials, production accounts, HTTP, disabled TLS validation, or an invented hostname. Until items 1–3 exist and the full packaged lifecycle passes, release remains NO-GO.
