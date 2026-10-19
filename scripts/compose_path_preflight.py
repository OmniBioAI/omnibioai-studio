#!/usr/bin/env python3
"""Fail closed on unsafe host paths referenced by Compose.

The check is read-only. It never creates bind sources, follows a bind into a
prohibited filesystem, or prints environment values that are not paths.
"""
from __future__ import annotations

import argparse
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any

import yaml


VAR = re.compile(r"(?<!\$)\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?])(.*?))?\}")
PATH_KEYS = ("MACHINE_DIR", "WORK_DIR", "DATA_DIR", "DB_INIT_DIR", "VIDEO_DIR", "WORKSPACE_HOST")
FILE_TARGETS = {"/etc/passwd", "/etc/group"}


class ExpansionError(ValueError):
    """A required Compose variable was unavailable."""


class ProhibitedPathError(ValueError):
    """A path or symlink resolves into prohibited storage."""


def _expand_once(value: str, env: dict[str, str], stack: tuple[str, ...]) -> str:
    def replace(match: re.Match[str]) -> str:
        name, operator, fallback = match.groups()
        present = name in env
        current = env.get(name, "")
        empty = current == ""
        if operator in (":-", "-") and (not present or (operator == ":-" and empty)):
            return expand(fallback or "", env, stack)
        if operator in (":?", "?") and (not present or (operator == ":?" and empty)):
            raise ExpansionError(f"required variable {name} is not set")
        if not present:
            return ""
        if name in stack:
            raise ExpansionError(f"recursive variable reference: {' -> '.join((*stack, name))}")
        return expand(current, env, (*stack, name))

    return VAR.sub(replace, value)


def expand(value: str, env: dict[str, str], stack: tuple[str, ...] = ()) -> str:
    """Expand Compose-style variables recursively without invoking a shell."""
    previous = value
    for _ in range(32):
        result = _expand_once(previous, env, stack)
        if result == previous:
            return result
        previous = result
    raise ExpansionError("variable expansion exceeded 32 passes")


def load_env(path: Path) -> dict[str, str]:
    env = dict(os.environ)
    if not path.is_file():
        return env
    file_values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, value = line.split("=", 1)
        file_values[key.strip()] = value.strip().strip('"\'')
    for key, value in file_values.items():
        env.setdefault(key, value)
    return env


def _inside(path: Path, root: Path) -> bool:
    try:
        return os.path.commonpath((str(path), str(root))) == str(root)
    except ValueError:
        return False


def resolve_safely(path: Path, prohibited_roots: tuple[Path, ...]) -> Path:
    """Resolve symlinks while refusing prohibited targets before traversal."""
    candidate = Path(os.path.abspath(path))
    seen: set[Path] = set()
    for _ in range(40):
        if candidate in seen:
            raise ValueError(f"symlink loop at {candidate}")
        seen.add(candidate)
        if any(_inside(candidate, root) for root in prohibited_roots):
            raise ProhibitedPathError(str(candidate))
        parts = candidate.parts
        current = Path(parts[0])
        replaced = False
        for index, part in enumerate(parts[1:], start=1):
            current /= part
            if any(_inside(current, root) for root in prohibited_roots):
                raise ProhibitedPathError(str(current))
            try:
                mode = current.lstat().st_mode
            except FileNotFoundError:
                return candidate
            if stat.S_ISLNK(mode):
                target = Path(os.readlink(current))
                if not target.is_absolute():
                    target = current.parent / target
                candidate = Path(os.path.abspath(target.joinpath(*parts[index + 1 :])))
                replaced = True
                break
        if not replaced:
            return candidate
    raise ValueError(f"too many symlink levels at {path}")


def expected_type(target: str) -> str | None:
    """Return a strict expected type where Compose intent is unambiguous."""
    target_path = Path(target)
    if target.endswith(".sock") or "docker.sock" in target or "munge.socket" in target:
        return "socket"
    if target.startswith("/usr/bin/"):
        return "executable"
    if target.startswith("/lib/") or target in FILE_TARGETS:
        return "file"
    if target.startswith("/run/secrets/") or target.startswith("/var/spool/cron/"):
        return "file"
    if target_path.name.endswith(".d"):
        return "directory"
    if target_path.suffix or target_path.name.startswith("."):
        return "file"
    if target.startswith("/dev/"):
        return None
    if target in {"/sif", "/app/data"} or target.startswith(("/app/work/", "/workspace/data/")):
        return "directory"
    return None


