#!/usr/bin/env python3
"""Refuse to publish a Workbench image that would break packaged installs.

Workbench images containing storage_ledger/backend_guard.py reject artifact
uploads (503 STORAGE_BACKEND_UNAVAILABLE) unless an explicitly configured,
persistent, identity-verified storage backend is present. Packaged desktop
installs run the release Compose files, so such an image may only be pushed
once BOTH release files configure that backend for workbench and
celery-worker. The decision comes from file contents, never from a flag.

Exit codes: 0 publish allowed, 1 blocked, 2 usage error.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE_FILES = ("docker-compose.release.yml", "docker-compose-release.yml")
SERVICES = ("workbench", "celery-worker")
DGX_SPECIFIC = "/mnt/wdpro26tb"
FALSE = {"false", "0", "no", "off"}


def _env(service: dict) -> dict[str, str]:
    env = service.get("environment") or {}
    if isinstance(env, list):
        env = dict(item.split("=", 1) if "=" in item else (item, "") for item in env)
    return {str(k): str(v) for k, v in env.items()}


def _default(value: str) -> str:
    # "${VAR:-x}" -> "x"; "${VAR:?msg}" -> "" (required, no default); literal otherwise.
    if value.startswith("${") and value.endswith("}"):
        body = value[2:-1]
        if ":-" in body:
            return body.split(":-", 1)[1]
        return ""
    return value


def service_problems(name: str, service: dict) -> list[str]:
    problems, env = [], _env(service)
    root = env.get("FTM_LOCAL_ROOT", "")
    if not root.startswith("/"):
        problems.append(f"{name}: FTM_LOCAL_ROOT is not an explicit absolute container path")
    if not env.get("STORAGE_EXPECTED_FS_UUID"):
        problems.append(f"{name}: STORAGE_EXPECTED_FS_UUID (backend identity) is not configured")
    for key in ("STORAGE_BACKEND_IDENTITY_CHECKS", "STORAGE_PHYSICAL_CAPACITY_CHECKS"):
        if _default(env.get(key, "true")).lower() in FALSE:
            problems.append(f"{name}: {key} defaults to disabled")
    if _default(env.get("STORAGE_QUOTA_BASELINE_VERIFIED", "false")).lower() not in FALSE:
        problems.append(f"{name}: STORAGE_QUOTA_BASELINE_VERIFIED must not default to true")
    binds = [v for v in service.get("volumes") or [] if isinstance(v, dict) and v.get("target") == root]
    short = [v for v in service.get("volumes") or [] if isinstance(v, str) and v.split(":")[1:2] == [root]]
    if short:
        problems.append(f"{name}: storage root uses short bind syntax, which silently creates a missing host path")
    if not binds:
        problems.append(f"{name}: no persistent mount targets FTM_LOCAL_ROOT; payloads would be container-local")
    for bind in binds:
        if bind.get("type") != "bind" or (bind.get("bind") or {}).get("create_host_path") is not False:
            problems.append(f"{name}: storage bind must be type=bind with create_host_path: false")
    return problems


def check(workbench_src: Path, root: Path = ROOT) -> dict:
    guard = workbench_src / "storage_ledger" / "backend_guard.py"
    if not guard.is_file():
        return {"status": "allowed", "reason": "image does not contain the managed-storage guard"}
    try:
        import yaml
    except ImportError:
        return {"status": "blocked", "problems": ["PyYAML unavailable; cannot verify release Compose files"]}
    problems = []
    for filename in RELEASE_FILES:
        text = (root / filename).read_text(encoding="utf-8")
        if DGX_SPECIFIC in text:
            problems.append(f"{filename}: hard-codes the DGX-specific path {DGX_SPECIFIC}")
        services = (yaml.safe_load(text) or {}).get("services") or {}
        for name in SERVICES:
            if name not in services:
                problems.append(f"{filename}: service {name} missing")
                continue
            problems += [f"{filename}: {p}" for p in service_problems(name, services[name])]
    return {"status": "blocked" if problems else "allowed", "problems": problems,
            "release_storage_compatibility": "BLOCKED" if problems else "VERIFIED"}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--workbench-src", type=Path, required=True, help="build context of the image being published")
    args = ap.parse_args(argv)
    if not args.workbench_src.is_dir():
        print(json.dumps({"status": "error", "reason": f"{args.workbench_src} is not a directory"}), file=sys.stderr)
        return 2
    result = check(args.workbench_src)
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "allowed" else 1


if __name__ == "__main__":
    sys.exit(main())
