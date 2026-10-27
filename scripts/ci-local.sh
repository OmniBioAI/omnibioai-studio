#!/usr/bin/env bash
set -uo pipefail

readonly REPOSITORY_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"

ref="HEAD"
if [[ "${1:-}" == "--ref" ]]; then
  if [[ $# -ne 2 ]]; then
    echo "usage: scripts/ci-local.sh [--ref <git-ref>]" >&2
    exit 2
  fi
  ref="$2"
elif [[ $# -ne 0 ]]; then
  echo "usage: scripts/ci-local.sh [--ref <git-ref>]" >&2
  exit 2
fi

if ! commit="$(git -C "$REPOSITORY_ROOT" rev-parse --verify "${ref}^{commit}" 2>/dev/null)"; then
  echo "FAIL  setup (unknown ref: $ref)"
  echo "FAIL  overall (0/8 steps passed)"
  exit 1
fi
readonly commit

readonly WORKTREE_PARENT="${CI_LOCAL_WORKTREE_ROOT:-$(dirname "$REPOSITORY_ROOT")}"
readonly CACHE_ROOT="${CI_LOCAL_CACHE_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/omnibioai-studio-ci-local}"
if ! mkdir -p "$CACHE_ROOT/npm" "$CACHE_ROOT/pip" "$CACHE_ROOT/playwright"; then
  echo "FAIL  setup (cannot create cache root: $CACHE_ROOT)"
  echo "FAIL  overall (0/8 steps passed)"
  exit 1
fi
run_root="$(mktemp -d "${WORKTREE_PARENT}/.omnibioai-studio-ci-local.XXXXXX")"
readonly run_root
worktrees=()
passed=0
failed=0

cleanup_worktrees() {
  local worktree
  for worktree in "${worktrees[@]}"; do
    git -C "$REPOSITORY_ROOT" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  done
}
trap cleanup_worktrees EXIT INT TERM

lint_and_validate() {
  npm install
  node -e "JSON.parse(require('fs').readFileSync('package.json'))"
  node -e "JSON.parse(require('fs').readFileSync('electron-builder.json'))"
  npm run test:secrets
  python3 -m pip install --quiet pyyaml pytest
  python3 -m pytest tests/test_compose_network_exposure.py \
                    tests/test_compose_release_config.py \
                    tests/test_safe_compose_diagnostics.py \
                    tests/test_canonical_compose_path.py \
                    tests/test_integration_credentials.py -q
}

gitleaks_history() {
  local worktree="$1"
  local git_common_dir
  git_common_dir="$(git -C "$worktree" rev-parse --path-format=absolute --git-common-dir)"

  docker run --rm \
    --volume "${worktree}:/repo:ro" \
    --volume "${git_common_dir}:${git_common_dir}:ro" \
    ghcr.io/gitleaks/gitleaks:v8.30.1 git \
    --redact=100 \
    --no-banner \
    --no-color \
    --log-opts="${commit} --tags" \
    --gitleaks-ignore-path=/repo/.gitleaksignore \
    /repo
}

ui_tests() {
  npm ci
  npm run test:ui
}

ui_quality() {
  npm ci
  npx --no-install playwright install chromium
  npm run test:ui-quality
}

build_ui() {
  npm ci
  npx cross-env OMNIBIOAI_DEV_MODE=false npm run build:ui
  test -f dist/index.html
}

mysql_drill_contract() {
  python3 -m pytest tests/test_mysql_recovery_drill.py -q
}

service_catalog() {
  npm run check-docs
}

required_secrets_and_compose() {
  cat >.env <<'ENVEOF'
MACHINE_DIR=/tmp/omnibioai
DATA_DIR=/tmp/omnibioai/data
WORK_DIR=/tmp/omnibioai/work
REGRESSION_HEALTH_ARTIFACT_HOST_PATH=/tmp/omnibioai/work/out/regression-health.json
WORKSPACE_HOST=/tmp/omnibioai
DB_INIT_DIR=/tmp/omnibioai/db-init
VIDEO_DIR=/tmp/omnibioai/videos
GHCR_PULL_TOKEN=placeholder
RAGBIO_API_KEY=placeholder
NCBI_API_KEY=placeholder
NCBI_EMAIL=ci@omnibioai.org
MYSQL_ROOT_PASSWORD=cipassword
AUTH_SECRET_KEY=cikey
LICENSE_SECRET=cilicense
GF_ADMIN_PASSWORD=cigrafana
LIMSX_DJANGO_SECRET_KEY=cilims
JUPYTER_TOKEN=cijupyter
RSTUDIO_PASSWORD=cirstudio
VSCODE_PASSWORD=civscode
AUTH_DB_PASSWORD=ciauthdb
AUTH_AUDIT_INTEGRITY_KEY=ciauditintegrity
AUDIT_READER_DB_PASSWORD=ciauditreader
AUDIT_WRITER_DB_PASSWORD=ciauditwriter
INTERACTION_DB_PASSWORD=ciinteraction
NEO4J_PASSWORD=cineo4j
REDIS_HEALTHCHECK_PASSWORD=ciredishealth
REDIS_ACL_SCRIPT_PATH=/tmp/omnibioai/redis-acl/redis_acl_bootstrap.py
REDIS_ACL_POLICY_PATH=/tmp/omnibioai/redis-acl/acl-policy.json
REDIS_ACL_CREDENTIAL_DIR=/tmp/omnibioai/redis-acl/credentials
TES_TOOLSERVER_CLIENT_ID=ci-tes-toolserver
TES_TOOLSERVER_CLIENT_SECRET=citestoolserver
TES_TOOLSERVER_REGISTRATION_CLIENT_ID=ci-tes-toolserver-registration
TES_TOOLSERVER_REGISTRATION_CLIENT_SECRET=citestoolserverregistration
INTEGRATION_CREDENTIAL_SERVICE_SECRET=ciintegrationcredential
STORAGE_BILLING_URL=http://ci-storage-billing.invalid
ENVEOF

  mkdir -p .secrets
  echo 'CACHE_REDIS_URL=redis://ci:ci@redis:6379/0' >.secrets/rag_redis.env

  docker compose -f docker-compose.yml config --quiet

  local compose_file
  for compose_file in docker-compose.release.yml docker-compose-release.yml; do
    docker compose -f "$compose_file" config --quiet
  done
  docker compose -f docker-compose.release.yml \
    -f docker-compose.release.dev-ports.yml config --quiet

  local missing_secrets_env="$PWD/.ci-local-missing-secrets.env"
  local compose_error_log="$PWD/.ci-local-compose-error.log"
  grep -v -E '^(MYSQL_ROOT_PASSWORD|AUTH_SECRET_KEY|LICENSE_SECRET|GF_ADMIN_PASSWORD|LIMSX_DJANGO_SECRET_KEY|JUPYTER_TOKEN|RSTUDIO_PASSWORD|VSCODE_PASSWORD)=' \
    .env >"$missing_secrets_env"
  for compose_file in docker-compose.release.yml docker-compose-release.yml; do
    if docker compose --env-file "$missing_secrets_env" -f "$compose_file" config --quiet 2>"$compose_error_log"; then
      return 1
    fi
    grep -q "required variable" "$compose_error_log"
  done
}

run_step() {
  local slug="$1"
  local label="$2"
  local command_name="$3"
  local worktree="$run_root/worktree-$slug"
  local log="$run_root/$slug.log"
  local started_at=$SECONDS
  local status=0

  worktrees+=("$worktree")
  if ! git -C "$REPOSITORY_ROOT" worktree add --quiet --detach "$worktree" "$commit" >"$log" 2>&1; then
    status=1
  else
    (
      set -e
      cd "$worktree"
      export CI=true
      export npm_config_cache="$CACHE_ROOT/npm"
      export PIP_CACHE_DIR="$CACHE_ROOT/pip"
      export PLAYWRIGHT_BROWSERS_PATH="$CACHE_ROOT/playwright"
      "$command_name" "$worktree"
    ) >>"$log" 2>&1
    status=$?
  fi

  git -C "$REPOSITORY_ROOT" worktree remove --force "$worktree" >/dev/null 2>&1 || true

  if [[ $status -eq 0 ]]; then
    passed=$((passed + 1))
    rm -f "$log"
    printf 'PASS  %s (%ss)\n' "$label" "$((SECONDS - started_at))"
  else
    failed=$((failed + 1))
    printf 'FAIL  %s (%ss; log: %s)\n' "$label" "$((SECONDS - started_at))" "$log"
  fi
}

run_step lint-and-validate "lint and validate" lint_and_validate
run_step gitleaks-history "gitleaks on git history" gitleaks_history
run_step ui-tests "npm run test:ui" ui_tests
run_step ui-quality "UI-quality suite" ui_quality
run_step build "build" build_ui
run_step mysql-drill "MySQL drill" mysql_drill_contract
run_step service-catalog "service catalog" service_catalog
run_step required-secrets "required secrets and Compose" required_secrets_and_compose

if [[ $failed -eq 0 ]]; then
  printf 'PASS  overall (%s/8 steps passed; ref %s)\n' "$passed" "$commit"
  rm -rf "$run_root"
  exit 0
fi

printf 'FAIL  overall (%s/8 steps passed; logs: %s; ref %s)\n' "$passed" "$run_root" "$commit"
exit 1
