"""Canonical Compose guards for auth-service license issuance wiring."""

from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def _auth_service() -> dict:
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    return compose["services"]["auth-service"]


def test_auth_license_configuration_is_canonical():
    service = _auth_service()
    environment = service["environment"]

    assert environment["ADMIN_BOOTSTRAP_EMAIL"] == "admin@omnibioai.org"
    assert environment["LICENSE_KEY_PEPPER_FILE"] == "/run/secrets/license_key_pepper"
    assert environment["LICENSE_ALLOWED_VALIDITY_DAYS"] == "30,90,365"
    assert "./.secrets/license_key_pepper:/run/secrets/license_key_pepper:ro" in service["volumes"]


def test_auth_healthcheck_is_canonical():
    healthcheck = _auth_service()["healthcheck"]

    assert healthcheck == {
        "test": [
            "CMD-SHELL",
            "curl -fsS http://127.0.0.1:8001/health >/dev/null || exit 1",
        ],
        "interval": "10s",
        "timeout": "3s",
        "retries": 6,
        "start_period": "30s",
    }
