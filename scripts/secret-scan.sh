#!/usr/bin/env bash
set -euo pipefail

readonly IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1"
readonly REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"
# In a linked worktree (scripts/ci-local.sh) .git is a file pointing into the main
# repository's git dir; mount that dir at the same absolute path so gitleaks can
# read the history. In a normal checkout it is /repo/.git and nothing is added.
readonly GIT_COMMON_DIR="$(cd "${REPOSITORY_ROOT}" && realpath "$(git rev-parse --git-common-dir)")"
extra_volumes=()
if [[ "${GIT_COMMON_DIR}" != "${REPOSITORY_ROOT}/.git" ]]; then
  extra_volumes=(--volume "${GIT_COMMON_DIR}:${GIT_COMMON_DIR}:ro")
fi

docker run --rm \
  --volume "${REPOSITORY_ROOT}:/repo:ro" \
  ${extra_volumes[@]+"${extra_volumes[@]}"} \
  "${IMAGE}" git \
  --redact=100 \
  --no-banner \
  --no-color \
  --gitleaks-ignore-path=/repo/.gitleaksignore \
  /repo