def check_path(source: str, target: str, expected: str | None, base: Path,
               prohibited_roots: tuple[Path, ...], label: str) -> list[str]:
    source_path = Path(source).expanduser()
    if not source_path.is_absolute():
        source_path = base / source_path
    source_path = Path(os.path.abspath(source_path))
    try:
        resolved = resolve_safely(source_path, prohibited_roots)
    except ProhibitedPathError as exc:
        return [f"{label}: prohibited path target {exc} (source {source_path})"]
    except (OSError, ValueError) as exc:
        return [f"{label}: cannot resolve {source_path}: {exc}"]
    if not resolved.exists():
        return [f"{label}: missing source {source_path} (resolved {resolved})"]
    kind = expected or expected_type(target)
    if kind == "directory" and not resolved.is_dir():
        return [f"{label}: expected directory, found non-directory at {source_path} (resolved {resolved})"]
    if kind == "file" and not resolved.is_file():
        return [f"{label}: expected file, found non-file at {source_path} (resolved {resolved})"]
    if kind == "executable" and (not resolved.is_file() or not os.access(resolved, os.X_OK)):
        return [f"{label}: expected executable file at {source_path} (resolved {resolved})"]
    if kind == "socket" and not stat.S_ISSOCK(resolved.stat().st_mode):
        return [f"{label}: expected socket at {source_path} (resolved {resolved})"]
    return []


def _bind_entries(service: dict[str, Any], env: dict[str, str]) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    for volume in service.get("volumes") or []:
        if isinstance(volume, dict):
            if volume.get("type") != "bind":
                continue
            source, target = volume.get("source"), volume.get("target")
        elif isinstance(volume, str):
            parts = expand(volume, env).split(":")
            if len(parts) < 2:
                continue
            source, target = parts[0], parts[1]
        else:
            continue
        if isinstance(source, str) and isinstance(target, str):
            entries.append((source, target))
    return entries


def validate(compose_files: list[Path], env: dict[str, str],
             prohibited_roots: tuple[Path, ...]) -> list[str]:
    errors: list[str] = []
    for compose in compose_files:
        try:
            document = yaml.safe_load(compose.read_text(encoding="utf-8")) or {}
        except (OSError, yaml.YAMLError) as exc:
            errors.append(f"{compose}: cannot load Compose file: {exc}")
            continue
        for service_name, service in (document.get("services") or {}).items():
            if not isinstance(service, dict):
                continue
            build = service.get("build")
            context = build.get("context") if isinstance(build, dict) else build
            if isinstance(context, str):
                try:
                    context = expand(context, env)
                except ExpansionError as exc:
                    errors.append(f"{compose}:{service_name}:build: {exc}")
                else:
                    errors.extend(check_path(context, "build-context", "directory", compose.parent,
                                             prohibited_roots, f"{compose}:{service_name}:build"))
            try:
                bind_entries = _bind_entries(service, env)
            except ExpansionError as exc:
                errors.append(f"{compose}:{service_name}:volume: {exc}")
                continue
            for source, target in bind_entries:
                try:
                    source = expand(source, env)
                    target = expand(target, env)
                except ExpansionError as exc:
                    errors.append(f"{compose}:{service_name}:volume: {exc}")
                    continue
                if not source or not source.startswith(("/", ".", "~")):
                    continue
                errors.extend(check_path(source, target, None, compose.parent, prohibited_roots,
                                         f"{compose}:{service_name}:{target}"))
    for key in PATH_KEYS:
        if key not in env:
            continue
        try:
            value = expand(env[key], env, (key,))
        except ExpansionError as exc:
            errors.append(f"environment:{key}: {exc}")
            continue
        errors.extend(check_path(value, key, "directory", Path.cwd(), prohibited_roots,
                                 f"environment:{key}"))
    return sorted(set(errors))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("compose", nargs="+", type=Path)
    parser.add_argument("--env-file", type=Path, default=Path(".env"))
    parser.add_argument("--prohibited-root", action="append", default=["/mnt/wdpro26tb"])
    args = parser.parse_args()
    env = load_env(args.env_file)
    prohibited = tuple(Path(os.path.abspath(Path(root).expanduser())) for root in args.prohibited_root)
    errors = validate(args.compose, env, prohibited)
    if errors:
        print("Compose path preflight failed:", file=sys.stderr)
        print("\n".join(f"- {item}" for item in errors), file=sys.stderr)
        return 1
    print("Compose path preflight OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
