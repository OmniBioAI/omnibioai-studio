"""Workbench#790: Workbench must not be served by Django's runserver.

Static checks of the dev/live compose files (no docker needed): workbench
runs the image's gunicorn start script, both Workbench containers have
healthchecks, and workbench gets more stop time than gunicorn's graceful
timeout.

The release compose files (docker-compose.release.yml / -release.yml) still
run runserver on purpose: they pull the published omnibioai-app image, which
doesn't have docker/workbench/serve.sh until a new image is published.
"""
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVE = "/app/docker/workbench/serve.sh"
GUNICORN_GRACEFUL_TIMEOUT_S = 30  # omnibioai/server/gunicorn_conf.py default


def _services(name):
    return yaml.safe_load((REPO_ROOT / name).read_text())["services"]


def _command_text(service):
    command = service.get("command", "")
    return " ".join(command) if isinstance(command, list) else command


def _seconds(value):
    value = str(value)
    if value.endswith("m"):
        return int(value[:-1]) * 60
    return int(value.rstrip("s"))


def test_workbench_runs_gunicorn_not_runserver():
    for name in ("docker-compose.yml", "docker-compose.override.yml"):
        command = _command_text(_services(name)["workbench"])
        assert "runserver" not in command, name
        assert SERVE in command, name


def test_live_override_does_not_migrate_on_start():
    command = _command_text(_services("docker-compose.override.yml")["workbench"])
    assert "migrate" not in command


def test_workbench_healthcheck_hits_health_endpoint():
    service = _services("docker-compose.yml")["workbench"]
    test = " ".join(service["healthcheck"]["test"])
    assert "http://127.0.0.1:8000/health/" in test
    assert "-f" in test  # curl must fail on HTTP errors


def test_workbench_stop_grace_exceeds_gunicorn_graceful_timeout():
    service = _services("docker-compose.yml")["workbench"]
    assert _seconds(service["stop_grace_period"]) > GUNICORN_GRACEFUL_TIMEOUT_S


def test_celery_worker_healthcheck_pings_its_own_node():
    service = _services("docker-compose.yml")["celery-worker"]
    test = " ".join(service["healthcheck"]["test"])
    assert "inspect ping" in test
    # $$ is Compose's escape for a literal $, so the shell sees $HOSTNAME.
    assert "-d celery@$$HOSTNAME" in test


def test_override_does_not_drop_the_healthchecks():
    override = _services("docker-compose.override.yml")
    for name in ("workbench", "celery-worker"):
        assert "healthcheck" not in override.get(name, {}), name
