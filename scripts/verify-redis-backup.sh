#!/usr/bin/env bash
# Verify an encrypted Redis backup without restoring it.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib-alert.sh"
ARTIFACT="${1:-}"
KEY_FILE="${REDIS_BACKUP_ENCRYPTION_KEY_FILE:-/home/manish/redis-prod-credentials/redis_backup_encryption.pass}"
[[ -n "$ARTIFACT" ]] || { echo "usage: verify-redis-backup.sh ARTIFACT.gpg" >&2; exit 2; }
fail_verify() { emit_security_alert redis-backup restore_verification_failed critical "$1"; exit 1; }
[[ -f "$ARTIFACT" && -s "$ARTIFACT" ]] || fail_verify "backup artifact missing"
[[ -f "$KEY_FILE" && "$(stat -c '%a' "$KEY_FILE")" == 600 ]] || fail_verify "backup encryption credential unavailable"
MANIFEST="${ARTIFACT%.tar.gz.gpg}.manifest.json"
[[ -f "$MANIFEST" ]] || fail_verify "backup manifest missing"
python3 - "$MANIFEST" "$ARTIFACT" <<'PY'
import hashlib, json, sys
from pathlib import Path
m = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
a = Path(sys.argv[2])
assert m["state"] == "VERIFIED"
assert m["restore_verified"] is False
assert m["default_user"] == "off"
assert m["sha256"] == hashlib.sha256(a.read_bytes()).hexdigest()
assert m["artifact_size_bytes"] == a.stat().st_size
assert sorted(m["contains"]) == ["dump.rdb", "users.acl"]
PY
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$KEY_FILE" --decrypt "$ARTIFACT" | tar -tzf - | sort | diff -u - <(printf '%s\n' dump.rdb users.acl | sort) >/dev/null || fail_verify "encrypted artifact structure or decryption failed"
echo "VERIFIED artifact=$(basename "$ARTIFACT") state=VERIFIED restore_verified=false"
