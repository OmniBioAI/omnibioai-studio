# Account Preferences V1 ownership and scope

Discovery began at clean Studio `2df3a59d16d857cff3ff821bd1e57360ba7e7b69`
and clean IAM/Auth `2735f205b13b5093f244d4f31d9892d29396bdc6` (both main).

## Inventory before implementation

| Candidate / existing control | Owner and storage | Default / validation | Consumer and decision |
| --- | --- | --- | --- |
| Studio appearance | Fixed Studio/design-token CSS; no saved choice | Dark; no selector or theme validation | Dark token consumers exist, but no alternate Studio theme. DEFERRED. Admin Console's separate `ThemeToggle.tsx` stores `omnibioai_theme` locally; it is not a Studio account setting. |
| Language | No Studio i18n system | English text; no language schema | DEFERRED; no language consumer. |
| Time zone | Previously implicit per-device formatting | Browser-local for Jobs/Security, UTC for Profile member date; no preference | USER_CLOUD in this campaign, consumed by Jobs and Security session/personal-key timestamps. |
| Workspace default | Workbench-specific concepts; Terra deployment config is not a personal Studio workspace registry | Plugin/environment dependent | DEFERRED; no Studio default-workspace consumer. |
| Editor default | Launcher/IDE service destinations | Explicit launch choice; deployment-dependent availability | DEFERRED; IDE availability is not an editor preference consumer. |
| Data/work directories | DEVICE_LOCAL Electron `userData/omnibioai.config.json` | Empty Settings fields; Electron falls back to home/omnibioai/data and work | `electron/main.js:writeEnvFile` consumes paths for deployment. Keep in permission-gated Settings. |
| Host/ports/Compose file | DEVICE_LOCAL Settings JSON | localhost; 8000/8081/9090; docker-compose.yml; mostly input-only validation | Current controls do not consistently match runtime readers (e.g. server.host_ip vs settings.host_ip). Do not duplicate as preferences. |
| Update channel, auto-update | DEVICE_LOCAL Settings JSON | stable / true; select/toggle | Updater runs independently; no reader of these saved fields found. DEFERRED from Preferences. |
| Log level/retention, developer mode | DEVICE_LOCAL Settings JSON | info / 7 / false; select/input/toggle | No runtime consumer of these saved fields found. DEFERRED. |
| Telemetry toggle | DEVICE_LOCAL Settings JSON | false; toggle | Sentry initialization does not read it. DEFERRED; no privacy promise added. |
| Mode/LLM/cloud/HPC config | Machine config or privileged IAM GlobalConfig/OrganizationConfig | Existing deployment/provider schemas | System configuration, organization policy and credentials remain outside Preferences. LLM default_model is not a personal account choice. |
| Sidebar/layout/density | SESSION_EPHEMERAL responsive UI state | Existing CSS breakpoints and component defaults | No durable user preference consumer found. No new control. |
| Autosave | No Studio preference consumer found | Not applicable | DEFERRED. |

Browser Settings currently changes in-memory config when Electron IPC is absent;
it is not cloud account persistence. Existing localStorage keys are principally
session tokens and host/service hints; cookies bridge authentication to embedded
services. No preference store in sessionStorage/IndexedDB was found in Studio.
Existing credentials and machine configuration are deliberately untouched.

## Ownership decision

IAM owns the canonical user record, `/me`, personal sessions and API keys.
Workbench's `users.OmniBioUser` is an application-specific Django identity;
Studio's backend is Electron machine configuration, not a cloud account store.
Add one nullable, typed `users.preferred_timezone` column to IAM instead of a
new service, unrestricted JSON object, or duplicate Studio user record.

`GET /me/preferences` and `PATCH /me/preferences` use IAM's existing
`get_current_user` and derive ownership only from `sub`. No user/organization ID
is accepted in the body. Unknown fields are rejected. IANA identifiers and UTC
are validated by IAM; null means use the active device time zone. This is the
canonical default for new and existing users. Explicit null resets; omitted
fields are preserved. Concurrent writes to the same column are last-commit-wins;
there is no invented ETag/offline synchronization protocol.

## UI and consumers

`/studio/preferences` uses the existing Account shell and custom navigation.
Only Time zone is shown. Suggestions are examples, not a hard-coded exhaustive
zone list. An explicit Save changes the effective value only after IAM confirms.
Errors retain the unsaved draft and previously confirmed effective value.
No offline persistence is claimed and no browser preference storage is used.

`PreferencesProvider` loads once per authenticated session generation. It resets
on logout/account change and rejects stale load/save completion. The provider
preserves the Studio subtree during token refresh; only the Preferences form's
draft is remounted when its owner changes. The same client
uses the existing browser/Electron session alias. Until preference retrieval
succeeds, timestamps use device-local formatting; the Preferences page reports
loading/error rather than asserting a saved default.

The formatter consumes the value in Jobs, Account Security's session/API-key
rows and Developer's personal API-key table. IAM's timezone-naive timestamps are UTC instants. Numeric job epochs are
milliseconds at the formatter boundary. Zone labels are displayed. Date-only
Profile/Billing values, original logs, MFA device metadata and embedded services retain their current semantics.

## Deployment

Deploy IAM migration `0030_user_timezone` and API before Studio. The migration
adds one nullable column, preserving existing users without backfill. The IAM
runtime must have its standard IANA zone database available to Python zoneinfo.
Existing `/me` proxying already covers these endpoints. Only the existing PWA
navigation fallback allowlist gains `/studio/preferences`; no API runtime cache
is added. Test migrations only on disposable databases, not live data.
