# BioRepository portal: Upload / Register screenshots (M7)

Captured 2026-11-14 from the real Studio web build (`vite build --mode web`) against a throwaway
dev stack: Workbench from `feat/biorepo-m6-lineage` on its own MySQL 8.0, an internal Docker network
with no internet access, and a dev-only token carrying `biorepo.admin` (no production Auth, data or grants).
Desktop is 1400 px wide, mobile is 390 px wide.

| State | Desktop | Mobile |
|---|---|---|
| Empty | `desktop-1-empty.png` | `mobile-1-empty.png` |
| File selected | `desktop-2-file-selected.png` | `mobile-2-file-selected.png` |
| Upload in progress (24 MiB file, chunk PUTs held 1.5 s each in the test browser) | `desktop-3-upload-in-progress.png` | `mobile-3-upload-in-progress.png` |
| Validation error (register a folder that is not the caller's: `PATH_NOT_ALLOWED`) | `desktop-4-validation-error.png` | `mobile-4-validation-error.png` |
| Ready (sealed version opened after upload) | `desktop-5-ready.png` | `mobile-5-ready.png` |

On mobile the files table scrolls sideways; accepted for Phase 1.
