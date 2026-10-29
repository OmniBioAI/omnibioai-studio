from pathlib import Path


ROUTER = Path(__file__).parents[1] / "docker/nginx-router.conf"


def test_auth_rate_limits_are_split_and_health_is_exempt():
    nginx = ROUTER.read_text()

    assert 'limit_req_zone $auth_login_limit_key zone=auth_login:10m rate=10r/m;' in nginx
    assert 'limit_req_zone $auth_session_limit_key zone=auth_session:10m rate=120r/m;' in nginx
    assert 'limit_req_status 429;' in nginx
    assert 'limit_req_log_level warn;' in nginx
    assert 'zone=auth_limit:' not in nginx
    assert 'limit_req zone=auth_login burst=5 nodelay;' in nginx
    assert 'limit_req zone=auth_session burst=60 nodelay;' in nginx
    assert '~^[^:]+:/(?:_svc/[^/]+/)?health/?$ "";' in nginx
    assert '~^[^:]+:/health/?$ "";' in nginx
    assert 'zone=api_general:' not in nginx


def test_auth_login_key_only_covers_post_credential_and_invitation_routes():
    nginx = ROUTER.read_text()
    start = nginx.index('map "$request_method:$uri" $auth_login_limit_key {')
    end = nginx.index('\n}', start)
    login_map = nginx[start:end]

    assert 'POST:/auth/(?:login|register|password/(?:forgot|reset)|password-reset|reset-password)' in login_map
    assert 'POST:/users/me/mfa/' in login_map
    assert 'POST:/organization-invitations/(?:preview|mfa-setup|accept|accept-existing)' in login_map
    assert 'POST:/auth/refresh' not in login_map
