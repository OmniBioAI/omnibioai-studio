"""Canonical Studio Admin URLs cannot bypass their legacy authorization boundary."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / "src" / "ui" / "lib" / "adminRoutes.js"
ROUTER = ROOT / "docker" / "nginx-router.conf"


def _location(text: str, marker: str) -> str:
    start = text.index(marker)
    end = text.find("\n    location ", start + len(marker))
    return text[start:] if end < 0 else text[start:end]


def _definitions():
    pattern = re.compile(
        r'\{ group: "(?P<group>[^"]+)", name: "(?P<name>[^"]+)", '
        r'path: "(?P<path>/studio/admin/[^"]+)", idx: (?P<idx>-?\d+), '
        r'permissions: \[(?P<permissions>[^\]]+)\]'
        r'(?:, oldUrl: "(?P<old_url>[^"]+)")?, boundary: "(?P<boundary>[^"]+)" \},'
    )
    return [match.groupdict() for match in pattern.finditer(ROUTES.read_text())]


def test_every_canonical_admin_route_has_a_non_admin_frontend_gate():
    definitions = _definitions()
    assert len(definitions) == 24
    paths = [route["path"] for route in definitions]
    assert len(paths) == len(set(paths))
    assert all(route["permissions"].strip() for route in definitions)
    assert all(path.startswith("/studio/admin/") for path in paths)


def test_every_old_admin_url_is_classified_and_p0_p1_urls_keep_their_nginx_gate():
    old_routes = {route["old_url"]: route["boundary"] for route in _definitions() if route["old_url"]}
    assert old_routes == {
        "https://admin.omnibioai.org/": "standalone-admin",
        "/_svc/control/": "control-center",
        "https://control.omnibioai.org": "p1",
        "/_svc/monitor": "p1",
        "/_svc/toolimages": "p0",
        "/neo4j/browser/": "p0",
        "/_svc/gateway/docs": "p1",
        "/_svc/auth/health": "frontend",
        "/_svc/policy/docs": "p1",
        "/_svc/hpc/": "p1",
        "/_svc/audit/docs": "p1",
        "https://admin.omnibioai.org/iam/service-accounts": "standalone-admin",
        "https://admin.omnibioai.org/hipaa-compliance": "standalone-admin",
        "https://admin.omnibioai.org/security-posture": "standalone-admin",
        "/_svc/toolserver/docs": "p1",
        "https://admin.omnibioai.org/audit-explorer": "standalone-admin",
        "https://admin.omnibioai.org/audit-logs": "standalone-admin",
        "https://admin.omnibioai.org/organizations": "standalone-admin",
    }

    text = ROUTER.read_text()
    p1 = {
        "location ^~ /_svc/monitor {": "platform.manage_infra",
        "location ^~ /_svc/gateway/docs {": "platform.manage_infra",
        "location ^~ /_svc/policy {": "platform.manage_infra",
        "location ^~ /_svc/hpc {": "manage_config",
        "location ^~ /_svc/audit/docs {": "manage_all_orgs",
        "location ^~ /_svc/toolserver {": "manage_config",
    }
    for marker, permission in p1.items():
        block = _location(text, marker)
        assert f"set $p1_required_permission {permission};" in block
        assert "auth_request /internal/p1/permission;" in block
        assert "error_page 403 = @p1_forbidden;" in block

    for marker in ("location ^~ /_svc/toolimages  {", "location /neo4j/ {"):
        block = _location(text, marker)
        assert "auth_request" in block
        assert "error_page 403" in block

    control_server = text[text.index("server_name control.omnibioai.org;"):]
    control_root = _location(control_server, "location / {")
    assert "set $p1_required_permission platform.manage_infra;" in control_root
    assert "auth_request /internal/p1/permission;" in control_root


def test_legacy_studio_admin_paths_redirect_to_the_gated_canonical_route():
    router_source = (ROOT / "src" / "ui" / "lib" / "studioRouter.js").read_text()
    target = '"/studio/admin/runtime/admin-console"'
    assert f'"/studio/admin": {target}' in router_source
    assert f'"/studio/admin-console": {target}' in router_source
