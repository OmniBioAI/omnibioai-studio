"""Router contract for BioRepository's bare routes (Workbench docs/biorepo)."""

import re
from pathlib import Path

ROUTER = Path(__file__).parents[1] / "docker/nginx-router.conf"


def _block(prefix):
    text = ROUTER.read_text()
    start = text.index(f"location ^~ {prefix} {{")
    depth, i = 0, text.index("{", start)
    for j in range(i, len(text)):
        depth += {"{": 1, "}": -1}.get(text[j], 0)
        if depth == 0:
            return text[i:j]
    raise AssertionError(prefix)


def test_biorepo_routes_reach_workbench_without_rewriting_the_path():
    for prefix in ("/api/biorepo/", "/ga4gh/drs/"):
        block = _block(prefix)
        assert "set $workbench_upstream workbench:8000;" in block
        assert "proxy_pass http://$workbench_upstream;" in block
        assert "rewrite" not in block


def test_biorepo_routes_are_bearer_only_and_never_forward_cookies():
    for prefix in ("/api/biorepo/", "/ga4gh/drs/"):
        block = _block(prefix)
        assert "proxy_set_header Authorization     $http_authorization;" in block
        assert "$control_authorization" not in block and "$control_cookie_authorization" not in block
        assert 'proxy_set_header Cookie            "";' in block


def test_biorepo_routes_keep_the_public_host_and_scheme():
    # A location with its own proxy_set_header inherits none from the server.
    for prefix in ("/api/biorepo/", "/ga4gh/drs/"):
        block = _block(prefix)
        assert "proxy_set_header Host              $host;" in block
        assert "proxy_set_header X-Forwarded-Proto $router_xfp;" in block


def test_drs_is_read_only_and_uploads_stream_in_bounded_chunks():
    assert re.search(r"limit_except GET OPTIONS \{ deny all; \}", _block("/ga4gh/drs/"))
    api = _block("/api/biorepo/")
    assert "client_max_body_size 65m;" in api
    assert "proxy_request_buffering off;" in api and "proxy_buffering off;" in api


def test_the_internal_ownership_check_is_never_routed():
    text = ROUTER.read_text()
    for prefix in ("/api/biorepo/v1/internal/", "/_svc/workbench/api/biorepo/v1/internal/"):
        assert f"location ^~ {prefix} {{ return 404; }}" in text


def test_the_internal_ownership_check_is_denied_on_the_workbench_host():
    text = ROUTER.read_text()
    start = text.index("server_name workbench.omnibioai.org;")
    end = text.find("\nserver {", start)
    block = text[start:end if end != -1 else len(text)]
    assert "location ^~ /api/biorepo/v1/internal/ { return 404; }" in block


def _server(name):
    text = ROUTER.read_text()
    start = text.index(f"server_name {name};")
    end = text.find("\nserver {", start)
    return text[start:end if end != -1 else len(text)]


def test_the_drs_host_serves_only_the_read_only_drs_api():
    block = _server("drs.omnibioai.org")
    locations = re.findall(r"location ([^{]+)\{", block)
    assert [l.strip() for l in locations] == ["= /health", "^~ /ga4gh/drs/", "/"]
    drs = block[block.index("location ^~ /ga4gh/drs/"):]
    assert "limit_except GET OPTIONS { deny all; }" in drs
    assert 'proxy_set_header Cookie            "";' in drs
    assert "proxy_pass http://$workbench_upstream;" in drs
    assert re.search(r"location / \{\s*return 404;\s*\}", block)
