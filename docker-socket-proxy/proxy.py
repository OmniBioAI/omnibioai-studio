"""
proxy.py -- I/O layer for the #265 docker-socket-proxy.

Listens on a unix socket (PROXY_LISTEN_SOCKET). For each client
connection: reads one HTTP request's request-line + headers (and, for
POST /containers/create, its full JSON body -- needed to evaluate the
request), asks policy.evaluate_request() whether it's allowed, and:
  - if denied: writes back a synthetic 403 JSON response, closes the
    connection. Nothing ever reaches the real daemon.
  - if allowed: opens a connection to the real docker.sock
    (DOCKER_SOCK_PATH), forwards the already-buffered request bytes,
    then relays the response back to the client with correct HTTP
    framing (Content-Length / chunked / 101-Switching-Protocols hijack
    / close-delimited) and CLOSES the connection once that one
    request/response (or hijacked stream) completes.

Deliberately does not support keep-alive/connection reuse across
multiple logical requests on one client connection: each request gets
its own fresh upstream connection and its own independent policy
decision, so there is no way for one allowed request to smuggle a
second, unvalidated request through on a persistent connection. The
`docker` CLI (Go's net/http, like any HTTP/1.1 client) transparently
opens a new connection when a previous one is closed -- this costs a
unix-socket connect() per API call, negligible for this use case, in
exchange for that being a provable, not just believed, property.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Dict, Optional, Tuple

from policy import CreatePolicy, evaluate_request

logging.basicConfig(
    level=os.environ.get("PROXY_LOG_LEVEL", "INFO"),
    format="%(asctime)s proxy %(levelname)s %(message)s",
)
log = logging.getLogger("docker-socket-proxy")

LISTEN_SOCKET = os.environ.get("PROXY_LISTEN_SOCKET", "/var/run/docker-proxy.sock")
UPSTREAM_SOCKET = os.environ.get("DOCKER_SOCK_PATH", "/var/run/docker-real.sock")

_ALLOWED_BIND_PREFIXES = tuple(
    p for p in os.environ.get("PROXY_ALLOWED_BIND_PREFIXES", "").split(",") if p
)
_POLICY = CreatePolicy(allowed_bind_prefixes=_ALLOWED_BIND_PREFIXES)


# ---------------------------------------------------------------------------
# Minimal HTTP/1.1 message-prefix reading (request line + headers)
# ---------------------------------------------------------------------------

async def _read_headers(reader: asyncio.StreamReader) -> Tuple[bytes, str, Dict[str, str]]:
    """Reads bytes up to and including the blank line that ends HTTP
    headers. Returns (raw_bytes_incl_terminator, first_line, headers)."""
    raw = await reader.readuntil(b"\r\n\r\n")
    text = raw.decode("iso-8859-1")
    lines = text.split("\r\n")
    first_line = lines[0]
    headers: Dict[str, str] = {}
    for line in lines[1:]:
        if not line:
            continue
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    return raw, first_line, headers


async def _read_exact(reader: asyncio.StreamReader, n: int) -> bytes:
    if n <= 0:
        return b""
    return await reader.readexactly(n)


def _deny_response(reason: str) -> bytes:
    body = json.dumps({"message": f"docker-socket-proxy: denied -- {reason}"}).encode()
    return (
        b"HTTP/1.1 403 Forbidden\r\n"
        b"Content-Type: application/json\r\n"
        b"Connection: close\r\n"
        b"Content-Length: " + str(len(body)).encode() + b"\r\n"
        b"\r\n" + body
    )


# ---------------------------------------------------------------------------
# Response relaying with correct HTTP framing
# ---------------------------------------------------------------------------

async def _relay_response(
    upstream_reader: asyncio.StreamReader,
    client_writer: asyncio.StreamWriter,
    upstream_writer: asyncio.StreamWriter,
    client_reader: asyncio.StreamReader,
) -> None:
    """Reads exactly one HTTP response from upstream, writes it to the
    client with correct framing, then closes both sides -- UNLESS the
    response is 101 Switching Protocols, in which case it becomes a raw
    bidirectional relay (docker attach/logs-follow-style hijack) until
    either side closes."""
    try:
        raw_headers, status_line, headers = await _read_headers(upstream_reader)
    except (asyncio.IncompleteReadError, ConnectionError):
        return

    client_writer.write(raw_headers)
    await client_writer.drain()

    status_code = _status_code(status_line)

    if status_code == 101:
        # Hijacked stream (attach/exec-style raw duplex). No more HTTP
        # framing on this connection -- relay raw bytes both ways.
        await _bidirectional_relay(client_reader, client_writer, upstream_reader, upstream_writer)
        return

    content_length = _int_header(headers, "content-length")
    transfer_encoding = headers.get("transfer-encoding", "").lower()

    if content_length is not None:
        body = await _read_exact(upstream_reader, content_length)
        client_writer.write(body)
        await client_writer.drain()
    elif "chunked" in transfer_encoding:
        await _relay_chunked(upstream_reader, client_writer)
    else:
        # Close-delimited: relay until upstream closes.
        while True:
            chunk = await upstream_reader.read(65536)
            if not chunk:
                break
            client_writer.write(chunk)
            await client_writer.drain()


async def _relay_chunked(upstream_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter) -> None:
    while True:
        size_line = await upstream_reader.readline()
        client_writer.write(size_line)
        size_str = size_line.split(b";", 1)[0].strip()
        try:
            size = int(size_str, 16)
        except ValueError:
            break
        if size == 0:
            # Terminal chunk. Optional trailer header lines follow,
            # terminated by a blank line -- readline() already consumed
            # only up to "0\r\n", so read line-by-line (not a fixed
            # byte pattern) until that blank line, which correctly
            # handles both the common no-trailers case (blank line
            # immediately) and the rarer case of real trailer headers.
            while True:
                trailer_line = await upstream_reader.readline()
                client_writer.write(trailer_line)
                if trailer_line in (b"\r\n", b"\n", b""):
                    break
            await client_writer.drain()
            break
        data = await _read_exact(upstream_reader, size)
        crlf = await _read_exact(upstream_reader, 2)  # trailing \r\n after chunk data
        client_writer.write(data + crlf)
        await client_writer.drain()


async def _bidirectional_relay(
    a_reader: asyncio.StreamReader, a_writer: asyncio.StreamWriter,
    b_reader: asyncio.StreamReader, b_writer: asyncio.StreamWriter,
) -> None:
    async def pump(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            while True:
                chunk = await reader.read(65536)
                if not chunk:
                    break
                writer.write(chunk)
                await writer.drain()
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            try:
                writer.write_eof()
            except Exception:
                pass

    await asyncio.gather(
        pump(a_reader, b_writer),
        pump(b_reader, a_writer),
        return_exceptions=True,
    )


def _status_code(status_line: str) -> Optional[int]:
    m = re.match(r"HTTP/\d\.\d\s+(\d+)", status_line)
    return int(m.group(1)) if m else None


def _int_header(headers: Dict[str, str], name: str) -> Optional[int]:
    v = headers.get(name)
    if v is None:
        return None
    try:
        return int(v)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Connection handling
# ---------------------------------------------------------------------------

async def handle_client(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter) -> None:
    upstream_writer: Optional[asyncio.StreamWriter] = None
    try:
        try:
            raw_headers, request_line, headers = await _read_headers(client_reader)
        except (asyncio.IncompleteReadError, ConnectionError):
            return

        parts = request_line.split(" ")
        if len(parts) < 2:
            client_writer.write(_deny_response("malformed request line"))
            await client_writer.drain()
            return
        method, path = parts[0], parts[1]

        content_length = _int_header(headers, "content-length") or 0
        try:
            body = await _read_exact(client_reader, content_length)
        except (asyncio.IncompleteReadError, ConnectionError):
            return

        decision = evaluate_request(method, path, body, _POLICY)
        if not decision.allowed:
            log.warning("DENY %s %s -- %s", method, path, decision.reason)
            client_writer.write(_deny_response(decision.reason))
            await client_writer.drain()
            return

        log.info("ALLOW %s %s", method, path)
        try:
            upstream_reader, upstream_writer = await asyncio.open_unix_connection(UPSTREAM_SOCKET)
        except OSError as e:
            client_writer.write(_deny_response(f"cannot reach real docker socket: {e}"))
            await client_writer.drain()
            return

        upstream_writer.write(raw_headers + body)
        await upstream_writer.drain()

        await _relay_response(upstream_reader, client_writer, upstream_writer, client_reader)

    except (ConnectionError, asyncio.IncompleteReadError):
        pass
    finally:
        for w in (upstream_writer, client_writer):
            if w is not None:
                try:
                    w.close()
                except Exception:
                    pass


async def main() -> None:
    if os.path.exists(LISTEN_SOCKET):
        os.remove(LISTEN_SOCKET)
    server = await asyncio.start_unix_server(handle_client, path=LISTEN_SOCKET)
    os.chmod(LISTEN_SOCKET, 0o666)
    log.info("docker-socket-proxy listening on %s -> %s", LISTEN_SOCKET, UPSTREAM_SOCKET)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
