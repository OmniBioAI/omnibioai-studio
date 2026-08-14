"""HIPAA infrastructure-exposure hardening: static regression tests for the
release compose files' network boundary and required-credential handling.

Purely static (no live services, no docker daemon) -- parses the compose
YAML directly, same approach as test_compose_release_config.py alongside it.

Guards the three things this workstream fixed, each of which was a silent
High-severity exposure in the shipped release configuration:

1. mysql published "3306:3306" and redis published "6380:6379" with no host
   IP binding at all, i.e. 0.0.0.0 -- reachable from anywhere routable to
   the host, bypassing the API Gateway, every service's IAM/authorization
   layer, and all organization-isolation enforcement, straight to raw
   tenant data. DEPLOYMENT.md's own port table already described MySQL as
   "internal only -- not exposed externally in prod"; the compose file just
   never implemented that.

2. Every credential fell back to a public, committed-to-the-repo literal
   (${MYSQL_ROOT_PASSWORD:-omnibioai}, ${AUTH_SECRET_KEY:-change-me-in-production},
   ...), so a deployment that simply didn't set them came up fully
   functional with guessable production credentials rather than failing.
   Combined with (1), root MySQL was reachable at a known password.

3. celery-worker never received GATEWAY_URL in the release files (only in
   the dev docker-compose.yml), so the packaged build's #196 gateway
   routing silently never took effect.

Development access to mysql/redis is preserved through an explicit,
separate overlay file rather than by weakening the release default -- see
SECURITY-COMPOSE-HARDENING.md.
"""
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent

# The file electron-builder/electron actually bundle into packaged
# installers, plus the dash-named legacy file kept in parity with it. Both
# are release/production configurations and must hold the same boundary.
RELEASE_COMPOSE_PATHS = [
    REPO_ROOT / "docker-compose.release.yml",
    REPO_ROOT / "docker-compose-release.yml",
]

DEV_PORTS_OVERLAY = REPO_ROOT / "docker-compose.release.dev-ports.yml"
DEV_COMPOSE = REPO_ROOT / "docker-compose.yml"

# Datastores that must never be published to the host by a release config.
# Both hold multi-tenant data directly and neither sits behind the API
# Gateway -- reaching them at all is reaching them past every authorization
# control the platform has.
NON_PUBLISHABLE_SERVICES = ["mysql", "redis"]

# Credentials that must be operator-provided in a release deployment, with
# no fallback. Value is the historical weak literal each used to default to
# -- asserted absent so a future edit can't quietly reinstate one.
REQUIRED_SECRETS = {
    "MYSQL_ROOT_PASSWORD": "omnibioai",
    "AUTH_SECRET_KEY": "change-me-in-production",
    "LICENSE_SECRET": "omnibioai-secret-change-in-production",
    "GF_ADMIN_PASSWORD": "omnibioai",
    "LIMSX_DJANGO_SECRET_KEY": "omnibioai-studio-secret",
    "JUPYTER_TOKEN": "omnibioai",
    "RSTUDIO_PASSWORD": "omnibioai",
    "VSCODE_PASSWORD": "omnibioai",
}


def _load(path):
    with open(path) as f:
        return yaml.safe_load(f)


def _config_only(path):
    """File text with comment lines stripped. These files carry long
    explanatory comments that legitimately quote the very weak-default
    expressions being asserted against (documenting what was removed and
    why), so substring checks must look at actual configuration, not prose."""
    return "\n".join(
        line
        for line in path.read_text().splitlines()
        if not line.lstrip().startswith("#")
    )


@pytest.fixture(
    scope="module", params=RELEASE_COMPOSE_PATHS, ids=lambda p: p.name
)
def release_compose(request):
    return _load(request.param)


@pytest.fixture(
    scope="module", params=RELEASE_COMPOSE_PATHS, ids=lambda p: p.name
)
def release_compose_text(request):
    return _config_only(request.param)


# ── 1. Network exposure ──────────────────────────────────────────────────


@pytest.mark.parametrize("service", NON_PUBLISHABLE_SERVICES)
def test_datastore_not_published_to_host(release_compose, service):
    """No `ports:` on mysql/redis at all in a release config. Containers on
    the compose network still reach them by service name -- publishing is
    purely about host/external reachability."""
    svc = release_compose["services"][service]
    published = svc.get("ports")
    assert not published, (
        f"{service} must not publish ports in the release configuration -- "
        f"found {published}. This exposes a multi-tenant datastore directly "
        f"to the host/network, bypassing the API Gateway and every "
        f"application-layer authorization and org-isolation control. Need "
        f"local access? Use docker-compose.release.dev-ports.yml explicitly."
    )


