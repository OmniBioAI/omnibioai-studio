import json
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD_DIR = ROOT / "monitoring/grafana/dashboards"
DATASOURCE_PROVISIONING_DIR = ROOT / "monitoring/grafana/provisioning/datasources"
DASHBOARDS = [
    ROOT / "monitoring/grafana/dashboards/omnibioai-services.json",
    ROOT / "monitoring/grafana/dashboards/platform_overview.json",
    ROOT / "monitoring/grafana/dashboards/lims.json",
    ROOT / "monitoring/grafana/dashboards/rag.json",
]


def _datasource_uids(value):
    if isinstance(value, dict):
        datasource = value.get("datasource")
        if isinstance(datasource, dict) and datasource.get("uid"):
            yield datasource["uid"]
        for child in value.values():
            yield from _datasource_uids(child)
    elif isinstance(value, list):
        for child in value:
            yield from _datasource_uids(child)


def _provisioned_datasource_uids():
    uids = set()
    for pattern in ("*.yml", "*.yaml"):
        for path in DATASOURCE_PROVISIONING_DIR.glob(pattern):
            provisioning = yaml.safe_load(path.read_text()) or {}
            uids.update(
                datasource["uid"]
                for datasource in provisioning.get("datasources", [])
                if datasource.get("uid")
            )
    return uids


def _panels(dashboard):
    pending = list(dashboard.get("panels", []))
    while pending:
        panel = pending.pop()
        yield panel
        pending.extend(panel.get("panels", []))


def test_dashboard_datasource_uids_are_provisioned():
    provisioned_uids = _provisioned_datasource_uids()

    for path in DASHBOARD_DIR.glob("*.json"):
        dashboard = json.loads(path.read_text())
        assert set(_datasource_uids(dashboard)) <= provisioned_uids, path


def test_provisioned_dashboards_follow_the_requested_grafana_theme():
    for path in DASHBOARDS:
        dashboard = json.loads(path.read_text())
        assert "style" not in dashboard, path

        for panel in _panels(dashboard):
            assert panel.get("transparent") is not False, (path, panel.get("title"))
            for override in panel.get("fieldConfig", {}).get("overrides", []):
                for prop in override.get("properties", []):
                    assert prop.get("id") not in {"color", "backgroundColor"}, (
                        path,
                        panel.get("title"),
                    )


def test_known_metric_family_and_label_mismatches_do_not_regress():
    dashboards = "\n".join(path.read_text() for path in DASHBOARDS)
    assert "status_code" not in dashboards
    assert "django_db_execute_many_duration_seconds" not in dashboards


def test_custom_theme_and_compose_do_not_force_dark_mode():
    css = (ROOT / "monitoring/grafana/custom.css").read_text()
    compose = (ROOT / "docker-compose.yml").read_text()

    assert '.theme-light,\n[data-theme="light"] {' in css
    assert '.theme-dark,\n[data-theme="dark"] {' in css
    assert "GF_USERS_DEFAULT_THEME" not in compose

