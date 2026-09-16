#!/usr/bin/env bash
# lib-alert.sh — Track E4 (breadth pass): bash-side vendor-neutral
# security alert emission for backup/restore scripts.
#
# Matches the SAME schema as
# omnibioai-security-audit/audit/security_alerts.py's SecurityAlert
# (condition/severity/component/message/metadata/timestamp) so anything
# already consuming that Python side's JSON (stdout tail, or a file
# sink) can consume backup-side alerts identically -- this is "reusing
# the vendor-neutral alert primitive" in the sense of the same wire
# contract, not a literal Python import: a backup script's whole design
# goal is minimal runtime dependencies (see lib-env.sh's own header on
# why even .env loading avoids `source`/`eval`), and shelling out to
# python3 for every alert would add a heavy, fragile dependency to a
# script that must keep working even when nothing else in the stack is
# healthy.
#
# Default sink: stdout, one JSON line per alert -- same convention as
# the Python side's StdoutAlertSink. Optional: BACKUP_ALERT_LOG_FILE
# appends the same JSONL to a file (mirrors AUDIT_ALERT_LOG_FILE).
#
# Deduplication: a per-condition marker file under BACKUP_ALERT_STATE_DIR
# records the last-sent epoch; a repeat of the same component:condition
# within BACKUP_ALERT_DEDUP_WINDOW_SECONDS (default 300, matching the
# Python side's default) is suppressed. A condition name ending in
# "_recovered" always bypasses dedup, same as the Python side. If the
# state dir can't be created/written, dedup silently degrades to
# "always send" -- failing toward more alerts, never toward silently
# dropping the first-ever alert of a run.
#
# emit_security_alert never fails the calling script -- it always
# returns 0, even if writing the optional log file fails, matching the
# Python side's "alert emission never propagates a failure to the
# caller" contract. Callers must never pass secret/PHI values as
# metadata -- there is no scrubbing here, same discipline as the Python
# side (metadata is exactly what the caller passes, nothing
# auto-enriched, nothing auto-redacted).

# emit_security_alert <component> <condition> <severity> <message> [key=value ...]
emit_security_alert() {
  local component="$1" condition="$2" severity="$3" message="$4"
  shift 4 || true

  local state_dir="${BACKUP_ALERT_STATE_DIR:-${BACKUP_DIR:-/tmp}/../alert-state}"
  local dedup_window="${BACKUP_ALERT_DEDUP_WINDOW_SECONDS:-300}"

  local key_safe
  key_safe="$(printf '%s' "${component}:${condition}" | tr -c 'A-Za-z0-9_.-' '_')"
  local marker="${state_dir}/${key_safe}.last"
  local now
  now="$(date +%s)"

  if [[ "$condition" != *_recovered ]] && [[ -f "$marker" ]]; then
    local last
    last="$(cat "$marker" 2>/dev/null || echo 0)"
    if [[ "$last" =~ ^[0-9]+$ ]] && (( now - last < dedup_window )); then
      return 0  # suppressed duplicate within the window
    fi
  fi
  mkdir -p "$state_dir" 2>/dev/null && echo "$now" > "$marker" 2>/dev/null
  true  # never let a state-dir write failure propagate as this function's exit status

  local metadata_json="{}"
  if [[ $# -gt 0 ]]; then
    metadata_json="$(_alert_metadata_json "$@")"
  fi
  local ts line
  ts="$(date -Iseconds)"
  # Every string field, not just metadata values, must be JSON-escaped --
  # a message containing a literal `"` or `\` (e.g. an error string
  # quoting a file path or another command's own error text) would
  # otherwise produce structurally invalid JSON. Caught by
  # tests/test_lib_alert.py::test_message_with_special_characters_produces_valid_json.
  line="{\"condition\":\"$(_json_escape "$condition")\",\"severity\":\"$(_json_escape "$severity")\",\"component\":\"$(_json_escape "$component")\",\"message\":\"$(_json_escape "$message")\",\"metadata\":${metadata_json},\"timestamp\":\"${ts}\"}"

  echo "[SECURITY-ALERT] ${line}"
  if [[ -n "${BACKUP_ALERT_LOG_FILE:-}" ]]; then
    mkdir -p "$(dirname "${BACKUP_ALERT_LOG_FILE}")" 2>/dev/null
    echo "$line" >> "${BACKUP_ALERT_LOG_FILE}" 2>/dev/null
  fi
  return 0
}

# _json_escape <string> -> the string with `\` and `"` escaped for safe
# embedding inside a JSON string literal. Deliberately minimal (not a
# full JSON-string encoder -- no control-character/unicode escaping) --
# sufficient for the plain diagnostic text this module ever handles, and
# every string field (condition/severity/component/message/metadata
# values) is routed through this one function so there is exactly one
# place that owns this contract.
_json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

# _alert_metadata_json key=value [key=value ...] -> {"key":"value",...}
# Values are always emitted as JSON strings (simplicity over type
# fidelity -- these are diagnostic fields, not a schema contract).
_alert_metadata_json() {
  local json="{" first=1 pair key value
  for pair in "$@"; do
    key="${pair%%=*}"
    value="${pair#*=}"
    if [[ "$first" -eq 1 ]]; then first=0; else json+=","; fi
    json+="\"$(_json_escape "$key")\":\"$(_json_escape "$value")\""
  done
  json+="}"
  echo "$json"
}
