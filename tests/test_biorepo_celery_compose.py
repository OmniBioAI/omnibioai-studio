"""BioRepository's Celery beat service and queue (Workbench biorepo/beat.py)."""

from pathlib import Path

import yaml

COMPOSE = yaml.safe_load((Path(__file__).parents[1] / "docker-compose.yml").read_text())
SERVICES = COMPOSE["services"]


def test_one_beat_process_with_a_minimal_environment():
    beat = SERVICES["celery-beat"]
    assert "celery -A omnibioai beat" in " ".join(beat["command"])
    assert "deploy" not in beat or beat["deploy"].get("replicas", 1) == 1
    env = beat["environment"]
    assert not [k for k in env if k.endswith(("_API_KEY", "_API_TOKEN", "_PASSWORD")) and k != "DB_PASSWORD"]
    assert "DOCKER_HOST" not in env and "volumes" not in beat
    assert beat["build"] == SERVICES["celery-worker"]["build"]


def test_the_worker_consumes_the_biorepo_queue_and_the_queue_defaults_to_celery():
    assert "-Q celery,biorepo" in " ".join(SERVICES["celery-worker"]["command"])
    for name in ("workbench", "celery-worker", "celery-beat"):
        assert SERVICES[name]["environment"]["BIOREPO_CELERY_QUEUE"] == "${BIOREPO_CELERY_QUEUE:-celery}", name
