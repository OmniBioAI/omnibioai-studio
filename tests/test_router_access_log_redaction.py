"""The router's access log never records a BioRepository download token.

A signed link (/api/biorepo/v1/download/<token>, also through /_svc/workbench/)
is a bearer credential until it expires, and nginx's stock "main" format logs
the raw request line and Referer. The config logs every server with its own
"obai_main" format, built from maps that replace the token with <redacted>.
"""

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).parents[1]
ROUTER = ROOT / "docker/nginx-router.conf"
COMPOSE = ROOT / "docker-compose.yml"
ACCESS_LOG = "access_log /var/log/nginx/access.log obai_main;"
TOKEN = "eyJmIjoiZm9fMDFNN0sxSjFaU1EiLCJ1IjoiNSJ9:1vM0sK:Qm9ndXNTaWduYXR1cmU"


def _map_rule(variable):
    """(compiled regex, replacement) of the map that sets ``variable``."""
    text = ROUTER.read_text()
    block = re.search(r"map \$\S+ \$" + variable + r" \{(.*?)\n\}", text, re.S).group(1)
    pattern, replacement = re.search(r'"~\*(.*)" "(.*)";', block).groups()
    # nginx uses PCRE (?<name>...); Python spells it (?P<name>...).
    return re.compile(pattern.replace("(?<", "(?P<"), re.I), replacement


def _apply(variable, value):
    regex, replacement = _map_rule(variable)
    m = regex.match(value)
    if not m:
        return value
    return re.sub(r"\$\{(\w+)\}", lambda g: m.group(g.group(1)), replacement)


def _servers():
    text = ROUTER.read_text()
    starts = [m.start() for m in re.finditer(r"^server \{", text, re.M)]
    return [text[s:e] for s, e in zip(starts, starts[1:] + [len(text)])]


def test_every_server_logs_with_the_redacting_format():
    servers = _servers()
    assert len(servers) >= 6
    for block in servers:
        name = re.search(r"server_name ([^;]+);", block).group(1)
        assert ACCESS_LOG in block, name


def test_no_access_log_uses_the_stock_format():
    for line in ROUTER.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line.startswith("access_log "):
            assert line in (ACCESS_LOG, "access_log off;"), line


def test_the_format_logs_only_the_redacted_request_and_referer():
    text = ROUTER.read_text()
    fmt = re.search(r"log_format obai_main (.*?);\n", text, re.S).group(1)
    assert "$obai_request_redacted" in fmt and "$obai_referer_redacted" in fmt
    for raw in ("$request", "$request_uri", "$uri", "$args", "$query_string", "$http_referer"):
        assert not re.search(re.escape(raw) + r"(?![A-Za-z_])", fmt), raw


def test_download_tokens_are_redacted_in_every_spelling():
    for path in (
        f"/api/biorepo/v1/download/{TOKEN}",
        f"/_svc/workbench/api/biorepo/v1/download/{TOKEN}",
        f"/API/BioRepo/V1/Download/{TOKEN}",
        f"//api//biorepo/v1/download//{TOKEN}",
        f"/api%2Fbiorepo%2fv1%2Fdownload%2F{TOKEN}",
        f"/api/biorepo/v1/download/{TOKEN.replace(':', '%3A')}",
    ):
        for suffix in ("", "?x=1", "/"):
            line = _apply("obai_request_redacted", f"GET {path}{suffix} HTTP/1.1")
            assert TOKEN.split(":")[0] not in line and "<redacted>" in line, (path, suffix, line)
            assert line.startswith("GET ") and line.endswith(f"{suffix} HTTP/1.1")


def test_the_referer_is_redacted_too():
    ref = _apply("obai_referer_redacted", f"https://webstudio.omnibioai.org/api/biorepo/v1/download/{TOKEN}")
    assert ref == "https://webstudio.omnibioai.org/api/biorepo/v1/download/<redacted>"


def test_other_requests_are_logged_unchanged():
    for line in (
        "GET /api/biorepo/v1/datasets?page=2 HTTP/1.1",
        "POST /api/biorepo/v1/files/fo_01ABC/download-url HTTP/1.1",
        "GET /ga4gh/drs/v1/objects/fo_01ABC HTTP/1.1",
        "GET /_svc/workbench/api/biorepo/v1/search?q=download HTTP/1.1",
    ):
        assert _apply("obai_request_redacted", line) == line


def test_the_router_log_is_rotated():
    compose = yaml.safe_load(COMPOSE.read_text())
    logging = compose["services"]["nginx-router"]["logging"]
    assert logging["driver"] == "json-file"
    assert logging["options"]["max-size"] and int(logging["options"]["max-file"]) >= 2


def test_an_empty_referer_still_logs_a_dash():
    text = ROUTER.read_text()
    block = re.search(r"map \$http_referer \$obai_referer_redacted \{(.*?)\n\}", text, re.S).group(1)
    assert '""      "-";' in block
