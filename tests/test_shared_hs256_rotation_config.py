"""Static guards for the shared HS256 rotation boundary.

These tests inspect source configuration only. They never read the live .env or
container environment values.
"""

from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "docker-compose.yml"

EXPECTED_BINDINGS = {
    "tes": "JWT_SECRET",
    "model-registry": "JWT_SECRET",
    "billing-service": "JWT_SECRET",
    "lims": "JWT_SECRET",
    "rag": "JWT_SECRET",
    "workbench": "JWT_SECRET",
    "control-center": "JWT_SECRET",
    "dev-hub": "JWT_SECRET",
    "workflow-bundles": "JWT_SECRET",
    "auth-service": "SECRET_KEY",
    "interaction-worker": "SECRET_KEY",
    "security-audit": "JWT_SECRET",
    "security-audit-worker": "JWT_SECRET",
    "api-gateway": "JWT_SECRET",
}

REQUIRED_EXPRESSION = "${AUTH_SECRET_KEY:?AUTH_SECRET_KEY must be set}"


def _services():
    return yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]


def test_complete_shared_secret_inventory_is_required_and_consistent():
    services = _services()
    actual = {}
    for service, config in services.items():
        environment = config.get("environment") or {}
        if not isinstance(environment, dict):
            continue
        for key in ("JWT_SECRET", "SECRET_KEY"):
            if environment.get(key) == REQUIRED_EXPRESSION:
                actual[service] = key
    assert actual == EXPECTED_BINDINGS


def test_no_shared_secret_binding_has_a_fallback_or_literal():
    services = _services()
    for service, key in EXPECTED_BINDINGS.items():
        assert services[service]["environment"][key] == REQUIRED_EXPRESSION


def test_devhub_proxy_credential_is_absent_from_global_interpolation():
    service = _services()["dev-hub"]
    environment = service["environment"]
    assert service["profiles"] == ["devhub"]
    assert "DEVHUB_INTERNAL_PROXY_SECRET" not in environment
    assert service["user"] == "10001:10001"
    index_mount = next(v for v in service["volumes"] if v.get("target") == "/app/data/faiss_index")
    assert index_mount["read_only"] is True


def test_release_profiles_keep_devhub_opt_in_and_auth_enabled():
    for filename in ("docker-compose.release.yml", "docker-compose-release.yml"):
        document = yaml.safe_load((ROOT / filename).read_text(encoding="utf-8"))
        service = document["services"]["dev-hub"]
        assert service["profiles"] == ["devhub"]
        assert service["environment"]["AUTH_ENABLED"] == "true"
        assert "DEVHUB_INTERNAL_PROXY_SECRET" not in service["environment"]
        assert service["user"] == "10001:10001"
        mount = next(v for v in service["volumes"] if v.get("target") == "/app/data/faiss_index")
        assert mount["read_only"] is True
        assert "AUTH_SECRET_KEY" in service["environment"]["JWT_SECRET"]


def test_activation_overlay_requires_dedicated_file_backed_proxy_secret():
    overlay = yaml.safe_load((ROOT / "docker-compose.devhub-activation.yml").read_text(encoding="utf-8"))
    service = overlay["services"]["dev-hub"]
    assert service["profiles"] == ["devhub"]
    assert service["secrets"] == ["devhub_internal_proxy_secret"]
    assert overlay["secrets"]["devhub_internal_proxy_secret"]["file"] == (
        "${DEVHUB_INTERNAL_PROXY_SECRET_FILE:?Set DEVHUB_INTERNAL_PROXY_SECRET_FILE to the protected secret file}"
    )
