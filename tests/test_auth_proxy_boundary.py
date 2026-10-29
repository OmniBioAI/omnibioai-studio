"""Exercise the production Auth allowlist and locations with real nginx.

Run in a disposable nginx container (or with nginx on PATH):
python tests/test_auth_proxy_boundary.py
The fixture upstream returns a marker, never live Auth data.
"""
import http.client
from pathlib import Path
import shutil
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
    policy = '\n'.join(block(source, marker) for marker in [
        'map $uri $public_auth_route',
        'map "$request_method:$uri" $auth_login_limit_key',
        'map "$request_method:$uri" $auth_session_limit_key',
    ])
    limits = '\n'.join(line for line in source.splitlines() if line.startswith('limit_req_zone ') or line.startswith('limit_req_status ') or line.startswith('limit_req_log_level '))
    locations = '\n'.join(block(source, name) for name in ['location ^~ /_svc/auth {', 'location ^~ /auth/ {'])
    locations = locations.replace('auth-service:8001', '127.0.0.1:18002')
    with tempfile.TemporaryDirectory(prefix='auth-proxy-test-') as directory:
        config = Path(directory) / 'nginx.conf'
        config.write_text('events {}\nhttp {\n' + limits + '\n' + policy + '\nserver { listen 18001;\n' + locations + '\n}\nserver { listen 18002; location / { return 200 "PUBLIC_UPSTREAM"; } }\n}')
        if shutil.which('docker'):
            container_name = f'router-rate-test-{int(time.time())}'
            process = subprocess.Popen([
                'docker', 'run', '--rm', '--name', container_name,
                '-p', '127.0.0.1:18001:18001', '-p', '127.0.0.1:18002:18002',
                '-v', f'{config}:/etc/nginx/nginx.conf:ro', 'nginx:latest',
                'nginx', '-g', 'daemon off;',
            ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            def stop():
                subprocess.run(['docker', 'stop', container_name], check=False, capture_output=True, timeout=15)
                if process.poll() is None:
                    process.wait(timeout=10)
        else:
            process = subprocess.Popen(['nginx', '-p', directory, '-c', str(config), '-g', 'daemon off;'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            stop = lambda: (process.terminate(), process.wait(timeout=5))
        try:
            for _ in range(300):
                try:
                    connection = http.client.HTTPConnection('127.0.0.1', 18001, timeout=2)
                    connection.request('GET', '/_svc/auth/health')
                    response = connection.getresponse(); response.read(); connection.close()
                    break
                except OSError:
                    if process.poll() is not None:
                        raise AssertionError('nginx test container did not start')
                    time.sleep(.1)
            else: raise AssertionError('nginx test container timed out during startup')
            allowed = ['/_svc/auth', '/_svc/auth/health', '/_svc/auth/auth/login', '/auth/login', '/auth/google/callback', '/_svc/auth/me/preferences', '/_svc/auth/orgs/42/provider-keys/metadata', '/_svc/auth/users/me/mfa/devices', '/_svc/auth/sessions', '/_svc/auth/oauth/token', '/_svc/auth/oauth/token/authorization-code']
            denied = ['/_svc/auth/internal/organizations/42/provider-keys/claude/reveal', '/_svc/auth/service/mint-user-token', '/_svc/auth/service/delegations/toolserver', '/_svc/auth/auth/api-keys/exchange', '/auth/api-keys/exchange', '/_svc/auth/%69nternal/organizations/42/provider-keys/openai/reveal', '/_svc/auth/auth/../internal/x', '/_svc/auth/%2569nternal/x', '/_svc/authHACK/internal/x']
            for path in allowed + denied:
                time.sleep(.01)  # Keep the production rate-limit burst from affecting route assertions.
                connection = http.client.HTTPConnection('127.0.0.1', 18001, timeout=2)
                connection.request('POST' if path in denied else 'GET', path, headers={'X-Provider-Key-Reveal-Secret': 'synthetic'})
                response = connection.getresponse(); body = response.read(); connection.close()
                assert response.status == (200 if path in allowed else 404), (path, response.status)
                assert (body == b'PUBLIC_UPSTREAM') == (path in allowed)
            print(f'{len(allowed)} allowed and {len(denied)} denied routes passed with real nginx')

            def request(method, path):
                connection = http.client.HTTPConnection('127.0.0.1', 18001, timeout=2)
                connection.request(method, path)
                response = connection.getresponse(); response.read(); connection.close()
                return response.status

            me_statuses = []
            for index in range(40):
                if index:
                    time.sleep(.5)
                me_statuses.append(request('GET', '/_svc/auth/me'))
            login_statuses = []
            for index in range(20):
                if index:
                    time.sleep(.5)
                login_statuses.append(request('POST', '/_svc/auth/auth/login'))
            health_statuses = [request('GET', '/_svc/auth/health') for _ in range(80)]
            assert all(status != 429 for status in me_statuses), me_statuses
            assert 429 in login_statuses and login_statuses.index(429) >= 5, login_statuses
            assert all(status != 429 for status in health_statuses), health_statuses
            print(f'/me: {len(me_statuses)} requests, 0 rate-limited')
            print(f'POST login: {login_statuses.count(429)} rate-limited after {login_statuses.index(429)} accepted')
            print(f'health: {len(health_statuses)} requests, 0 rate-limited')
        finally:
            stop()

if __name__ == '__main__': run()
