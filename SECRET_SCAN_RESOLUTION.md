# Secret-Scan CI Resolution (Issue #63)

Follow-up to `SECRET_SCAN_CI_INVESTIGATION.md`, which diagnosed the root
cause (Part 1) and left Part 2 blocked on live-credential determinations
only the repo owner could make. This document records those
determinations and the resulting fix.

## Root cause (recap)

`actions/checkout@v4` with `fetch-depth: 0` force-updates every tag
(`+refs/tags/*`). The `v0.2.0` / `v0.2.0-beta` tags were never advanced
past a pre-history-rewrite snapshot, so CI's `gitleaks git /repo` (which
walks every ref, not just `main`) permanently rescans two abandoned tag
tips instead of `main`'s real, clean history. `main` itself has 0 leaks in
389 commits.

## Live-credential determinations (owner-verified)

Each of the 7 findings was individually checked — no blanket
justification. Methods used:

| # | Commit | File:Line | Rule | Status | Verification method |
|---|--------|-----------|------|--------|----------------------|
| 1 | `979ba0c0c` | `.env:15` | github-fine-grained-pat | Rotated/revoked | Absent from current GitHub fine-grained token list entirely |
| 2 | `cced81dac` | `.env:8` | generic-api-key (RAGBIO_API_KEY) | Rotated | Direct value comparison: current live value differs from leaked value |
| 3 | `981226817` | `docker-compose.yml:232` | jwt | Dead | JWT payload decoded from leaked token; `exp` ≈ 2026-05-25, already past |
| 4 | `11c868fb5` | `docker-compose.release.yml:213` | jwt | Dead | JWT payload decoded from leaked token; `exp` ≈ 2026-05-25, already past |
| 5-7 | `975460f35` | `DEPLOYMENT.md:232,317,320` | curl-auth-user (Grafana/Prometheus) | Different/safe | Direct comparison: current `GF_ADMIN_PASSWORD` is not the leaked `omnibioai` default |

Findings 3-7 are also byte-identical content (same author, date, diff) to
commits already covered by pre-existing `.gitleaksignore` entries
(`8e35ae534a8`, `9a12a77d00b`, `4f94b88909f`) — those were the correct
main-ancestor commits before the history rewrite changed every descendant
hash. The tag-only commits above are the same secrets under their
pre-rewrite hashes, which is why the old entries didn't suppress them.

Note: the RAGBIO_API_KEY's current live value was independently rotated a
second time during this investigation, for an unrelated reason (accidental
exposure in a separate chat session). That second rotation isn't reflected
in `.gitleaksignore`'s justification comment — it's not something this
specific git-history finding required, and is mentioned here only for the
record.

## Fix applied

Added 7 individually-justified entries to `.gitleaksignore` (see that
file's comments for the per-entry rationale and evidence), one per
fingerprint above. Kept the 5 pre-existing entries as-is.

## Verification

1. Re-fetched with CI's exact refspec
   (`+refs/heads/*:refs/remotes/origin/* +refs/tags/*:refs/tags/*`) to rule
   out the stale-local-tag false-clean failure mode described in Part 1 of
   the investigation doc. Confirmed local `v0.2.0` / `v0.2.0-beta` already
   matched `origin` exactly (no drift this time).
2. Ran a fresh, unfiltered `gitleaks git` scan (no ignore file) directly
   against the repo to pull real fingerprints/line numbers from the tool
   itself rather than transcribing them — all 7 matched the investigation
   doc and the table above exactly.
3. Ran `scripts/secret-scan.sh` (the actual CI step) with the updated
   `.gitleaksignore`: `450 commits scanned`, **no leaks found**, exit 0.

## Artifacts

- `gitleaks-report.json` (untracked, `[]` — a clean-`main`-only scan with
  zero findings) deleted; nothing in it needed preserving.
- `SECRET_SCAN_CI_INVESTIGATION.md` and this file committed as the
  permanent record of the investigation and resolution.

## Remaining steps

- Open a PR on `fix/gitleaks-issue-63-tag-history-secrets` referencing
  issue #63, confirm CI goes green there.
- Comment on issue #63 with this resolution once the PR is up.
- Close issue #63 after the PR merges (not before — merge is a human
  decision, not automated here).
