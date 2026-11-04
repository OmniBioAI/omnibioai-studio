"""Regression tests for Tool Images UI and direct build API authorization."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "docker" / "nginx-router.conf"


def _block(text: str, start_marker: str, end_marker: str) -> str:
    start = text.index(start_marker)
    return text[start:text.index(end_marker, start)]


def test_tool_images_ui_assets_catalog_and_build_api_share_manage_config_gate():
    text = ROUTER.read_text()
    markers = (
        "location ^~ /_svc/toolimages/assets/ {",
        "location ^~ /_svc/toolimages  {",
        "location ^~ /v1/tools {",
        "location ^~ /v1/build {",
    )
    for index, marker in enumerate(markers):
        end = markers[index + 1] if index + 1 < len(markers) else "# dev-hub's UI"
        block = _block(text, marker, end)
        assert "auth_request /internal/toolimages/access;" in block
        assert "error_page 403 = @toolimages_forbidden;" in block
        assert "proxy_set_header Authorization $control_authorization;" in block


def test_tool_images_access_subrequest_calls_backend_permission_check():
    text = ROUTER.read_text()
    block = _block(text, "location = /internal/toolimages/access {", "location = /internal/neo4j/access {")
    assert "internal;" in block
    assert "proxy_pass http://$toolimages_upstream/access;" in block
    assert "proxy_method GET;" in block
    assert "proxy_set_header Authorization $control_authorization;" in block
    assert 'proxy_set_header Cookie "";' in block


def test_tool_images_non_admin_gets_explicit_403_instead_of_redirect():
    text = ROUTER.read_text()
    forbidden = _block(text, "location @toolimages_forbidden {", "\n}")
    assert "return 403" in forbidden
    assert "manage_config" in forbidden
    assert "return 30" not in forbidden
