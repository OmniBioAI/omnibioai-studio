#!/usr/bin/env python3
"""
scripts/deploy_verify.py -- deploy-freshness check (issue #200/#194 pattern:
a container running stale code relative to what's merged/available upstream,
invisible until someone happens to test the exact behavior that changed --
hit 3x in one session: celery-worker rename regression, workbench DAG-count
regression, toolserver's 91-day-stale ghcr.io image).

Runs once, as the `deploy-verify` one-shot service in docker-compose.yml,
wired via `depends_on: deploy-verify: condition: service_completed_successfully`
on every service this check covers -- so it runs automatically on every
`docker compose up` (including `docker compose up -d <one-service>`), with
no new command for anyone to learn or remember. Always exits 0: this is a
loud warning system, not a startup gate -- a hard block would let a broken
upstream CI (see toolserver) take down the entire stack for reasons that
have nothing to do with today's deploy.

Two independent checks, both boiling down to "is this image older than the
thing it's supposed to reflect":

  - build-from-source services (workbench, celery-worker, tes, ...):
    compare the image's own `Created` timestamp against origin/main's
    latest commit timestamp (fetched via one lightweight GitHub REST API
    call -- NOT `git fetch`, no object transfer, just commit metadata).
    Also reads the local repo's `refs/heads/main` ref file directly (plain
    text file, no `git` binary needed) to distinguish "forgot to pull"
    (local ref behind origin) from "forgot to rebuild" (local ref matches
    origin, image just wasn't rebuilt after).

  - pull-from-registry services (toolserver, ...): no source repo to
    compare against by definition -- that's the actual gap. Falls back to
    an age threshold: stale if the image is older than `max_age_days`.
    Same age-threshold also used as build-type's fallback when the GitHub
    API call fails (rate limit, network, token issue) -- never crashes,
    never blocks, degrades to "best information available."

Per-service `max_age_days` override: a `deploy-verify.max-age-days` label
in that service's docker-compose.yml `labels:` block (default 14 if
absent). Read directly from the raw compose YAML, not docker-compose's own
resolved config -- this container doesn't have the `docker compose` CLI
available, just the Docker socket.

Output goes to BOTH stdout (visible in `docker compose up`'s own combined
output / `docker compose logs deploy-verify`) AND STALE_SERVICES.txt at
this repo's root (overwritten every run) -- redundant channels so a
staleness finding is harder to scroll past.
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import docker
import requests
import yaml

COMPOSE_FILE = Path("/workspace-config/docker-compose.yml")
ENV_FILE = Path("/workspace-config/.env")
OUT_FILE = Path("/workspace-config/STALE_SERVICES.txt")
REPOS_ROOT = Path("/repos")  # each covered repo's .git mounted read-only under here, see docker-compose.yml

DEFAULT_MAX_AGE_DAYS = 14
GITHUB_API = "https://api.github.com"

# Services this check covers today -- the ones actually hit this session,
# plus their .git mount name under /repos. Deliberately a short, explicit
# list rather than trying to auto-derive "source repo" for every one of
# the ~30 services in this compose file (several build from a shared
# multi-repo context where that inference gets ambiguous) -- extending
# coverage to more services is a straightforward follow-up once this is
# validated, not a blocker for v1.
COVERED_SERVICES = {
    "workbench":      {"type": "build", "repo_mount": "omnibioai"},
    "celery-worker":  {"type": "build", "repo_mount": "omnibioai"},
    "tes":            {"type": "build", "repo_mount": "omnibioai-tes"},
    "toolserver":     {"type": "pull"},
}


def log(msg: str) -> None:
    print(msg, flush=True)


def load_env_file(path: Path) -> dict:
    env = dict(os.environ)
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env.setdefault(k.strip(), v.strip())
    return env


_VAR_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(:-(.*?))?\}")


def resolve_vars(value: str, env: dict) -> str:
    """Minimal ${VAR:-default} / ${VAR} resolution -- not full Compose
    interpolation, just enough for the handful of fields this script reads
    (image, labels)."""
    if not isinstance(value, str):
        return value

    def _sub(m: re.Match) -> str:
        name, _, default = m.groups()
        return env.get(name, default or "")

    return _VAR_RE.sub(_sub, value)


def max_age_days_for(service_cfg: dict, env: dict) -> int:
    labels = service_cfg.get("labels") or []
    pairs = []
    if isinstance(labels, dict):
        pairs = list(labels.items())
    elif isinstance(labels, list):
        for entry in labels:
            if "=" in entry:
                k, v = entry.split("=", 1)
                pairs.append((k, v))
    for k, v in pairs:
        if k.strip() == "deploy-verify.max-age-days":
            try:
                return int(resolve_vars(str(v), env))
            except ValueError:
                pass
    return DEFAULT_MAX_AGE_DAYS


def image_created(client: "docker.DockerClient", image_ref: str):
    """Returns (found: bool, created: datetime|None)."""
    try:
        img = client.images.get(image_ref)
    except docker.errors.ImageNotFound:
        return False, None
    created_str = img.attrs.get("Created", "")
    try:
        # Python 3.11+'s fromisoformat handles 'Z' and any fractional-second
        # precision natively (Docker's own precision varies) -- no manual
        # normalization needed.
        return True, datetime.fromisoformat(created_str)
    except ValueError:
        return True, None


def local_main_sha(repo_mount: str) -> str | None:
    """Reads refs/heads/main directly -- plain-text file, no `git` binary
    needed. Falls back to packed-refs if main was ever packed and no loose
    ref file exists. Deliberately reads refs/heads/main specifically, not
    HEAD -- HEAD may point at whatever branch happens to be checked out
    locally (a feature branch mid-work), which is not what "is this image
    stale relative to main" should be asking."""
    root = REPOS_ROOT / repo_mount
    loose = root / "refs" / "heads" / "main"
    if loose.exists():
        return loose.read_text().strip()
    packed = root / "packed-refs"
    if packed.exists():
        for line in packed.read_text().splitlines():
            if line.endswith("refs/heads/main"):
                return line.split()[0]
    return None


