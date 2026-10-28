#!/usr/bin/env bash
set -euo pipefail

readonly IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1"
readonly REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"
readonly SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "${SCAN_DIR}"' EXIT

# ci-local runs this script from a linked worktree, whose common Git directory
# contains unrelated local branches and tags. Bundle only HEAD's reachable
# history into a temporary repository so the scan is exactly the ref under test.
git -C "${REPOSITORY_ROOT}" bundle create "${SCAN_DIR}/ref.bundle" HEAD
git init --quiet "${SCAN_DIR}/repo"
git -C "${SCAN_DIR}/repo" fetch --quiet "${SCAN_DIR}/ref.bundle" HEAD:refs/heads/scan-ref
git -C "${SCAN_DIR}/repo" checkout --quiet scan-ref

docker run --rm \
  --volume "${SCAN_DIR}/repo:/repo:ro" \
  "${IMAGE}" git \
  --redact=100 \
  --no-banner \
  --no-color \
  --gitleaks-ignore-path=/repo/.gitleaksignore \
  /repo
