# Secret-Scan CI Investigation

Status: **Part 1 resolved. Part 2 blocked — needs your decision before any
`.gitleaksignore` change is made. Part 3 not started. Part 4 done separately
(see bottom).**

## Part 1 — Commit-count discrepancy: RESOLVED

Reproduced CI's exact result locally: `450 commits scanned` / `leaks found: 7`
(count differs slightly from CI's 437 only because my dev clone still carries
a few extra local-only branches beyond what a fresh CI clone has — see below;
this has no effect on which leaks are found, confirmed).

**Root cause, with evidence:**

1. `scripts/secret-scan.sh` doesn't take a ref — it mounts the whole `.git`
   directory and runs `gitleaks git /repo`. Gitleaks' git-mode walks **every
   ref in the repo** (branches *and* tags), not just the checked-out branch.
2. CI's `actions/checkout@v4` with `fetch-depth: 0` fetches with
   `+refs/heads/*:refs/remotes/origin/* +refs/tags/*:refs/tags/*` — confirmed
   from the actual job log (`gh api .../jobs/99201926572/logs`). The leading
   `+` **force-updates every tag**, even a conflicting one.
3. My day-to-day local clone had **stale copies of the `v0.2.0` and
   `v0.2.0-beta` tags**. Running the identical fetch CI uses produced:
   `t [tag update] v0.2.0 -> v0.2.0` and `v0.2.0-beta -> v0.2.0-beta` — i.e.
   my local tags were pointing somewhere else and got force-moved. A plain
   `git fetch`/`git pull` never force-moves a conflicting tag, so an ordinary
   dev clone silently keeps drifting from what CI actually scans.
4. Once local tags matched origin exactly, the local scan reproduced CI's
   `leaks found: 7` immediately.
5. All 7 findings' commits are **unreachable from any branch** (`git branch
   --all --contains` = empty for all seven) but **are reachable from the
   `v0.2.0` / `v0.2.0-beta` tags** (`git tag --contains` confirms). They are
   not part of `main`'s real history.
6. For 5 of the 7, I diffed the tag-only commit against the commit already
   named in `.gitleaksignore` for the same file/rule/line — same author date,
   same commit message, byte-identical `--stat` (same files, same
   insertions/deletions) in every pair checked:
   - `981226817e7...` (tag-only) ≡ `8e35ae534a8...` (already in
     `.gitleaksignore`, ancestor of `main`) — both "feat: integration tests
     - 121 passing, 0 failures", identical 9-file/1670-insertion diff.
   - `11c868fb543...` (tag-only) ≡ `9a12a77d00b...` (already ignored) —
     identical diff (License gate + UI changes).
   - `975460f350e...` (tag-only, 3 findings) ≡ `4f94b88909f...` (already
     ignored) — identical diff (Grafana/Prometheus datasource + Workbench
     UI changes).

   Conclusion: at some point `main`'s history was rewritten (commit hashes
   changed for identical content — the parent chain differs, so every
   descendant hash changed too), which is exactly why `main`'s current
   history is clean (my very first local scan, before touching tags, found
   **0 leaks in 389 commits**). The `v0.2.0`/`v0.2.0-beta` tags were never
   moved forward and still point at the pre-rewrite snapshot, so they
   permanently retain the old secret-containing blobs. This is *not* related
   to the `backup/main-before-pr51-rebase` branch (checked — unrelated, much
   later, Aug 16) — it's a separate, earlier rewrite.

**Net effect:** CI is not scanning `main`. It's (unintentionally) scanning
two abandoned release tags that predate a history-scrub, every single run.

## Part 2 — Triage of the 7 findings: 5 of 7 have a provenance answer, liveness is NOT verified for any

| # | File | Rule | Tag-only commit | Status |
|---|------|------|------|--------|
| 1 | `.env` | `github-fine-grained-pat` | `979ba0c0c` (2026-05-28) | **New** — no prior `.gitleaksignore` entry |
| 2 | `docker-compose.yml:232` | `jwt` | `981226817` (2026-05-25) | Duplicate of already-ignored `8e35ae5` (see above) |
| 3-5 | `DEPLOYMENT.md:232,317,320` | `curl-auth-user` | `975460f35` (2026-05-22) | Duplicate of already-ignored `4f94b8890` (Grafana/Prometheus basic-auth) |
| 6 | `.env` (`RAGBIO_API_KEY`) | `generic-api-key` | `cced81dac` (2026-05-22) | **New** — no prior `.gitleaksignore` entry |
| 7 | `docker-compose.release.yml:213` | `jwt` | `11c868fb5` (2026-05-27) | Duplicate of already-ignored `9a12a77d0` |

Structural checks that came back clean:
- Current `main` no longer hardcodes any of these — `docker-compose.yml`'s
  `JWT_SECRET`/`AUTH_SECRET_KEY` is `${AUTH_SECRET_KEY:?...}`, and `.env` is
  untracked + gitignored on `main`.
- The existing `.gitleaksignore` comment ("Reviewed historical findings...")
  is a **blanket** justification, not five individual ones — it doesn't say
  *why* each is safe (rotated? fixture? placeholder?), so I can't treat it as
  the individual verification Part 2 requires even for the 5 duplicates.

**What I could not verify, and why I stopped here rather than guess:**
Whether any of these five values — a GitHub fine-grained PAT, a
`RAGBIO_API_KEY`, a JWT signing secret (x2), and Grafana/Prometheus
basic-auth credentials — are still valid *today* is not something I can
determine from the repository alone, and I did not test any of them against
a live service (I don't have the plaintext — I ran everything with
`--redact=100` — and testing a possibly-real credential against a live
system without your explicit sign-off is exactly the kind of decision your
instructions asked me to bring to you rather than automate). The fact that
current `main` has since parameterized these files is evidence someone
*touched* this area, but it doesn't by itself prove the underlying secret
values were rotated at the service that issued them.

**I'm stopping here per your instructions** ("if any finding is a
genuinely live... credential: STOP... credential rotation is a decision I
need to make explicitly" and "do not add anything to `.gitleaksignore` you
haven't individually verified"). I have not confirmed any of the 7 as
definitely live, but I also can't confirm any as definitely dead — so I'm
not writing `.gitleaksignore` entries or touching Part 3 until you tell me
whether these five secrets (PAT, RAGBIO key, 2x JWT secret, Grafana/
Prometheus creds — all dated 2026-05-22 through 2026-05-28) have been
rotated since. If you confirm rotation/dead, I'll write the five individual
justification lines and proceed to Part 3. If any turns out to still be
live, tell me and I'll stop there entirely per your instructions.

## Part 3 — Not started (blocked on Part 2 above).

## Part 4 — PR #67

Independently verified before merging (didn't just take the task description
on faith): `gh pr view 67 --json files,commits,mergeable` shows a single-file,
7-line, 0-deletion, comment-only addition to `docker-compose.yml` (a `TODO`
above the `rag` service's now-unused `GITHUB_TOKEN`/`RAGBIO_API_KEY` build
args, referencing `omnibioai-rag#25`), `mergeable: MERGEABLE`, diff matches
its own description exactly. No code/behavior change, no secrets touched.

Merged separately — see below.
