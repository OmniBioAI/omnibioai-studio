#!/usr/bin/env python3
"""Inspect Compose structure and variable presence without resolving values.

This tool deliberately parses the source YAML. It never invokes ``docker
compose config``, reads container environments, or prints environment values.
"""

from __future__ import annotations

import argparse
import os
import re
from pathlib import Path
from typing import Any

import yaml

VARIABLE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)")


def load_compose(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data.get("services", {}), dict):
        raise ValueError(f"{path}: top-level services must be a mapping")
    return data


def dotenv_names(path: Path | None) -> set[str]:
    names: set[str] = set()
    if path is None or not path.exists():
        return names
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name = line.split("=", 1)[0].strip()
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            names.add(name)
    return names


def referenced_variables(value: Any) -> set[str]:
    if isinstance(value, str):
        return set(VARIABLE.findall(value))
    if isinstance(value, dict):
        return set().union(*(referenced_variables(v) for v in value.values())) if value else set()
    if isinstance(value, list):
        return set().union(*(referenced_variables(v) for v in value)) if value else set()
    return set()


def environment_names(service: dict[str, Any]) -> list[str]:
    environment = service.get("environment") or {}
    if isinstance(environment, dict):
        return sorted(str(name) for name in environment)
    if isinstance(environment, list):
        return sorted(str(entry).split("=", 1)[0] for entry in environment)
    return []


def compact_sequence(value: Any) -> str:
    if not value:
        return "none"
    if isinstance(value, dict):
        return ", ".join(sorted(str(item) for item in value))
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    return str(value)


def report(compose: dict[str, Any], defined: set[str], show_env: bool) -> str:
    services = compose.get("services", {})
    lines = [f"services: {len(services)}"]
    for name in sorted(services):
        service = services[name] or {}
        health = "configured" if service.get("healthcheck") else "absent"
        lines.extend(
            (
                f"\n[{name}]",
                f"  healthcheck: {health}",
                f"  depends_on: {compact_sequence(service.get('depends_on'))}",
                f"  ports: {compact_sequence(service.get('ports'))}",
                f"  volumes: {compact_sequence(service.get('volumes'))}",
            )
        )
        if show_env:
            names = set(environment_names(service)) | referenced_variables(service)
            lines.append("  variable presence:")
            if not names:
                lines.append("    none")
            for variable in sorted(names):
                status = "SET" if variable in defined else "UNSET"
                lines.append(f"    {variable}: {status}")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compose-file", type=Path, default=Path("docker-compose.yml"))
    parser.add_argument("--env-file", type=Path, default=Path(".env"))
    parser.add_argument("--env-status", action="store_true", help="show names as SET/UNSET; never values")
    args = parser.parse_args()

    compose = load_compose(args.compose_file)
    defined = set(os.environ) | dotenv_names(args.env_file)
    print(report(compose, defined, args.env_status))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
