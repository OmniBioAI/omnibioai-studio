"""Regression checks for the Studio mounted Control Center frontend."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "docker/nginx-router.conf"


def test_mounted_control_ui_remains_jwt_gated_and_precedes_public_api_routes():
    text = ROUTER.read_text()
    start = text.index("location ~ ^/_svc/control/(?:$")
    end = text.index("# Control center — public read-only endpoints", start)
    block = text[start:end]
    assert "auth_request      /internal/auth/verify;" in block
    assert "proxy_set_header Authorization $control_authorization;" in block
    assert "control-center-web:5174" in block
    assert "proxy_pass http://$control_web_upstream;" in block
    assert "rewrite" not in block
    assert start < end < text.index("location ~* ^/_svc/control/(health|summary|services|report|report/data)$")


def test_mounted_ui_build_preserves_backend_permission_gate_and_serves_only_static_files():
    source = (ROOT.parent / "omnibioai-control-center/docker/nginx/control-center.conf").read_text()
    start = source.index("location ^~ /_svc/control/")
    end = source.index("location = /_control_studio_access", start)
    block = source[start:end]
    access = source[end:source.index("include /etc/nginx/api-proxy.conf", end)]
    assert "auth_request /_control_studio_access;" in block
    assert "try_files $uri $uri/ /_svc/control/index.html;" in block
    assert "location ^~ /_svc/control/assets/" in block
    assert "try_files $uri =404;" in block
    assert "proxy_pass http://$control_center_upstream/;" in access
    assert "proxy_set_header Authorization $http_authorization;" in access


def test_studio_build_uses_the_same_control_app_and_canonical_base_for_assets_and_apis():
    cc = ROOT.parent / "omnibioai-control-center"
    package = (cc / "frontend/cc-ui/package.json").read_text()
    dockerfile = (cc / "Dockerfile").read_text()
    assert "build:control:studio" in package
    assert "--base=/_svc/control/" in package
    assert "VITE_API_BASE=/_svc/control" in package
    assert "npm run build:control:studio" in dockerfile
    assert "dist-control-studio /usr/share/nginx/html/_svc/control" in dockerfile
