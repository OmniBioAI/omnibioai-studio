"""Regression tests for the same-origin embedded Neo4j Browser route."""
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTER = REPO_ROOT / "docker" / "nginx-router.conf"


def _block(text, start_marker, end_marker):
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[start:end]


def test_neo4j_route_is_jwt_gated_and_preserves_browser_auth_transport():
    text = ROUTER.read_text()
    block = _block(text, "location /neo4j/ {", "location / { set $web_ui_upstream")
    assert "auth_request      /internal/neo4j/auth/verify;" in block
    assert "proxy_pass http://$neo4j_upstream;" in block
    assert "proxy_set_header Authorization $http_authorization;" in block
    assert "proxy_set_header Upgrade $http_upgrade;" in block
    assert "proxy_set_header Connection $connection_upgrade;" in block
    assert "proxy_set_header X-Forwarded-Prefix /neo4j;" in block
    assert "proxy_redirect / /neo4j/;" in block
    assert "proxy_cookie_path / /neo4j/;" in block
    assert 'add_header X-Frame-Options "SAMEORIGIN" always;' in block
    assert 'add_header Content-Security-Policy "frame-ancestors \'self\'" always;' in block


def test_neo4j_auth_subrequest_uses_studio_cookie_not_neo4j_basic_header():
    text = ROUTER.read_text()
    block = _block(text, "location = /internal/neo4j/auth/verify {", "location @cc_unauthorized")
    assert "internal;" in block
    assert "proxy_pass http://$gateway_upstream/auth/verify;" in block
    assert "proxy_set_header Authorization $neo4j_cookie_authorization;" in block
    assert "$neo4j_cookie_authorization" in text


def test_neo4j_unauthenticated_requests_fail_closed():
    text = ROUTER.read_text()
    assert "error_page 401 = @neo4j_unauthorized;" in text
    assert 'return 401 \'{"error":"unauthorized","message":"Valid Studio session required to access Neo4j Browser"}\';' in text
    assert "location /neo4j/" in text
    assert 'url:"/neo4j/browser/"' in (REPO_ROOT / "src/ui/pages/Workbench.jsx").read_text()
