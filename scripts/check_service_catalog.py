#!/usr/bin/env python3
"""Fail when docs/SYSTEM_ARCHITECTURE.md drifts from docker-compose.yml."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_COMPOSE = ROOT / "docker-compose.yml"
DEFAULT_CATALOG = ROOT / "docs" / "SYSTEM_ARCHITECTURE.md"

SERVICE_LINE = re.compile(r"^  ([A-Za-z0-9][A-Za-z0-9_.-]*):\s*(?:#.*)?$")
CATALOG_ROW = re.compile(r"^\| `([A-Za-z0-9][A-Za-z0-9_.-]*)` \|")


def compose_services(path: Path) -> list[str]:
    services: list[str] = []
    in_services = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if line == "services:":
            in_services = True
            continue
        if not in_services:
            continue
        if line and not line[0].isspace() and re.match(r"^[A-Za-z0-9_.-]+:", line):
            break
        match = SERVICE_LINE.match(line)
        if match:
            services.append(match.group(1))
    if not in_services:
        raise ValueError(f"{path}: top-level services section not found")
    if not services:
        raise ValueError(f"{path}: no services found")
    return services


def catalog_services(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    start = text.find("## Complete service catalog")
    end = text.find("## Deployment topologies", start)
    if start < 0 or end < 0:
        raise ValueError(
            f"{path}: expected Complete service catalog and Deployment topologies headings"
        )
    return [
        match.group(1)
        for line in text[start:end].splitlines()
        if (match := CATALOG_ROW.match(line))
    ]


def duplicates(items: list[str]) -> list[str]:
    return sorted({item for item in items if items.count(item) > 1})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compose", type=Path, default=DEFAULT_COMPOSE)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    args = parser.parse_args()

    try:
        compose = compose_services(args.compose)
        catalog = catalog_services(args.catalog)
    except (OSError, ValueError) as exc:
        print(f"service catalog check failed: {exc}", file=sys.stderr)
        return 1

    missing = sorted(set(compose) - set(catalog))
    extra = sorted(set(catalog) - set(compose))
    duplicate_rows = duplicates(catalog)

    if missing or extra or duplicate_rows or len(compose) != len(catalog):
        print("service catalog drift detected", file=sys.stderr)
        print(f"compose services: {len(compose)}", file=sys.stderr)
        print(f"catalog rows:     {len(catalog)}", file=sys.stderr)
        if missing:
            print(f"missing from catalog: {', '.join(missing)}", file=sys.stderr)
        if extra:
            print(f"not in compose: {', '.join(extra)}", file=sys.stderr)
        if duplicate_rows:
            print(f"duplicate catalog rows: {', '.join(duplicate_rows)}", file=sys.stderr)
        return 1

    print(f"service catalog matches Compose ({len(compose)} services)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
