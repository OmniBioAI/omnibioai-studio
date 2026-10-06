# Account Personalization V1

Personalization belongs to the IAM/Auth user, using the existing authenticated
`GET /me/preferences` and `PATCH /me/preferences`. There is no new service,
organization model, browser preference store or identity selector. Auth derives
ownership from the authenticated principal; requests cannot choose `user_id`.

## Contract and UI

| Field | Choices / limit | Default |
| --- | --- | --- |
| `response_style` | concise, balanced, detailed | balanced |
| `technical_level` | general, bioinformatics, expert | general |
| `preferred_language` | en, es, fr, de, pt, hi, ja, ko, zh, ar; or null | null: existing AI default |
| `personal_instructions` | plain text, 2,000 Unicode code points | empty string |

`/studio/personalization` uses manual App routing, AccountLayout, desktop and
mobile AccountMenu, the shared authenticated preference client and provider.
The PWA navigation allowlist includes the new page; APIs remain uncached.
There is no Studio interface translation or inferred language selection.

An explicit Save sends only changed personalization fields. Timezone and other
personal preferences are preserved. Inputs are disabled during saving, and
only a confirmed canonical response produces the saved state. Validation and
network failures keep the draft for retry. The textarea counts Unicode code
points instead of HTML maxlength's UTF-16 units, consistently with Auth.
Instruction content only appears as a controlled textarea value, never HTML.

Session generation, token and request checks reject stale API responses. The
form is keyed by account/session owner, so logout or account changes clear
private drafts and pending confirmations. Unmounting the page ignores local
save completion. Existing timezone consumers and notification behavior remain
unchanged. Older IAM responses containing only timezone keep timezone working;
Personalization shows unavailable and cannot claim a successful save.

## Consumption decision

`PERSONALIZATION_CONSUMPTION=DEFERRED`.

Studio's `pages/Studio.jsx` sends Literature AI to `/_svc/rag/` and OmniBioAgent
to the Workbench bio-agent plugin. `pages/ServiceViewer.jsx` hosts those apps
in iframe/webview surfaces. `components/workbench/QueryRenderer.jsx` and
`AsyncAnalysisRenderer.jsx` construct descriptor-specific plugin requests.
None is a canonical AI request composition layer with authority to establish
prompt precedence. Therefore V1 ships persistence and UI only. The page says
that AI apps do not apply the settings yet.

Future integration requires one agreed AI request owner and a typed preference
contract below all authentication, authorization, security/system prompts,
scientific validation, audit, workflow validation, governance and billing
controls. Personal instructions remain untrusted user content. No AI memory,
conversation memory, profile inference, tracking or learned facts are added.

## Qualification and rollout

Focused UI tests cover load/save, all four fields, invalid input, explicit-save
behavior, pending/error/saved states, keyboard access, literal markup,
unauthenticated state, legacy API behavior, stale reads/writes, logout and
navigation. Account routing/menu, timezone and notification tests cover shared
integration regressions. Browser tests exercise the production web build at
360, 390, 768 and 1440 pixels, native keyboard controls, mobile navigation,
reload, failure/retry, and the PWA navigation route.

Install the existing shared UI development dependencies and Playwright's
Chromium browser before browser qualification. Run `npm run test:ui`,
`npm run build:ui`, `npm run web:build`, then
`node --test tests/browser/account-personalization.test.mjs`. Browser tests
serve local build files and mock IAM; they do not contact deployed services.
Use `PERSONALIZATION_SCREENSHOT_DIR` to keep browser screenshots in a chosen
directory (default: `out/personalization-browser`).

Auth migration `0031_user_personalization` and the extended API must precede
Studio during a separately approved rollout. V1 implementation does not push,
merge, migrate live data or deploy.

## Qualification results (2026-10-06)

- 143 focused Account/preference tests passed, followed by all 686 Studio UI
  tests across 62 files. The final styling change also passed the 16 focused
  Personalization tests.
- All seven Chromium checks passed, including 360/390/768/1440-pixel layouts,
  input text contrast of at least 4.5:1, keyboard navigation, mobile Account
  routing, durable reload, validation and network failure/retry. Screenshots
  were reviewed at desktop and phone sizes.
- Personalization page/validation, preferencesApi and PreferencesProvider each
  reached 100% statements, lines, functions and branches. Global Studio coverage
  is 96.80% statements, 97.95% lines, 97.94% functions and 92.73% branches.
- The global 95% branch gate also fails on canonical main
  `14aa7ca7228bc33f0cb346426c05a931c993070c` (650 tests pass; 92.50% branches).
  Both reports have 229 uncovered branches. This pre-existing gap was not
  changed or waived in configuration.
- Desktop UI, production web UI and the production web Dockerfile built
  successfully. Auth's 217 relevant tests, SQLite/MySQL migrations and production
  Dockerfile also passed. The Auth documentation records the separate incomplete
  supplemental full-suite attempt. No complete full Auth suite pass is claimed.
- Final whitespace/diff checks passed. No push, merge or deployment was performed.
