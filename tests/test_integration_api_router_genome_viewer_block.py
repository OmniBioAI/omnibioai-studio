"""Static router regressions: genome_viewer's api/tracks is closed from outside.

Stopgap until Workbench's genome_viewer tracks endpoint requires login and
CSRF and stops writing client-named files. api/reference (a read-only list)
and the rest of the plugin stay routed.
"""
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTER = REPO_ROOT / "docker" / "nginx-router.conf"
SVC = "/_svc/workbench/plugins/genome_viewer/api/tracks"
PUBLIC = "/plugins/genome_viewer/api/tracks"


def _blocks(text, prefix):
    """Every one-line `location ^~ <prefix> { ... }` body in the file."""
    return re.findall(r"location \^~ " + re.escape(prefix) + r" \{ ([^\n]*) \}\n", text)


def test_tracks_is_denied_on_every_route():
    text = ROUTER.read_text()
    for prefix in (SVC, PUBLIC):
        bodies = _blocks(text, prefix)
        assert bodies, prefix
        for body in bodies:
            assert body.strip() == "return 403;"


def test_prefix_has_no_trailing_slash():
    """`.../api/tracks` (no slash, APPEND_SLASH redirect) must be denied as well."""
    text = ROUTER.read_text()
    assert "location ^~ " + SVC + "/ " not in text
    assert "location ^~ " + PUBLIC + "/ " not in text


def test_svc_prefix_on_default_server_and_public_prefix_on_both_servers():
    text = ROUTER.read_text()
    host = text.index("server_name workbench.omnibioai.org;")
    assert len(_blocks(text, SVC)) == 1
    assert text.index("location ^~ " + SVC) < host
    public = [m.start() for m in re.finditer(re.escape("location ^~ " + PUBLIC + " "), text)]
    assert len(public) == 2
    assert any(pos > host for pos in public) and any(pos < host for pos in public)


def test_blocks_precede_the_generic_routes_they_shadow():
    text = ROUTER.read_text()
    assert text.index("location ^~ " + SVC) < text.index("location ^~ /_svc/workbench   {")
    assert text.index("location ^~ " + PUBLIC) < text.index("location ^~ /plugins/   {")


def test_only_tracks_is_restricted():
    """api/reference, api/omniobjects and the plugin page stay on the generic route."""
    text = ROUTER.read_text()
    for base in ("/plugins/genome_viewer", "/_svc/workbench/plugins/genome_viewer"):
        for sub in ("/", "/api/", "/api/reference", "/api/omniobjects"):
            assert "location ^~ " + base + sub + " " not in text
            assert "location = " + base + sub not in text
