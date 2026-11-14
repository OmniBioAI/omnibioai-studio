"""Static router regressions: format_converter and workflow_builder APIs are GET/HEAD only.

Stopgap for Workbench#901 / Workbench#904 until server-side storage confinement lands.
"""
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTER = REPO_ROOT / "docker" / "nginx-router.conf"
PLUGINS = ("format_converter", "workflow_builder")
SVC = "/_svc/workbench/plugins/{}/api/"
PUBLIC = "/plugins/{}/api/"


def _blocks(text, prefix):
    """Every `location ^~ <prefix> { ... }` body in the file."""
    pattern = re.compile(r"location \^~ " + re.escape(prefix) + r" \{(.*?)\n    \}", re.S)
    return pattern.findall(text)


def test_plugin_api_routes_allow_only_get():
    text = ROUTER.read_text()
    for slug in PLUGINS:
        for prefix in (SVC.format(slug), PUBLIC.format(slug)):
            bodies = _blocks(text, prefix)
            assert bodies, prefix
            for body in bodies:
                assert "limit_except GET { deny all; }" in body
                assert "proxy_pass http://$workbench_upstream;" in body


def test_svc_prefix_on_default_server_and_public_prefix_on_both_servers():
    text = ROUTER.read_text()
    host = text.index("server_name workbench.omnibioai.org;")
    for slug in PLUGINS:
        assert len(_blocks(text, SVC.format(slug))) == 1
        # default server + workbench.omnibioai.org server
        assert len(_blocks(text, PUBLIC.format(slug))) == 2
        public = [m.start() for m in re.finditer(re.escape("location ^~ " + PUBLIC.format(slug)), text)]
        assert any(pos > host for pos in public) and any(pos < host for pos in public)


def test_svc_routes_keep_prefix_strip_and_authorization_mapping():
    text = ROUTER.read_text()
    for slug in PLUGINS:
        body = _blocks(text, SVC.format(slug))[0]
        assert "rewrite ^/_svc/workbench(/.*)$   $1 break;" in body
        assert "proxy_set_header Authorization $control_authorization;" in body


def test_blocks_precede_the_generic_routes_they_shadow():
    text = ROUTER.read_text()
    for slug in PLUGINS:
        assert text.index("location ^~ " + SVC.format(slug)) < text.index("location ^~ /_svc/workbench   {")
        assert text.index("location ^~ " + PUBLIC.format(slug)) < text.index("location ^~ /plugins/   {")


def test_only_the_api_subtree_is_restricted():
    """Plugin pages (/plugins/<slug>/) stay on the generic route; only /api/ is narrowed."""
    text = ROUTER.read_text()
    for slug in PLUGINS:
        assert not _blocks(text, f"/plugins/{slug}/")
        assert not _blocks(text, f"/_svc/workbench/plugins/{slug}/")