@pytest.mark.parametrize("service", NON_PUBLISHABLE_SERVICES)
def test_datastore_still_reachable_internally(release_compose, service):
    """Hardening must not have removed the service itself -- the internal
    Docker-network path every consumer depends on has to stay intact."""
    assert service in release_compose["services"], (
        f"{service} must still exist as a service -- removing host port "
        f"publication must not remove internal network reachability"
    )


def test_control_center_is_loopback_bound_in_release_configs(release_compose):
    """control-center is documented (SECURITY-COMPOSE-HARDENING.md SS7 item 1,
    docker-compose.yml's own inline comment) as loopback-only -- unlike the
    other backend services that legitimately publish on
    ${HOST_IP:-0.0.0.0} and enforce their own IAM authorization, nginx-router
    is meant to be control-center's only externally-reachable path
    (/_svc/control, JWT-gated via auth_request). Both release files had
    drifted to ${HOST_IP:-0.0.0.0} while docker-compose.yml (dev) already
    used 127.0.0.1 -- this pins the documented/intended binding so it can't
    silently drift back. control-center's own /docker, /services, /summary,
    /config routes are independently gated by
    require_permission('platform.manage_infra') regardless of this binding
    (see omnibioai-control-center's main.py), so this is defense-in-depth
    restoring the documented design, not the closure of a live
    authentication bypass."""
    svc = release_compose["services"]["control-center"]
    published = svc.get("ports") or []
    assert published, "control-center must still publish its port to the host"
    for mapping in published:
        assert str(mapping).startswith("127.0.0.1:"), (
            f"control-center must be loopback-bound (127.0.0.1), not host-IP "
            f"configurable -- found {mapping!r}. It is documented and "
            f"intended to be reachable only via nginx-router's JWT-gated "
            f"/_svc/control route, matching docker-compose.yml's (dev) own "
            f"binding."
        )


def test_dev_compose_control_center_still_loopback_bound():
    """The dev compose file is the documented source of truth this fix
    restores parity with -- pin it too, so a future edit can't quietly
    loosen the dev file while leaving the release files matching it (or
    vice versa)."""
    dev = _load(DEV_COMPOSE)
    published = dev["services"]["control-center"].get("ports") or []
    assert published, "control-center must still publish its port to the host in the dev stack"
    for mapping in published:
        assert str(mapping).startswith("127.0.0.1:"), (
            f"docker-compose.yml's control-center binding is the documented "
            f"source of truth the release files were just brought into "
            f"parity with -- found {mapping!r}, expected 127.0.0.1:*"
        )


def test_consumers_still_point_at_internal_datastore_hostnames(release_compose):
    """Backend services must still address mysql/redis by their internal
    compose service names. A regression here (e.g. someone 'fixing' a
    connection error by pointing at localhost/host.docker.internal) would
    break the very boundary this suite protects."""
    services = release_compose["services"]

    db_consumers = [
        name
        for name, svc in services.items()
        if "DB_HOST" in (svc.get("environment") or {})
    ]
    assert db_consumers, "expected at least one DB_HOST consumer"

    for name in db_consumers:
        assert services[name]["environment"]["DB_HOST"] == "mysql", (
            f"{name} must reach the database over the internal Docker "
            f"network as 'mysql', not via a host-published port"
        )


# ── 2. Credentials ───────────────────────────────────────────────────────


@pytest.mark.parametrize("var,weak_default", REQUIRED_SECRETS.items())
def test_no_weak_credential_defaults(release_compose_text, var, weak_default):
    """`${VAR:-weak}` must not appear for any required secret."""
    assert f"${{{var}:-{weak_default}}}" not in release_compose_text, (
        f"{var} must not fall back to the public literal '{weak_default}' -- "
        f"a deployment that doesn't set it would come up fully functional "
        f"with a credential that is committed to this repository"
    )
    # Catch a *different* hardcoded fallback being substituted too.
    assert f"${{{var}:-" not in release_compose_text, (
        f"{var} must have no default at all in a release configuration -- "
        f"use ${{{var}:?...}} so a missing value fails closed"
    )


@pytest.mark.parametrize("var", REQUIRED_SECRETS)
def test_required_secrets_fail_closed(release_compose_text, var):
    """Every required secret must use compose's `:?` required-variable form,
    so `docker compose up`/`config` errors out rather than starting with a
    silently-missing or guessable credential."""
    assert f"${{{var}:?" in release_compose_text, (
        f"{var} must use the ${{{var}:?message}} required-variable form so "
        f"a deployment missing it fails closed instead of silently "
        f"provisioning a weak or empty credential"
    )


def test_no_literal_weak_credentials_anywhere(release_compose_text):
    """Belt-and-braces: none of the classic weak credential pairs should
    appear as literal values anywhere in a release compose file."""
    for bad in ("root:root@", "admin:admin", "mysql:mysql", ":-admin-secret"):
        assert bad not in release_compose_text, (
            f"weak credential literal {bad!r} present in release config"
        )


