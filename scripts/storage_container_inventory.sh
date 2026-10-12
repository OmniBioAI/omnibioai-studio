#!/usr/bin/env bash
# Read-only inventory of ledger payload storage inside the running Workbench
# and Celery containers (P0 managed-storage pre-cutover gate).
#
# Requires Docker access (docker group or sudo). Uses only `docker ps`,
# `docker inspect` and `docker exec ... python3` that walks directories and
# hashes files. Never prints file contents, never prints environment values
# other than the non-secret storage keys below, never writes, moves or
# deletes anything, and never restarts a container.
#
# Usage: sudo bash scripts/storage_container_inventory.sh > inventory.json
set -euo pipefail

SERVICES=(workbench celery-worker)
SAFE_ENV_KEYS='FTM_LOCAL_ROOT|STORAGE_QUOTA_MODE|STORAGE_QUOTA_BASELINE_VERIFIED|STORAGE_BACKEND_IDENTITY_CHECKS|STORAGE_PHYSICAL_CAPACITY_CHECKS|STORAGE_EXPECTED_FS_TYPE|OMNI_OBJECT_STORAGE_DIR'

read -r -d '' INNER <<'PY' || true
import hashlib, json, os, sys
root = os.environ.get("FTM_LOCAL_ROOT") or "/app/work/file_transfer_manager/local"
scan = sorted({root, "/app/work/file_transfer_manager"})
out = {"effective_ftm_local_root": root, "ftm_local_root_env_set": bool(os.environ.get("FTM_LOCAL_ROOT")), "trees": []}
for top in scan:
    tree = {"path": top, "exists": os.path.isdir(top), "files": [], "file_count": 0, "total_bytes": 0}
    if tree["exists"]:
        st = os.statvfs(top)
        tree["statvfs_fsid"] = hex(st.f_fsid)
        for dirpath, dirnames, filenames in os.walk(top, followlinks=False):
            for name in filenames:
                path = os.path.join(dirpath, name)
                try:
                    info = os.lstat(path)
                    digest = None
                    if os.path.isfile(path) and not os.path.islink(path):
                        h = hashlib.sha256()
                        with open(path, "rb") as handle:
                            for chunk in iter(lambda: handle.read(4 << 20), b""):
                                h.update(chunk)
                        digest = h.hexdigest()
                    tree["files"].append({"relative_path": os.path.relpath(path, top), "bytes": info.st_size,
                                          "mtime": int(info.st_mtime), "sha256": digest, "symlink": os.path.islink(path)})
                    tree["file_count"] += 1
                    tree["total_bytes"] += info.st_size
                except OSError as exc:
                    tree["files"].append({"relative_path": os.path.relpath(path, top), "error": exc.__class__.__name__})
    out["trees"].append(tree)
json.dump(out, sys.stdout)
PY

echo "{"
echo "\"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
echo "\"containers\": ["
first=true
for service in "${SERVICES[@]}"; do
  mapfile -t ids < <(docker ps -q --filter "label=com.docker.compose.service=${service}")
  for id in "${ids[@]}"; do
    $first || echo ","
    first=false
    name=$(docker inspect --format '{{.Name}}' "$id" | sed 's#^/##')
    project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")
    started=$(docker inspect --format '{{.State.StartedAt}}' "$id")
    mounts=$(docker inspect --format '{{json .Mounts}}' "$id")
    env=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$id" \
          | grep -E "^(${SAFE_ENV_KEYS})=" | python3 -c 'import json,sys; print(json.dumps(dict(l.rstrip("\n").split("=",1) for l in sys.stdin if "=" in l)))')
    payloads=$(docker exec -i "$id" python3 - <<<"$INNER" 2>&1 || echo '{"error":"inventory exec failed"}')
    printf '{"service":"%s","container":"%s","project":"%s","started_at":"%s","storage_env":%s,"mounts":%s,"payload_inventory":%s}' \
      "$service" "$name" "$project" "$started" "$env" "$mounts" "$payloads"
  done
done
echo "]"
echo "}"
