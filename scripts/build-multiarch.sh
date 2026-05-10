#!/usr/bin/env bash
# Build OmniBioAI Docker images for linux/amd64 from this ARM64 build machine
# and push to ghcr.io/man4ish.
#
# Cross-compilation strategy (ARM64 host → amd64 target):
#   - Node build stages use --platform=$BUILDPLATFORM so npm runs natively on arm64
#   - Python runtime stages run under QEMU amd64 (apt/pip work fine under QEMU)
#   - QEMU x86_64 binfmt must be registered: docker run --privileged tonistiigi/binfmt --install amd64
#
# Usage:
#   ./scripts/build-multiarch.sh                  # build + push all images
#   ./scripts/build-multiarch.sh --no-push        # build only
#   ./scripts/build-multiarch.sh --no-cache       # force clean build
#   ./scripts/build-multiarch.sh tes rag          # build specific images by short name
#   ./scripts/build-multiarch.sh --no-push tes    # build one image, no push

set -euo pipefail

# ─── CONFIG ───────────────────────────────────────────────────────────────────
REGISTRY="ghcr.io/man4ish"
PLATFORM="linux/amd64"
BUILDER="omnibioai-multiarch"
BASE="/home/manish/Desktop/machine"

# Each entry: "short-name|repo-dir|dockerfile|image-tag"
IMAGES=(
  "workflow-bundles|omnibioai-workflow-bundles|Dockerfile.new|omnibioai-workflow-bundles:latest"
  "tool-images|omnibioai-tool-images|Dockerfile.new|omnibioai-tool-images:latest"
  "tes|omnibioai-tes|Dockerfile.new|omnibioai-tes:latest"
  "rag|omnibioai-rag|Dockerfile.new|omnibioai-rag:latest"
  "dev-hub|omnibioai-dev-hub|Dockerfile.new|omnibioai-dev-hub:latest"
  "model-registry|omnibioai-model-registry|Dockerfile.new|omnibioai-model-registry:latest"
  "toolserver|omnibioai-toolserver|Dockerfile.new|omnibioai-toolserver:latest"
  "lims|omnibioai-lims|Dockerfile.new|omnibioai-lims:latest"
  "videos|omnibioai-videos|Dockerfile|omnibioai-videos:latest"
  "sdk|omnibioai_sdk|Dockerfile|omnibioai-sdk:latest"
  "control-center|omnibioai-control-center|Dockerfile.new|omnibioai-control-center:latest"
  "app|omnibioai|Dockerfile|omnibioai-app:latest"
)

# ─── COLOUR HELPERS ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
err()     { echo -e "${RED}✗ $*${RESET}"; }
header()  { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }

# ─── ARG PARSING ──────────────────────────────────────────────────────────────
PUSH=true
NO_CACHE=false
FILTER=()

for arg in "$@"; do
  case "$arg" in
    --no-push)  PUSH=false ;;
    --no-cache) NO_CACHE=true ;;
    --*)        err "Unknown flag: $arg"; exit 1 ;;
    *)          FILTER+=("$arg") ;;
  esac
done

# ─── PREFLIGHT ────────────────────────────────────────────────────────────────
header "Preflight"

if ! docker info &>/dev/null; then
  err "Docker daemon is not running."
  exit 1
fi

if $PUSH; then
  info "Push enabled — make sure you are logged in: docker login ghcr.io"
fi

# Ensure QEMU amd64 binfmt is registered (required for arm64→amd64 cross-build)
info "Installing QEMU amd64 binfmt handler"
docker run --rm --privileged tonistiigi/binfmt --install amd64 2>/dev/null | \
  grep -o '"linux/amd64"' || true

# Create or reuse the cross-build builder
if ! docker buildx inspect "$BUILDER" &>/dev/null; then
  info "Creating buildx builder: $BUILDER"
  docker buildx create --name "$BUILDER" --driver docker-container \
    --driver-opt network=host --use
else
  info "Using existing buildx builder: $BUILDER"
  docker buildx use "$BUILDER"
fi

info "Target platform: $PLATFORM (BUILDPLATFORM=linux/arm64 for native build stages)"

$NO_CACHE && info "Cache disabled (--no-cache)"
info "Platform: $PLATFORM"

# ─── BUILD LOOP ───────────────────────────────────────────────────────────────
PASSED=(); FAILED=(); SKIPPED=()

for entry in "${IMAGES[@]}"; do
  IFS='|' read -r short_name repo_dir dockerfile image_tag <<< "$entry"

  # Apply name filter if args were given
  if [[ ${#FILTER[@]} -gt 0 ]]; then
    match=false
    for f in "${FILTER[@]}"; do
      [[ "$short_name" == "$f" ]] && match=true && break
    done
    $match || { SKIPPED+=("$short_name"); continue; }
  fi

  context="$BASE/$repo_dir"
  df_path="$context/$dockerfile"
  full_image="$REGISTRY/$image_tag"

  header "$short_name"
  info "Context   : $context"
  info "Dockerfile: $dockerfile"
  info "Image     : $full_image"

  if [[ ! -d "$context" ]]; then
    err "Repo directory not found: $context"
    FAILED+=("$short_name (missing dir)")
    continue
  fi

  if [[ ! -f "$df_path" ]]; then
    err "Dockerfile not found: $df_path"
    FAILED+=("$short_name (missing Dockerfile)")
    continue
  fi

  build_args=(
    buildx build
    --builder "$BUILDER"
    --platform "$PLATFORM"
    --file "$df_path"
    --tag "$full_image"
  )
  $PUSH     && build_args+=(--push)
  $NO_CACHE && build_args+=(--no-cache)
  build_args+=("$context")

  if docker "${build_args[@]}"; then
    success "$short_name built${PUSH:+ and pushed} successfully"
    PASSED+=("$short_name")
  else
    err "$short_name FAILED"
    FAILED+=("$short_name")
  fi
done

# ─── SUMMARY ──────────────────────────────────────────────────────────────────
header "Summary"

if [[ ${#PASSED[@]} -gt 0 ]]; then
  success "Passed  (${#PASSED[@]}): ${PASSED[*]}"
fi
if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  warn    "Skipped (${#SKIPPED[@]}): ${SKIPPED[*]}"
fi
if [[ ${#FAILED[@]} -gt 0 ]]; then
  err     "Failed  (${#FAILED[@]}): ${FAILED[*]}"
  exit 1
fi

echo ""
success "All requested images built${PUSH:+ and pushed}."