# ── 3. Gateway-first routing ─────────────────────────────────────────────


def test_celery_worker_receives_gateway_url(release_compose):
    """#196's gateway-routed call sites read GATEWAY_URL exclusively. It was
    wired into the dev compose but missing from both release files, so the
    packaged build never actually got that fix."""
    env = release_compose["services"]["celery-worker"]["environment"]
    assert env.get("GATEWAY_URL") == "http://api-gateway:8080", (
        "celery-worker must receive GATEWAY_URL so #196's gateway-routed "
        "call sites reach the gateway in packaged/release builds, not only "
        "in the dev compose stack"
    )


def test_gateway_is_addressed_internally(release_compose):
    """Services reach the gateway over the private Docker network. The
    gateway is the externally-published entry point; its *clients* inside
    the compose network address it by service name."""
    services = release_compose["services"]
    for name, svc in services.items():
        gateway_url = (svc.get("environment") or {}).get("GATEWAY_URL")
        if gateway_url:
            assert gateway_url == "http://api-gateway:8080", (
                f"{name}'s GATEWAY_URL must address the gateway by its "
                f"internal service name, got {gateway_url!r}"
            )


def test_api_gateway_remains_published(release_compose):
    """The gateway is the intended zero-trust entry point -- it must stay
    reachable. This guards against over-correcting the exposure fix by
    unpublishing the one service that is supposed to be published."""
    ports = release_compose["services"]["api-gateway"].get("ports")
    assert ports, (
        "api-gateway must remain published -- it is the intended external "
        "entry point that the unpublished backends sit behind"
    )


# ── 4. Development override ──────────────────────────────────────────────


def test_dev_ports_overlay_exists():
    assert DEV_PORTS_OVERLAY.exists(), (
        "an explicit development-only overlay must exist so local datastore "
        "access is achievable without weakening the release default"
    )


@pytest.mark.parametrize("service", NON_PUBLISHABLE_SERVICES)
def test_dev_overlay_restores_local_access(service):
    """The documented dev workflow must actually work -- the overlay has to
    republish both datastores, or developers will just edit the release file
    instead, which is exactly the failure mode this design prevents."""
    overlay = _load(DEV_PORTS_OVERLAY)
    ports = overlay["services"][service].get("ports")
    assert ports, f"dev overlay must republish {service} for local access"


@pytest.mark.parametrize("service", NON_PUBLISHABLE_SERVICES)
def test_dev_overlay_binds_loopback_by_default(service):
    """Even the dev exception defaults to 127.0.0.1, not 0.0.0.0 -- a
    developer enabling local access shouldn't thereby expose a datastore to
    their whole LAN."""
    overlay = _load(DEV_PORTS_OVERLAY)
    for mapping in overlay["services"][service]["ports"]:
        assert str(mapping).startswith("${"), (
            f"{service} dev port mapping should bind through an overridable "
            f"host-IP variable, got {mapping!r}"
        )
        assert "127.0.0.1" in str(mapping), (
            f"{service} dev port mapping must default to loopback "
            f"(127.0.0.1), got {mapping!r}"
        )


def test_dev_overlay_is_not_bundled_into_packaged_app():
    """The overlay must never ship inside an installer -- if it did, the
    'development-only' boundary would be meaningless."""
    builder_config = (REPO_ROOT / "electron-builder.json").read_text()
    assert DEV_PORTS_OVERLAY.name not in builder_config, (
        f"{DEV_PORTS_OVERLAY.name} must not be bundled by electron-builder "
        f"-- it is a development-only override"
    )


def test_dev_overlay_not_referenced_by_production_startup_paths():
    """Neither the Electron main process nor start.sh may reach for the
    overlay, or the dev exception would silently become the default path."""
    for path in (REPO_ROOT / "electron" / "main.js", REPO_ROOT / "scripts" / "start.sh"):
        assert DEV_PORTS_OVERLAY.name not in path.read_text(), (
            f"{path.name} must not reference the dev-only ports overlay"
        )


# ── 5. Dev compose is deliberately unchanged ─────────────────────────────


def test_dev_compose_still_publishes_for_local_development():
    """docker-compose.yml is the local development stack (loaded only when
    the Electron app is unpackaged). It legitimately publishes datastores
    for local tooling, and this workstream deliberately does not change
    that -- the finding is about the release/default configuration. This
    test pins that intent so the two files' roles stay distinguishable."""
    dev = _load(DEV_COMPOSE)
    assert dev["services"]["mysql"].get("ports"), (
        "docker-compose.yml is the development stack and is expected to "
        "publish mysql locally -- if this is being changed, the release "
        "boundary tests above are the ones that matter, not this file"
    )
