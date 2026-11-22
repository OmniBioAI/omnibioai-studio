"""Static checks: workbench and celery-worker share one persistent uploads dir.

Workbench stores browser uploads under BASE_DIR/work/uploads (/app/work/uploads:
plugin_ui._upload_dir, data_service, and plugin views such as vcf_liftover and
bedtools_intersect). Those views queue Celery tasks that read the files in
celery-worker. Before this mount the directory was on each container's
overlay filesystem: lost on recreate and invisible to the worker.

Purely static (no docker daemon), same approach as test_compose_mysql_no_root.py.
"""
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
TARGET = "/app/work/uploads"
SERVICES = ("workbench", "celery-worker")


def _services(name):
    return yaml.safe_load((REPO_ROOT / name).read_text())["services"]


def _long_binds(service):
    return [v for v in service.get("volumes", []) if isinstance(v, dict) and v.get("target") == TARGET]


def _short_binds(service):
    return [v for v in service.get("volumes", []) if isinstance(v, str) and v.split(":")[1].split()[0] == TARGET]


@pytest.mark.parametrize("service", SERVICES)
def test_dev_compose_binds_uploads_under_work_dir(service):
    binds = _long_binds(_services("docker-compose.yml")[service])
    assert len(binds) == 1, binds
    bind = binds[0]
    assert bind["type"] == "bind"
    assert bind["source"] == "${WORK_DIR}/uploads"
    # Fail if the NAS dir is missing instead of creating an empty root-owned one.
    assert bind["bind"]["create_host_path"] is False
    assert not bind.get("read_only")


def test_both_services_use_the_same_source_and_path():
    services = _services("docker-compose.yml")
    sources = {(_long_binds(services[s])[0]["source"], _long_binds(services[s])[0]["target"]) for s in SERVICES}
    assert sources == {("${WORK_DIR}/uploads", TARGET)}


def test_uploads_sits_beside_runs_so_host_path_translation_holds():
    # ml_utils.to_host_path maps /app/work/X to $OMNIBIOAI_WORK_DIR/X, the host
    # path of ${WORK_DIR}; uploads must follow the same convention as runs.
    services = _services("docker-compose.yml")
    for name in SERVICES:
        runs = [v for v in services[name]["volumes"] if isinstance(v, dict) and v.get("target") == "/app/work/runs"]
        assert runs and runs[0]["source"] == "${WORK_DIR}/runs"


@pytest.mark.parametrize("compose", ["docker-compose-release.yml", "docker-compose.release.yml"])
@pytest.mark.parametrize("service", SERVICES)
def test_release_composes_bind_uploads(compose, service):
    binds = _short_binds(_services(compose)[service])
    assert len(binds) == 1, binds
    assert binds[0].split(":")[0] == "${WORK_DIR}/uploads"
