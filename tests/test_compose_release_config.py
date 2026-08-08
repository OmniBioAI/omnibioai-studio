"""SSO Phase 2 PR1/PR2: static regression test for the release compose files'
JWT secret wiring across every current JWT consumer.

Purely static (no live services, no docker) -- catches a repeat of the bugs
these PRs fixed: a consuming service's local JWT-decode dependency falling
back to a public default secret ("change-me") whenever its JWT_SECRET env
var isn't set in this compose file, silently accepting forged tokens
instead of failing loudly. PR1 fixed control-center; PR2 audited every
other JWT consumer and found + fixed the identical gap in security-audit.

PR F (v0.7.0 release stabilization): this originally checked only
docker-compose-release.yml (dash), but electron-builder.json/electron/main.js
actually bundle docker-compose.release.yml (dot) into every packaged desktop
installer -- the dash file was fixed by PR1/PR2 while the dot file silently
kept shipping the unfixed gap. Now parametrized over both files so neither
can drift out of sync with the other again.
"""
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
COMPOSE_PATHS = [
    REPO_ROOT / "docker-compose-release.yml",
    REPO_ROOT / "docker-compose.release.yml",  # the file actually shipped by electron-builder
]

# Every current JWT consumer in these compose files, and the environment key
# each one reads its secret under (auth-service signs with SECRET_KEY;
# every consuming service verifies with JWT_SECRET). Add new JWT consumers
# here as they're introduced -- test_all_consumers_share_the_same_secret
# below then covers them automatically, no separate assertion needed.
EXPECTED_SECRET_WIRING = {
    "auth-service": "SECRET_KEY",
    "api-gateway": "JWT_SECRET",
    "control-center": "JWT_SECRET",
    "security-audit": "JWT_SECRET",
}


@pytest.fixture(scope="module", params=COMPOSE_PATHS, ids=lambda p: p.name)
def compose_config(request):
    with open(request.param) as f:
        return yaml.safe_load(f)


@pytest.mark.parametrize("service,env_key", EXPECTED_SECRET_WIRING.items())
def test_service_receives_shared_auth_secret(compose_config, service, env_key):
    env = compose_config["services"][service]["environment"]
    assert env_key in env, (
        f"{service} must receive {env_key} -- without it, this service's "
        f"JWT validation silently falls back to a public default secret"
    )
    assert "AUTH_SECRET_KEY" in env[env_key], (
        f"{service}'s {env_key} must be sourced from AUTH_SECRET_KEY (the "
        f"same secret auth-service signs with), not a different or "
        f"hardcoded value"
    )


def test_all_consumers_share_the_same_secret(compose_config):
    """Every JWT consumer's secret expression must resolve identically at
    runtime -- same env var name inside the same ${VAR:-default}
    expression -- not just superficially similar strings. Iterates
    EXPECTED_SECRET_WIRING rather than naming services individually, so a
    future JWT consumer added to that dict is covered automatically."""
    services = compose_config["services"]
    exprs = {
        service: services[service]["environment"][env_key]
        for service, env_key in EXPECTED_SECRET_WIRING.items()
    }

    distinct = set(exprs.values())
    assert len(distinct) == 1, f"secret expressions diverge: {exprs}"