def remote_url_to_owner_repo(repo_mount: str) -> tuple[str, str] | None:
    config = REPOS_ROOT / repo_mount / "config"
    if not config.exists():
        return None
    text = config.read_text()
    m = re.search(r"url\s*=\s*.*[:/]([\w.-]+)/([\w.-]+?)(\.git)?\s*$", text, re.MULTILINE)
    if not m:
        return None
    return m.group(1), m.group(2)


def github_main_commit(owner: str, repo: str, token: str):
    """Single lightweight REST call for origin/main's tip -- not `git
    fetch`: no object transfer, just commit metadata (sha + date). Returns
    (sha, committed_at: datetime) or (None, None) on any failure -- never
    raises, caller falls back to the age-threshold check."""
    try:
        r = requests.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/commits/main",
            headers={"Authorization": f"Bearer {token}"} if token else {},
            timeout=10,
        )
        if r.status_code != 200:
            return None, None
        body = r.json()
        sha = body.get("sha")
        date_str = body.get("commit", {}).get("committer", {}).get("date")
        committed_at = datetime.fromisoformat(date_str) if date_str else None
        return sha, committed_at
    except Exception:
        return None, None


def check_build_service(name: str, cfg: dict, client, env: dict, token: str, lines: list[str]) -> bool:
    """Returns True if OK, False if stale (or undetermined -- treated as
    non-fatal but reported)."""
    repo_mount = cfg["repo_mount"]
    raw_image = cfg.get("_raw", {}).get("image")
    if raw_image:
        # Explicit `image:` override on an otherwise build-from-source
        # service (e.g. tes's `image: omnibioai-tes-local`) -- use it
        # instead of assuming Compose's auto-derived <project>-<service>
        # tag, which only applies when no explicit image is set.
        image_ref = resolve_vars(raw_image, env)
        if ":" not in image_ref.split("/")[-1]:
            image_ref += ":latest"
    else:
        project = env.get("COMPOSE_PROJECT_NAME", "omnibioai-studio")
        image_ref = f"{project}-{name}:latest"
    found, created = image_created(client, image_ref)
    if not found:
        lines.append(f"[SKIP]   {name:16s} image {image_ref} not built yet -- nothing to compare")
        return True

    local_sha = local_main_sha(repo_mount)
    owner_repo = remote_url_to_owner_repo(repo_mount)
    remote_sha, remote_date = (None, None)
    if owner_repo:
        remote_sha, remote_date = github_main_commit(*owner_repo, token)

    if remote_date is not None and created is not None:
        if created >= remote_date:
            lines.append(f"[OK]     {name:16s} image built {created.isoformat()}, matches {repo_mount}@main HEAD ({remote_date.isoformat()})")
            return True
        behind_pull = local_sha is not None and remote_sha is not None and local_sha != remote_sha
        reason = "pull AND rebuild needed (local checkout is also behind origin/main)" if behind_pull else "rebuild needed (local checkout matches origin/main; image predates it)"
        lines.append(
            f"[STALE]  {name:16s} image built {created.isoformat()}; "
            f"{repo_mount}@origin/main HEAD is {remote_date.isoformat()} ({(remote_date - created).days}d newer) -- {reason}"
        )
        return False

    # GitHub API unreachable -- fall back to age threshold, degrade
    # gracefully rather than skip the check entirely.
    max_age = max_age_days_for(cfg.get("_raw", {}), env)
    if created is None:
        lines.append(f"[SKIP]   {name:16s} could not read image build time or reach GitHub API -- no signal available")
        return True
    age_days = (datetime.now(timezone.utc) - created).days
    if age_days > max_age:
        lines.append(f"[STALE?] {name:16s} image is {age_days}d old (threshold {max_age}d) -- GitHub API unreachable, falling back to age check only")
        return False
    lines.append(f"[OK]     {name:16s} image is {age_days}d old, within {max_age}d fallback threshold (GitHub API unreachable, could not compare to origin/main)")
    return True


