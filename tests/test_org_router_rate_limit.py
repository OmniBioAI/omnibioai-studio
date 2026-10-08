from pathlib import Path


ROUTER = Path(__file__).parents[1] / "docker/nginx-router.conf"


def _location(source: str, marker: str) -> str:
    start = source.index(marker)
    end = source.index("\n    }", start)
    return source[start:end]


def test_org_routes_have_an_independent_authenticated_api_rate_limit():
    nginx = ROUTER.read_text()
    orgs = _location(nginx, "location ^~ /orgs {")
    auth = _location(nginx, "location ^~ /auth/ {")

    assert "zone=org_api_limit:10m rate=30r/m" in nginx
    assert "limit_req zone=org_api_limit burst=10 nodelay;" in orgs
    assert "limit_req zone=auth_limit burst=5 nodelay;" in auth
    assert "set $auth_upstream auth-service:8001;" in orgs
    assert "proxy_pass http://$auth_upstream;" in orgs
