#!/usr/bin/env python3
"""Fail-closed validation of host paths referenced by Compose."""
from __future__ import annotations
import argparse, os, re, sys
from pathlib import Path

VAR = re.compile(r"\$\{([A-Z0-9_]+)(?::[^}]*)?\}")

def expand(value: str, env: dict[str, str]) -> str:
    return VAR.sub(lambda m: env.get(m.group(1), ""), value)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("compose", nargs="+", type=Path)
    ap.add_argument("--env-file", type=Path, default=Path(".env"))
    args = ap.parse_args()
    env = dict(os.environ)
    if args.env_file.is_file():
        for line in args.env_file.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                k, v = line.split("=", 1); env.setdefault(k.strip(), v.strip().strip('"\''))
    missing = []
    for compose in args.compose:
        text = compose.read_text()
        for raw in text.splitlines():
            line = raw.strip()
            if line.startswith("context:"):
                context = line.split(":", 1)[1].strip().strip('"\'')
                context = expand(context, env)
                context_path = Path(context).expanduser()
                if not context_path.is_absolute():
                    context_path = compose.parent / context_path
                if context:
                    try:
                        present = context_path.exists()
                    except OSError as exc:
                        missing.append(f"{compose}:build-context={context_path} (unreadable: {exc})")
                        present = True
                    if not present:
                        missing.append(f"{compose}:build-context={context_path}")
                continue
            if not line.startswith("-") or ":/" not in line:
                continue
            source = line[1:].strip().split(":", 1)[0].strip('"\'')
            source = expand(source, env)
            if source.startswith("${") or not source or source.startswith("/") is False and source.startswith(".") is False:
                continue
            source_path = Path(source).expanduser()
            if not source_path.is_absolute():
                source_path = compose.parent / source_path
            try:
                present = source_path.exists()
            except OSError as exc:
                missing.append(f"{compose}:{source_path} (unreadable: {exc})")
                present = True
            if not present:
                missing.append(f"{compose}:{source_path}")
        for key in ("MACHINE_DIR", "WORK_DIR", "DATA_DIR", "DB_INIT_DIR", "VIDEO_DIR", "WORKSPACE_HOST"):
            value = env.get(key)
            if value and not Path(value).expanduser().exists():
                missing.append(f"{compose}:{key}={value}")
    if missing:
        print("Compose preflight failed; missing required host paths:", file=sys.stderr)
        print("\n".join(f"- {item}" for item in sorted(set(missing))), file=sys.stderr)
        return 1
    print("Compose path preflight OK")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
