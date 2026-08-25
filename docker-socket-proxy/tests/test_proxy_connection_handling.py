"""
Pure unit tests for proxy.py's HTTP connection-framing helpers.

Regression coverage for the bug found while verifying #58's real
published image: handle_client() is strictly one request per
connection -- it always closes both sides once a response completes
(see its own docstring) -- but _relay_response() used to forward the
upstream daemon's response headers verbatim. The real daemon's own
responses (e.g. /_ping) are plain HTTP/1.1 and default to persistent
when they don't say otherwise, which is exactly what they usually
don't say. That let an HTTP/1.1 client's connection pool (Go's
net/http, used by the `docker` CLI and Docker SDKs; Python's
`requests` Session; etc.) believe a connection was reusable and race
its next request against this proxy already having torn the
connection down.

Against the real published image this reproduced on ~4 of 5 ordinary
(non-adversarial) sequential requests -- "connection reset by peer",
"broken pipe", and (tellingly) "http: server closed idle connection"
from the Go client's own transport. A single request/response pair
(what every other existing test exercised) never surfaces it; it only
shows up across a *sequence* of calls sharing one client connection
pool. See test_proxy_live_integration.py's
TestConnectionReuseDoesNotCauseIntermittentFailures for that live,
real-daemon reproduction; these tests pin down the pure header-framing
fix in isolation, no daemon needed.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from proxy import _force_connection_close  # noqa: E402


def _raw(status_line: str, *header_lines: str) -> bytes:
    text = "\r\n".join([status_line, *header_lines, "", ""])
    return text.encode("iso-8859-1")


class TestForceConnectionClose:
    def test_adds_close_when_no_connection_header_present(self):
        """The exact real-world case that caused the bug: the real
        daemon's /_ping response carries no Connection header at all."""
        raw = _raw("HTTP/1.1 200 OK", "Content-Length: 0", "Api-Version: 1.53")
        out = _force_connection_close(raw)
        assert out.endswith(b"\r\n\r\n")
        text = out.decode("iso-8859-1")
        assert "Connection: close" in text
        assert text.count("Connection:") == 1

    def test_overrides_existing_keep_alive_value(self):
        raw = _raw("HTTP/1.1 200 OK", "Content-Length: 0", "Connection: keep-alive")
        out = _force_connection_close(raw).decode("iso-8859-1")
        assert "Connection: close" in out
        assert "keep-alive" not in out.lower()
        assert out.count("Connection:") == 1

    def test_case_insensitive_header_name_match(self):
        raw = _raw("HTTP/1.1 200 OK", "content-length: 0", "CONNECTION: Keep-Alive")
        out = _force_connection_close(raw).decode("iso-8859-1")
        assert "Connection: close" in out
        assert "keep-alive" not in out.lower()
        # Only the one Connection header we appended should remain.
        assert sum(1 for line in out.split("\r\n") if line.lower().startswith("connection:")) == 1

    def test_preserves_status_line_and_other_headers(self):
        raw = _raw(
            "HTTP/1.1 404 Not Found",
            "Content-Type: application/json",
            "Content-Length: 42",
            "Docker-Experimental: false",
        )
        out = _force_connection_close(raw).decode("iso-8859-1")
        lines = out.split("\r\n")
        assert lines[0] == "HTTP/1.1 404 Not Found"
        assert "Content-Type: application/json" in lines
        assert "Content-Length: 42" in lines
        assert "Docker-Experimental: false" in lines
        assert "Connection: close" in lines

    def test_no_headers_besides_status_line(self):
        raw = _raw("HTTP/1.1 204 No Content")
        out = _force_connection_close(raw).decode("iso-8859-1")
        lines = out.split("\r\n")
        assert lines[0] == "HTTP/1.1 204 No Content"
        assert "Connection: close" in lines

    def test_output_ends_with_blank_line_terminator(self):
        raw = _raw("HTTP/1.1 200 OK", "Content-Length: 0")
        out = _force_connection_close(raw)
        assert out.endswith(b"\r\n\r\n")
        # And nothing follows the terminator.
        assert out.count(b"\r\n\r\n") == 1
