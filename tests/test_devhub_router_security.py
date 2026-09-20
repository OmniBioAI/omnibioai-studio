"""Static Dev Hub router security regressions."""
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTER = REPO_ROOT / "docker" / "nginx-router.conf"


def test_svc_devhub_rag_prefix_fails_closed_before_generic_devhub_proxy():
    text = ROUTER.read_text()
    exact = "location = /_svc/devhub/rag"
    protected = "location ^~ /_svc/devhub/rag/"
    generic = "location ^~ /_svc/devhub      {"
    assert exact in text
    assert protected in text
    assert generic in text
    assert text.index(exact) < text.index(protected) < text.index(generic)
    block = text[text.index(exact):text.index(generic)]
    assert block.count("return 401") == 2
    assert "default_type application/json" in block
    assert "proxy_pass" not in block
    assert "X-Devhub-Internal" not in block


def test_bare_rag_route_keeps_auth_request_and_caller_authorization_forwarding():
    text = ROUTER.read_text()
    start = text.index("location ^~ /rag/ {")
    end = text.index("location = /status", start)
    block = text[start:end]
    assert "auth_request      /internal/auth/verify;" in block
    assert "proxy_set_header Authorization     $control_authorization;" in block
    assert "proxy_pass http://$devhub_upstream;" in block
