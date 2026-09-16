#!/usr/bin/env bash
# lib-env.sh — safe .env loader shared by ops/backup scripts.
#
# Incident 2026-09-16: backup-mysql.sh and check-env.sh both loaded
# .env via `source <(grep -v '^#' "$ENV_FILE" | grep -v '^$')`. That
# feeds every KEY=VALUE line to the shell parser, not just to variable
# assignment — so a rotated secret whose value happened to contain
# shell metacharacters (parentheses, in this case) produced a bash
# syntax error instead of a normal assignment. Because it ran under
# `set -euo pipefail`, the script aborted immediately, before doing
# anything else. In backup-mysql.sh that meant the nightly cron job
# failed silently (stderr went to a log nobody watched) for ~5 weeks
# with zero successful database backups produced in that window.
#
# Fix: parse KEY=VALUE lines as literal text with pure parameter
# expansion — never `source`, `eval`, or process substitution on the
# file's contents. This makes every value byte-for-byte inert to the
# shell parser regardless of what characters it contains.

# load_env_file <path-to-env-file>
# Exports every KEY=VALUE line in the file. Missing file is not an
# error (callers that require specific vars enforce that separately
# with `: "${VAR:?...}"`, same convention as before this fix).
load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Strip a leading "export " if present, same as plain `source` would.
    line="${line#export }"

    # Skip blank lines and full-line comments.
    [[ -z "$line" || "$line" == \#* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"

    # No '=' in the line at all (key == line unchanged) — malformed,
    # fail closed by skipping rather than guessing.
    [[ -z "$key" || "$key" == "$line" ]] && continue

    export "${key}=${value}"
  done < "$env_file"
}
