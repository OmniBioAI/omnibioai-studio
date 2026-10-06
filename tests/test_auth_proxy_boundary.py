"""Exercise the production Auth allowlist and locations with real nginx.

Run in a disposable nginx image (no external network needed):
python tests/test_auth_proxy_boundary.py requires nginx on PATH.
The fixture upstream returns a marker, never live Auth data.
"""
import http.client
from pathlib import Path
import re
import subprocess
import tempfile
import time


def block(source, marker):
    start = source.index(marker)
    opening = source.index('{', start)
    depth = 1
    for end in range(opening + 1, len(source)):
        depth += (source[end] == '{') - (source[end] == '}')
        if depth == 0:
            return source[start:end + 1]
    raise AssertionError('Unclosed nginx block')


def run():
    source = Path('docker/nginx-router.conf').read_text()
    policy = block(source, 'map $uri $public_auth_route')
    locations = '\n'.join(block(source, name) for name in ['location ^~ /_svc/auth {', 'location ^~ /auth/ {'])
    locations = locations.replace('auth-service:8001', '127.0.0.1:18002')
    with tempfile.TemporaryDirectory(prefix='auth-proxy-test-') as directory:
        config = Path(directory) / 'nginx.conf'
        config.write_text('events {}\nhttp {\nlimit_req_zone $binary_remote_addr zone=auth_limit:1m rate=1000r/s;\n' + policy + '\nserver { listen 18001;\n' + locations + '\n}\nserver { listen 18002; location / { return 200 "PUBLIC_UPSTREAM"; } }\n}')
        process = subprocess.Popen(['nginx', '-p', directory, '-c', str(config), '-g', 'daemon off;'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            for _ in range(50):
                try:
                    connection = http.client.HTTPConnection('127.0.0.1', 18001, timeout=2)
                    connection.request('GET', '/_svc/auth/health')
                    response = connection.getresponse(); response.read(); connection.close()
                    break
                except OSError:
                    time.sleep(.02)
            else: raise AssertionError('nginx did not start: ' + process.stderr.read().decode())
            allowed = ['/_svc/auth', '/_svc/auth/health', '/_svc/auth/auth/login', '/auth/login', '/auth/google/callback', '/_svc/auth/me/preferences', '/_svc/auth/orgs/42/provider-keys/metadata', '/_svc/auth/users/me/mfa/devices', '/_svc/auth/sessions', '/_svc/auth/oauth/token/authorization-code']
            denied = ['/_svc/auth/internal/organizations/42/provider-keys/claude/reveal', '/_svc/auth/service/mint-user-token', '/_svc/auth/service/delegations/toolserver', '/_svc/auth/auth/api-keys/exchange', '/auth/api-keys/exchange', '/_svc/auth/oauth/token', '/_svc/auth/%69nternal/organizations/42/provider-keys/openai/reveal', '/_svc/auth/auth/../internal/x', '/_svc/auth/%2569nternal/x', '/_svc/authHACK/internal/x']
            for path in allowed + denied:
                time.sleep(.01)  # Keep the production rate-limit burst from affecting route assertions.
                connection = http.client.HTTPConnection('127.0.0.1', 18001, timeout=2)
                connection.request('POST' if path in denied else 'GET', path, headers={'X-Provider-Key-Reveal-Secret': 'synthetic'})
                response = connection.getresponse(); body = response.read(); connection.close()
                assert response.status == (200 if path in allowed else 404), (path, response.status)
                assert (body == b'PUBLIC_UPSTREAM') == (path in allowed)
            print(f'{len(allowed)} allowed and {len(denied)} denied routes passed with real nginx')
        finally:
            process.terminate(); process.wait(timeout=5)

if __name__ == '__main__': run()
