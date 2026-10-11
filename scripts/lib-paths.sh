#!/usr/bin/env bash
# Shared portable path defaults. Values supplied by the operator always win.
set -u

_omni_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_omni_checkout="$(cd "${_omni_script_dir}/.." && pwd -P)"
export OMNIBIOAI_ROOT="${OMNIBIOAI_ROOT:-${_omni_checkout}}"

omni_default_path() {
  local name="$1" relative="$2"
  if [[ -z "${!name:-}" ]]; then
    printf -v "$name" '%s' "${OMNIBIOAI_ROOT}/${relative}"
    export "$name"
  fi
}

omni_default_path MACHINE_DIR ..
omni_default_path WORKSPACE_HOST ..
omni_default_path WORK_DIR ../omnibioai-work
omni_default_path DATA_DIR ../omnibioai-data
omni_default_path DB_INIT_DIR db-init
omni_default_path VIDEO_DIR ../omnibioai-videos/content
omni_default_path REDIS_BACKUP_DESTINATION ../omnibioai-data/secure-backup
