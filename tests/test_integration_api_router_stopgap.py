"""Static router regressions: benchling's API is closed, servicenow's API is GET/HEAD only.

Stopgap for Workbench#922 until integration write actions go through
action_policy and a server-side staff check on every entry point.
"""
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTER = REPO_ROOT / "docker" / "nginx-router.conf"
SVC = "/_svc/workbench/plugins/{}/api/"
PUBLIC = "/plugins/{}/api/"


def _blocks(text, prefix):
    """Every `location ^~ <prefix> { ... }` body in the file, one-line or multi-line."""
    head = r"location \^~ " + re.escape(prefix) + r" \{"
    one_line = re.findall(head + r" ([^\n]*) \}\n", text)
    multi_line = re.findall(head + r"\n(.*?)\n    \}", text, re.S)
    return one_line + multi_line


def test_benchling_api_is_denied_on_every_route():
    text = ROUTER.read_text()
    for prefix in (SVC.format("benchling"), PUBLIC.format("benchling")):
        bodies = _blocks(text, prefix)
        assert bodies, prefix
        for body in bodies:
            assert body.strip() == "return 403;"
            assert "proxy_pass" not in body


def test_servicenow_api_allows_only_get():
    text = ROUTER.read_text()
    for prefix in (SVC.format("servicenow"), PUBLIC.format("servicenow")):
        bodies = _blocks(text, prefix)
        assert bodies, prefix
        for body in bodies:
            assert "limit_except GET { deny all; }" in body
            assert "proxy_pass http://$workbench_upstream;" in body


def test_svc_prefix_on_default_server_and_public_prefix_on_both_servers():
    text = ROUTER.read_text()
    host = text.index("server_name workbench.omnibioai.org;")
    for slug in ("benchling", "servicenow"):
        assert len(_blocks(text, SVC.format(slug))) == 1
        public = [m.start() for m in re.finditer(re.escape("location ^~ " + PUBLIC.format(slug)), text)]
        assert len(public) == 2
        assert any(pos > host for pos in public) and any(pos < host for pos in public)


def test_servicenow_svc_route_keeps_prefix_strip_and_authorization_mapping():
    body = _blocks(ROUTER.read_text(), SVC.format("servicenow"))[0]
    assert "rewrite ^/_svc/workbench(/.*)$   $1 break;" in body
    assert "proxy_set_header Authorization $control_authorization;" in body


def test_blocks_precede_the_generic_routes_they_shadow():
    text = ROUTER.read_text()
    for slug in ("benchling", "servicenow"):
        assert text.index("location ^~ " + SVC.format(slug)) < text.index("location ^~ /_svc/workbench   {")
        assert text.index("location ^~ " + PUBLIC.format(slug)) < text.index("location ^~ /plugins/   {")


def test_only_the_api_subtree_is_restricted():
    """Plugin pages (/plugins/<slug>/) stay on the generic route; only /api/ is narrowed."""
    text = ROUTER.read_text()
    for slug in ("benchling", "servicenow"):
        assert "location ^~ /plugins/{}/ {{".format(slug) not in text
        assert "location ^~ /_svc/workbench/plugins/{}/ {{".format(slug) not in text
