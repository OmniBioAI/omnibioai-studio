"""HIPAA follow-up to the SECURITY-COMPOSE-HARDENING.md exposure work: static
regression test pinning `lims`'s DJANGO_DEBUG value across every release
compose configuration.

Purely static (no live services, no docker daemon) -- same approach as
test_compose_release_config.py and test_compose_network_exposure.py
alongside it.

Background: `omnibioai-lims/lab_data_manager/settings.py` reads
`DJANGO_DEBUG` directly via django-environ with no override anywhere in the
image (Dockerfile's persistent ENV layer deliberately omits it; only a
build-time `RUN DJANGO_DEBUG=true ... collectstatic` step sets it, which does
not affect the runtime container) -- whatever the compose environment sets
is exactly what Django runs with. `DEBUG=True` disables the
FIELD_ENCRYPTION_KEY requirement, flips CORS_ALLOW_ALL_ORIGINS on, and
enables Django's traceback/debug pages.

`docker-compose.release.yml` (the file electron-builder actually bundles
into packaged installers) already fixed this for `lims` in 951ad25 --
DJANGO_DEBUG: "false" plus FIELD_ENCRYPTION_KEY wired from
LIMSX_FIELD_ENCRYPTION_KEY. `docker-compose-release.yml` (dash), documented
in SECURITY-COMPOSE-HARDENING.md SS6 as "kept in parity" with the dot file
despite not being the shipped artifact, was missed by that commit and still
shipped DJANGO_DEBUG: "true" with FIELD_ENCRYPTION_KEY entirely absent. This
suite pins both files so that specific drift can't silently reappear --
mirroring test_compose_release_config.py's approach to the JWT-secret drift
between the same two files.
"""
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent

# Both are release/production configurations and must run lims identically
# with respect to DEBUG -- see test_compose_release_config.py and
# test_compose_network_exposure.py for the same pairing on other concerns.
RELEASE_COMPOSE_PATHS = [
    REPO_ROOT / "docker-compose.release.yml",
    REPO_ROOT / "docker-compose-release.yml",
]

DEV_COMPOSE = REPO_ROOT / "docker-compose.yml"


def _load(path):
    with open(path) as f:
        return yaml.safe_load(f)


@pytest.fixture(scope="module", params=RELEASE_COMPOSE_PATHS, ids=lambda p: p.name)
def release_compose(request):
    return _load(request.param)


def test_lims_debug_is_false_in_release_configs(release_compose):
    """lab_data_manager/settings.py consumes DJANGO_DEBUG straight from the
    environment with no override -- this compose value *is* the runtime
    Django DEBUG value. A release/production configuration must never ship
    DEBUG enabled: it discloses tracebacks, local variables, and settings,
    and flips CORS_ALLOW_ALL_ORIGINS on."""
    env = release_compose["services"]["lims"]["environment"]
    assert env.get("DJANGO_DEBUG") == "false", (
        f"lims's DJANGO_DEBUG must be \"false\" in a release configuration -- "
        f"got {env.get('DJANGO_DEBUG')!r}. settings.py reads this value "
        f"directly with no override, so this is the actual runtime Django "
        f"DEBUG setting, not a cosmetic flag."
    )


def test_lims_field_encryption_key_wired_in_release_configs(release_compose):
    """settings.py raises RuntimeError('FIELD_ENCRYPTION_KEY must be set in
    non-debug environments') as soon as DEBUG=False and this is unset --
    required for DJANGO_DEBUG: "false" above to actually boot rather than
    crash-loop, and for encrypted-at-rest fields to use a real key rather
    than none at all."""
    env = release_compose["services"]["lims"]["environment"]
    assert "FIELD_ENCRYPTION_KEY" in env, (
        "lims must receive FIELD_ENCRYPTION_KEY in a release configuration "
        "-- without it, DEBUG=False crash-loops the container at startup "
        "(settings.py's fail-fast guard), and DEBUG=True would silently run "
        "with no encryption key for encrypted-at-rest fields"
    )
    assert "LIMSX_FIELD_ENCRYPTION_KEY" in env["FIELD_ENCRYPTION_KEY"], (
        f"lims's FIELD_ENCRYPTION_KEY must be sourced from "
        f"LIMSX_FIELD_ENCRYPTION_KEY (the same convention "
        f"DJANGO_SECRET_KEY/LIMSX_DJANGO_SECRET_KEY already use), got "
        f"{env['FIELD_ENCRYPTION_KEY']!r}"
    )


def test_dev_compose_lims_debug_still_false():
    """docker-compose.yml already got this fix in 951ad25 and is the
    parity source of truth the release files are pinned against here --
    guard it too so a future edit can't quietly loosen the dev file while
    leaving the release files matching it, or vice versa."""
    dev = _load(DEV_COMPOSE)
    env = dev["services"]["lims"]["environment"]
    assert env.get("DJANGO_DEBUG") == "false", (
        f"docker-compose.yml's lims DJANGO_DEBUG is the documented source "
        f"of truth the release files are pinned against -- got "
        f"{env.get('DJANGO_DEBUG')!r}, expected \"false\""
    )
