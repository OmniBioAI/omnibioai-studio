#!/usr/bin/env bash
# ci-local.sh: run every job of .github/workflows/ci.yml locally against a git ref.
#
#   scripts/ci-local.sh [REF]        REF defaults to origin/main (origin is fetched first)
#
# The ref is checked out into a fresh, detached worktree that is removed afterwards,
# so uncommitted or unpushed local changes are never tested by accident. Steps that
# exist in ci.yml run that step's own `run:` block, read from the ref's ci.yml.
# Prints one line per step (PASS, FAIL or SKIP, with duration) and a summary;
# exits 1 if any step fails. Logs: ~/omnibioai-ci-logs/<timestamp>/ (one file per step).
#
# Every step runs even after a failure, so one run shows everything that is red.
# Steps local hardware can't run (macOS/Windows installers, the tag-only release)
# are reported as SKIP with the reason.

set -uo pipefail

REF="${1:-origin/main}"
REPO="$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse --show-toplevel)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${OBAI_CI_LOG_ROOT:-$HOME/omnibioai-ci-logs}/$STAMP"
mkdir -p "$LOG_DIR"

git -C "$REPO" fetch --quiet origin || { echo "ci-local: git fetch origin failed" >&2; exit 1; }
SHA="$(git -C "$REPO" rev-parse --verify --quiet "$REF^{commit}")" || { echo "ci-local: not a commit: $REF" >&2; exit 1; }

WT="$(mktemp -d "${TMPDIR:-/tmp}/studio-ci-XXXXXX")"
cleanup() {
  git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"
  git -C "$REPO" worktree prune
}
trap cleanup EXIT
git -C "$REPO" worktree add --quiet --detach "$WT" "$SHA" || { echo "ci-local: worktree add failed" >&2; exit 1; }

CI_YML="$WT/.github/workflows/ci.yml"
RESULTS=()
FAILED=0
N=0

record() {   # STATUS SECONDS NAME [NOTE]
  local line
  line="$(printf '%-4s %6ss  %s%s' "$1" "$2" "$3" "${4:+  ($4)}")"
  echo "$line"
  RESULTS+=("$line")
}

log_file() { N=$((N + 1)); printf '%s/%02d-%s.log' "$LOG_DIR" "$N" "$(tr -c 'A-Za-z0-9\n' '-' <<<"$1")"; }

step() {   # NAME COMMAND...   runs COMMAND in the worktree
  local name="$1" log t0 status
  shift
  log="$(log_file "$name")"
  t0=$SECONDS
  if (cd "$WT" && "$@") >"$log" 2>&1; then status=PASS; else status=FAIL; FAILED=1; fi
  record "$status" $((SECONDS - t0)) "$name"
}

skip() {   # NAME REASON
  echo "skipped: $2" >"$(log_file "$1")"
  record SKIP 0 "$1" "$2"
}

# The `run:` block of step NAME in job JOB, as GitHub runs it (bash -eo pipefail).
ci_step() {   # JOB NAME
  local script
  script="$(python3 - "$CI_YML" "$1" "$2" <<'PY'
import sys, yaml
path, job, name = sys.argv[1:]
steps = yaml.safe_load(open(path))["jobs"][job]["steps"]
run = [s["run"] for s in steps if s.get("name") == name and "run" in s]
if len(run) != 1:
    sys.exit(f"ci.yml: job {job} has no single step named {name!r}")
print(run[0])
PY
)" || return 1
  bash --noprofile --norc -eo pipefail -c "$script"
}

has_npm_script() { (cd "$WT/$1" && node -e "process.exit(require('./package.json').scripts?.[process.argv[1]] ? 0 : 1)" "$2"); }

echo "ci-local: $REF = ${SHA:0:12}, node $(node --version) (CI uses 20), logs in $LOG_DIR"

# ---- job: Lint & Validate
step "npm ci (root)" npm ci --no-audit --no-fund
step "Validate JSON configs" ci_step lint "Validate JSON configs"
step "Secret-generation unit tests" ci_step lint "Secret-generation unit tests"
step "Scan Git history for secrets (gitleaks)" ci_step lint "Scan Git history for secrets"
# CI pip-installs pyyaml and pytest; do that in a throwaway venv, not the host Python.
step "Python venv for compose tests" python3 -m venv "$WT/.ci-venv"
export PATH="$WT/.ci-venv/bin:$PATH"
step "Compose security regression tests" ci_step lint "Compose security regression tests"
step "MySQL recovery drill contract" ci_step lint "Validate isolated MySQL recovery drill contract"
step "Create .env for compose validation" ci_step lint "Create .env for compose validation"
step "Validate docker-compose" ci_step lint "Validate docker-compose"
step "Service catalog (check-docs)" ci_step lint "Validate system service catalog"
step "Validate release compose files" ci_step lint "Validate release compose files"
step "Release compose fails closed without secrets" ci_step lint "Release compose must fail closed without required secrets"

# ---- lint (not in ci.yml yet): run it wherever a lint script exists
lint_ran=0
for dir in . packages/omnibioai-ui; do
  if has_npm_script "$dir" lint; then step "Lint ($dir)" npm --prefix "$dir" run lint; lint_ran=1; fi
done
[[ $lint_ran -eq 1 ]] || skip "Lint" "no lint script in package.json or packages/omnibioai-ui"

# ---- UI tests (not in ci.yml yet)
step "npm ci (packages/omnibioai-ui)" npm --prefix packages/omnibioai-ui ci --no-audit --no-fund
step "UI unit tests (npm run test:ui)" npm run test:ui
step "Playwright Chromium (install if missing)" npm --prefix packages/omnibioai-ui exec -- playwright install chromium
step "UI-quality suite (npm run test:ui-quality)" npm run test:ui-quality
step "Browser tests (tests/browser)" bash -c 'node --test tests/browser/*.test.mjs'

# ---- job: Build UI
step "Build React UI" ci_step build-ui "Build React UI"
step "Verify dist" ci_step build-ui "Verify dist"

# ---- jobs: desktop packages (push only in CI)
if command -v fakeroot >/dev/null && command -v rpmbuild >/dev/null; then
  step "Build Linux x64 packages" ci_step build-linux-x64 "Build Linux x64"
  step "Build Linux ARM64 packages" ci_step build-linux-arm64 "Build Linux ARM64"
else
  skip "Build Linux x64 packages" "needs fakeroot and rpmbuild (CI apt-installs them)"
  skip "Build Linux ARM64 packages" "needs fakeroot and rpmbuild (CI apt-installs them)"
fi
skip "Build macOS DMG" "needs a macOS runner"
skip "Build Windows EXE" "needs a Windows runner"
skip "Create GitHub Release" "runs only for v* tags"

# ---- summary
pass=0 fail=0 skipped=0
for r in "${RESULTS[@]}"; do
  case "$r" in PASS*) pass=$((pass + 1)) ;; FAIL*) fail=$((fail + 1)) ;; SKIP*) skipped=$((skipped + 1)) ;; esac
done
{
  echo
  echo "ci-local summary: $REF = ${SHA:0:12}, $(date -u +%Y-%m-%dT%H:%M:%SZ), node $(node --version)"
  printf '%s\n' "${RESULTS[@]}"
  echo "$pass passed, $fail failed, $skipped skipped; logs: $LOG_DIR"
  [[ $FAILED -eq 0 ]] && echo "RESULT: GREEN" || echo "RESULT: RED"
} | tee "$LOG_DIR/summary.txt"
exit "$FAILED"
