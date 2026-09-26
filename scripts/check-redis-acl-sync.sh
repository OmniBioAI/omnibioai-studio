#!/usr/bin/env bash
# Compare Redis ACL metadata after removing authentication hashes.
set -euo pipefail

runtime_acl="${1:-}"
persisted_acl="${2:-}"
[[ -f "$runtime_acl" && -f "$persisted_acl" ]] || exit 2

normalize() {
  awk '{
    out=""
    for (i=1; i<=NF; i++) {
      if ($i ~ /^#[0-9A-Fa-f]{64}$/ || $i ~ /^\$[0-9A-Fa-f]{64}$/) continue
      out = out (out == "" ? "" : " ") $i
    }
    if (out != "") print out
  }' "$1" | sort
}

runtime_tmp="$(mktemp)"
persisted_tmp="$(mktemp)"
trap 'rm -f "$runtime_tmp" "$persisted_tmp"' EXIT
normalize "$runtime_acl" > "$runtime_tmp"
normalize "$persisted_acl" > "$persisted_tmp"
cmp -s "$runtime_tmp" "$persisted_tmp"
