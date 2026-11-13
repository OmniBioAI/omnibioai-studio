"""Static router regressions: the agent graph route and agent_workflow_studio's
native run are closed from outside, on every prefix that reaches Workbench."""
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTER = REPO_ROOT / "docker" / "nginx-router.conf"

DEFAULT_AND_HOST = (
    "/api/agent/route",
    "/plugins/agent_workflow_studio/api/ui-run",
)
SVC_WORKBENCH = (
    "/_svc/workbench/api/agent/route",
    "/_svc/workbench/plugins/agent_workflow_studio/api/ui-run",
)
SVC_GATEWAY = (
    "/_svc/gateway/workbench/ops/agent/run",
    "/_svc/gateway/workbench/api/agent/route",
)


def _denials(text, prefix):
    return re.findall(r"location \^~ " + re.escape(prefix) + r" +\{ return 403; \}", text)


def test_default_server_and_workbench_host_deny_both_paths():
    text = ROUTER.read_text()
    host = text.index("server_name workbench.omnibioai.org;")
    for prefix in DEFAULT_AND_HOST:
        # default server + workbench.omnibioai.org server
        assert len(_denials(text, prefix)) == 2, prefix
        positions = [m.start() for m in re.finditer(re.escape("location ^~ " + prefix + " "), text)]
        assert any(pos < host for pos in positions), prefix
        assert any(pos > host for pos in positions), prefix


def test_svc_prefixes_deny_the_same_paths():
    text = ROUTER.read_text()
    for prefix in SVC_WORKBENCH + SVC_GATEWAY:
        assert len(_denials(text, prefix)) == 1, prefix


def _server_of(text, pos):
    """Start offset of the server { } block containing pos."""
    return text.rfind("\nserver {", 0, pos)


def test_denials_sit_in_the_server_of_the_generic_route_they_shadow():
    # ^~ prefixes: the longest match wins regardless of order, so the
    # denial only has to be in the same server block as the generic route.
    text = ROUTER.read_text()
    pairs = [
        ("location ^~ /api/agent/route ", "location ^~ /api/    {"),
        ("location ^~ /plugins/agent_workflow_studio/api/ui-run ", "location ^~ /plugins/   {"),
    ]
    pairs += [("location ^~ " + p + " ", "location ^~ /_svc/workbench   {") for p in SVC_WORKBENCH]
    pairs += [("location ^~ " + p + " ", "location ^~ /_svc/gateway     {") for p in SVC_GATEWAY]
    for denial, generic in pairs:
        assert _server_of(text, text.index(denial)) == _server_of(text, text.index(generic)), denial


def test_read_routes_and_other_plugins_stay_routed():
    text = ROUTER.read_text()
    # Nothing here narrows the graph list, other plugins' runs, or artifacts.
    for prefix in ("/api/agent/graphs", "/plugins/agent_workflow_studio/", "/_svc/gateway/workbench/"):
        assert not _denials(text, prefix), prefix
    assert "location ^~ /api/    { set $workbench_upstream workbench:8000;" in text
    assert "location ^~ /plugins/   { set $workbench_upstream workbench:8000;" in text
