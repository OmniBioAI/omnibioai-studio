"""P1 nginx permission-gate routing and transport regression tests."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "docker" / "nginx-router.conf"


def _location(text: str, marker: str) -> str:
    start = text.index(marker)
    end = text.find("\n    location ", start + len(marker))
    return text[start:] if end < 0 else text[start:end]


def _assert_gate(block: str, permission: str) -> None:
    assert f"set $p1_required_permission {permission};" in block
    assert "auth_request /internal/p1/permission;" in block
    assert "error_page 401 = @p1_" in block
    assert "error_page 403 = @p1_" in block
    # A successful admin check continues to the configured upstream.
    assert "proxy_pass http://$" in block


def test_operator_proxies_use_the_named_permission_gate():
    text = ROUTER.read_text()
    expected = {
        "location ^~ /_svc/monitor {": "platform.manage_infra",
        "location ^~ /_svc/toolserver {": "manage_config",
        "location ^~ /_svc/gateway/docs {": "platform.manage_infra",
        "location = /_svc/gateway/redoc {": "platform.manage_infra",
        "location = /_svc/gateway/openapi.json {": "platform.manage_infra",
        "location ^~ /_svc/policy {": "platform.manage_infra",
        "location ^~ /_svc/hpc {": "manage_config",
        "location ^~ /_svc/audit/docs {": "manage_all_orgs",
        "location = /_svc/audit/redoc {": "manage_all_orgs",
        "location = /_svc/audit/openapi.json {": "manage_all_orgs",
    }
    for marker, permission in expected.items():
        _assert_gate(_location(text, marker), permission)


def test_shared_gate_forwards_the_route_permission_and_studio_session():
    text = ROUTER.read_text()
    gates = text.split("location = /internal/p1/permission {")[1:]
    # One server-local declaration for Studio and one for control.omnibioai.org;
    # both invoke the same permission-aware backend contract.
    assert len(gates) == 2
    for gate in gates:
        block = gate.split("\n    }", 1)[0]
        assert "internal;" in block
        assert "proxy_pass http://$control_center_upstream/access/permission;" in block
        assert "proxy_set_header Authorization $control_authorization;" in block
        assert "proxy_set_header X-Required-Permission $p1_required_permission;" in block
        assert 'proxy_set_header Cookie "";' in block


def test_non_admin_denial_is_403_not_a_redirect():
    text = ROUTER.read_text()
    forbidden = _location(text, "location @p1_forbidden {")
    control_forbidden = _location(text, "location @p1_control_forbidden {")
    for block in (forbidden, control_forbidden):
        assert "return 403" in block
        assert "return 30" not in block


def test_platform_health_ui_is_gated_but_health_and_auth_stay_reachable():
    text = ROUTER.read_text()
    server = text[text.index("server_name control.omnibioai.org;"):]
    _assert_gate(_location(server, "location / {"), "platform.manage_infra")
    assert 'location = /_health {' in server
    assert 'location ^~ /auth/ {' in server


def test_public_gateway_api_is_not_admin_gated():
    text = ROUTER.read_text()
    block = _location(text, "location ^~ /_svc/gateway     {")
    assert "auth_request" not in block
    assert "proxy_pass http://$gateway_upstream;" in block


def test_security_audit_data_proxy_is_not_blanket_gated():
    text = ROUTER.read_text()
    block = _location(text, "location ^~ /_svc/audit  {")
    assert "auth_request" not in block
    assert "proxy_pass http://$audit_upstream;" in block


def test_policy_hpc_and_toolserver_mutations_cannot_bypass_permission_gate():
    """The proxy gate is unconditional, so POST/PUT/PATCH/DELETE are gated too."""
    text = ROUTER.read_text()
    expected = {
        "location ^~ /_svc/policy {": "platform.manage_infra",
        "location ^~ /_svc/hpc {": "manage_config",
        "location ^~ /_svc/toolserver {": "manage_config",
    }
    for marker, permission in expected.items():
        block = _location(text, marker)
        _assert_gate(block, permission)
        assert "limit_except" not in block
        assert block.index("auth_request /internal/p1/permission;") < block.index(
            "proxy_pass http://$"
        )


def test_grafana_gate_preserves_subpath_and_websocket_transport():
    text = ROUTER.read_text()
    block = _location(text, "location ^~ /_svc/monitor {")
    assert "rewrite ^/_svc/monitor" not in block
    assert "proxy_http_version 1.1;" in block
    assert "proxy_set_header Upgrade $http_upgrade;" in block
    assert "proxy_set_header Connection $connection_upgrade;" in block
    assert "proxy_pass_header Set-Cookie;" in block
    assert 'proxy_cookie_path / "/; SameSite=Lax";' in block