def check_pull_service(name: str, cfg: dict, client, env: dict, raw_svc: dict, lines: list[str]) -> bool:
    image_ref = resolve_vars(raw_svc.get("image", ""), env)
    if not image_ref:
        lines.append(f"[SKIP]   {name:16s} no resolvable image reference")
        return True
    found, created = image_created(client, image_ref)
    if not found or created is None:
        lines.append(f"[SKIP]   {name:16s} image {image_ref} not pulled yet -- nothing to compare")
        return True
    max_age = max_age_days_for(raw_svc, env)
    age_days = (datetime.now(timezone.utc) - created).days
    if age_days > max_age:
        lines.append(f"[STALE]  {name:16s} image created {created.isoformat()} ({age_days}d old, threshold {max_age}d) -- registry may have stopped publishing, see #200")
        return False
    lines.append(f"[OK]     {name:16s} image created {created.isoformat()} ({age_days}d old), within {max_age}d threshold")
    return True


def main() -> int:
    env = load_env_file(ENV_FILE)
    token = env.get("GHCR_PULL_TOKEN", "")

    raw_compose = {}
    if COMPOSE_FILE.exists():
        raw_compose = yaml.safe_load(COMPOSE_FILE.read_text()) or {}
    raw_services = raw_compose.get("services", {})

    client = docker.from_env()

    lines = ["==================== DEPLOY FRESHNESS CHECK ===================="]
    any_stale = False

    for name, cfg in COVERED_SERVICES.items():
        raw_svc = raw_services.get(name, {})
        if cfg["type"] == "build":
            cfg = {**cfg, "_raw": raw_svc}
            ok = check_build_service(name, cfg, client, env, token, lines)
        else:
            ok = check_pull_service(name, cfg, client, env, raw_svc, lines)
        any_stale = any_stale or not ok

    lines.append("===================================================================")
    if any_stale:
        lines.append("One or more services are stale -- see above. This check never blocks")
        lines.append("startup; treat this as a loud reminder, not a gate.")
    else:
        lines.append("All covered services fresh.")

    output = "\n".join(lines)
    log(output)
    OUT_FILE.write_text(output + "\n")

    return 0  # always -- see module docstring


if __name__ == "__main__":
    sys.exit(main())
