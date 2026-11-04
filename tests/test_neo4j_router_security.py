"""Regression tests for the same-origin embedded Neo4j Browser route."""
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTER = REPO_ROOT / "docker" / "nginx-router.conf"


def _block(text, start_marker, end_marker):
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[start:end]


def test_neo4j_route_is_permission_gated_and_preserves_browser_auth_transport():
    text = ROUTER.read_text()
    block = _block(text, "location /neo4j/ {", "location / { set $web_ui_upstream")
    assert "auth_request      /internal/neo4j/access;" in block
    assert "error_page 403 = @neo4j_forbidden;" in block
    assert "proxy_pass http://$neo4j_upstream;" in block
    assert "proxy_set_header Authorization $http_authorization;" in block
    assert "proxy_set_header Upgrade $http_upgrade;" in block
    assert "proxy_set_header Connection $connection_upgrade;" in block
    assert "proxy_set_header X-Forwarded-Prefix /neo4j;" in block
    assert "proxy_redirect / /neo4j/;" in block
    assert "proxy_cookie_path / /neo4j/;" in block
    assert 'add_header X-Frame-Options "SAMEORIGIN" always;' in block
    assert 'add_header Content-Security-Policy "frame-ancestors \'self\'" always;' in block


def test_neo4j_access_subrequest_uses_permission_aware_backend_and_studio_cookie():
    text = ROUTER.read_text()
    block = _block(text, "location = /internal/neo4j/access {", "location @cc_unauthorized")
    assert "internal;" in block
    assert "proxy_pass http://$control_center_upstream/access/neo4j;" in block
    assert "proxy_method GET;" in block
    assert "proxy_set_header Authorization $neo4j_cookie_authorization;" in block
    assert 'proxy_set_header Cookie "";' in block
    assert "$neo4j_cookie_authorization" in text


def test_neo4j_unauthenticated_requests_fail_closed():
    text = ROUTER.read_text()
    assert "error_page 401 = @neo4j_unauthorized;" in text
    assert 'return 401 \'{"error":"unauthorized","message":"Valid Studio session required to access Neo4j Browser"}\';' in text
    assert "location /neo4j/" in text
    assert 'url:"/neo4j/browser/"' in (REPO_ROOT / "src/ui/pages/Studio.jsx").read_text()


def test_neo4j_non_admin_gets_explicit_403_instead_of_redirect():
    text = ROUTER.read_text()
    assert "error_page 403 = @neo4j_forbidden;" in text
    forbidden = _block(text, "location @neo4j_forbidden {", "location @toolimages_unauthorized")
    assert "return 403" in forbidden
    assert "platform.manage_infra" in forbidden
    assert "return 30" not in forbidden
