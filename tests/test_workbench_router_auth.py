"""Security contract for the same-origin Studio -> Workbench auth bridge."""

from pathlib import Path


ROUTER = Path(__file__).parents[1] / "docker/nginx-router.conf"


def test_workbench_proxy_forwards_the_verified_studio_cookie_as_bearer_auth():
    text = ROUTER.read_text()
    block = next(line for line in text.splitlines() if "location ^~ /_svc/workbench" in line)
    assert "proxy_set_header Authorization $control_authorization;" in block
    assert "proxy_pass http://$workbench_upstream;" in block


def test_workbench_bridge_uses_the_central_access_token_cookie_map():
    text = ROUTER.read_text()
    assert "map $cookie_omnibioai_access_token $control_cookie_authorization" in text
    assert "map $http_authorization $control_authorization" in text
