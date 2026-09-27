# OmniBioAI Studio Landing-Page Naming and Routing Report

## Summary

The authenticated default page was `Mode` because `src/ui/App.jsx` initialized the shell at step `0`, which is the Mode page. The portal formerly rendered at step `7` was renamed from Workbench to Studio.

## Changes

- Renamed the portal component from `src/ui/pages/Workbench.jsx` to `src/ui/pages/Studio.jsx`.
- Changed the sidebar portal entry from `Workbench` to `Studio`.
- Updated the portal heading to `OmniBioAI Studio`.
- Updated the subtitle to `Unified access to OmniBioAI platform services, workflows, AI, and security`.
- Authenticated default navigation now opens Studio.
- `/` and legacy `/workbench` canonicalize to `/studio`.
- `/workbench` remains a backward-compatible portal alias.
- Mode remains under Setup and remains accessible.
- Preserved first-run configuration behavior.
- Updated portal-facing back/home controls to say Studio.
- Updated the web PWA fallback for `/studio` and legacy `/workbench`.
- Updated README wording that referred to the portal as Workbench.

## Workbench service preservation

The real Workbench service was not renamed. These remain unchanged:

- `/_svc/workbench/`
- port `8000`
- Workbench service tile and launch labels
- Electron `open-workbench` IPC behavior
- service URLs, backend identifiers, containers, APIs, and environment variables

The remaining Workbench references in the Studio portal are specifically service/module references.

## Tests and verification

- Focused UI tests: 6 files, 78 passed.
- Full UI suite: 31 files, 253 passed.
- Router security tests: 5 passed.
- Documentation service-catalog check: passed.
- `npm run build:ui`: passed.
- `npm run web:build`: passed.
- Production bundles contain Studio heading/subtitle, `/studio`, legacy `/workbench`, and preserved Workbench service references.
- `npm run check-routes` reports existing unrelated route-drift warnings; no new Studio/Workbench-specific failure was found.

## Git safety

No commit, push, deployment, or production restart was performed.

The worktree contained pre-existing unrelated changes before this task, including Electron/session/router files and an untracked Redis backup. Those changes were preserved.

Recommendation: READY TO COMMIT selectively after reviewing and staging only the targeted Studio changes. Do not commit the entire current worktree without separating the pre-existing work.
