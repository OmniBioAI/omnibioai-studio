"""Static router regressions: the orchestrator plugin is GET/HEAD only."""
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTER = REPO_ROOT / "docker" / "nginx-router.conf"
PREFIXES = (
    "/_svc/workbench/plugins/multi_agent_bio_orchestrator/",
    "/plugins/multi_agent_bio_orchestrator/",
)


def _blocks(text, prefix):
    """Every `location ^~ <prefix> { ... }` body in the file."""
    pattern = re.compile(r"location \^~ " + re.escape(prefix) + r" \{(.*?)\n    \}", re.S)
    return pattern.findall(text)


def test_orchestrator_routes_allow_only_get():
    text = ROUTER.read_text()
    for prefix in PREFIXES:
        for body in _blocks(text, prefix):
            assert "limit_except GET { deny all; }" in body
            assert "proxy_pass http://$workbench_upstream;" in body


def test_both_prefixes_on_default_server_and_plugins_on_workbench_host():
    text = ROUTER.read_text()
    assert len(_blocks(text, PREFIXES[0])) == 1
    # default server + workbench.omnibioai.org server
    assert len(_blocks(text, PREFIXES[1])) == 2
    host = text.index("server_name workbench.omnibioai.org;")
    plugins = [m.start() for m in re.finditer(re.escape("location ^~ " + PREFIXES[1]), text)]
    assert any(pos > host for pos in plugins)


def test_svc_route_keeps_prefix_strip_and_authorization_mapping():
    body = _blocks(ROUTER.read_text(), PREFIXES[0])[0]
    assert "rewrite ^/_svc/workbench(/.*)$   $1 break;" in body
    assert "proxy_set_header Authorization $control_authorization;" in body


def test_orchestrator_blocks_precede_the_generic_routes_they_shadow():
    text = ROUTER.read_text()
    assert text.index("location ^~ " + PREFIXES[0]) < text.index("location ^~ /_svc/workbench   {")
    assert text.index("location ^~ " + PREFIXES[1]) < text.index("location ^~ /plugins/   {")
