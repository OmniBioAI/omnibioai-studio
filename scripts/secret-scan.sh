#!/usr/bin/env bash
set -euo pipefail

readonly IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1"
readonly REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"

docker run --rm \
  --volume "${REPOSITORY_ROOT}:/repo:ro" \
  "${IMAGE}" git \
  --redact=100 \
  --no-banner \
  --no-color \
  --gitleaks-ignore-path=/repo/.gitleaksignore \
  /repo
