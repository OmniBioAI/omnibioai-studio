from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_integration_credentials_have_a_narrow_auth_service_route():
    nginx = (ROOT / "docker" / "nginx-router.conf").read_text()
    block = nginx.split("location ^~ /integrations/credentials {", 1)[1].split("}", 1)[0]
    assert "limit_req zone=auth_limit" in block
    assert "set $auth_upstream auth-service:8001;" in block
    assert "proxy_pass http://$auth_upstream;" in block
    assert "location ^~ /integrations {" not in nginx


def test_web_dev_proxy_matches_the_production_credential_path():
    vite = (ROOT / "vite.config.js").read_text()
    assert '"/integrations/credentials"' in vite
