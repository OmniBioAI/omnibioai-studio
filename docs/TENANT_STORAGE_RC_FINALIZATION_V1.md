# Tenant Storage RC finalization

Qualified environment: Node 22.23.3 and npm 9.2.0 on Linux ARM64. `.nvmrc`
pins the tested runtime. Dependencies were installed from both committed
lockfiles with lifecycle scripts disabled; renderer tests and Vite production
builds require no Electron binary installation.

The app test harness resolves its test dependencies from the approved shared
UI package and uses one React renderer. Storage totals clear and reload when
the authenticated session changes. The client uses the server-owned `/me`
identity, no-store requests, and stale-session response rejection.

Focused Storage, account shell, usage API, and session tests passed under Node
22. Production renderer and web/PWA builds passed. Exact committed-HEAD
commands and results are in the final report and evidence package.

Quota mode remains audit and baseline verification remains false. This
qualification does not authorize deployment, hardware activation, or quota
enforcement.
