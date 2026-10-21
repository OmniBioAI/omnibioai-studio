"""DGX production security settings for OmniBioAI Workbench.

This module deliberately layers on top of the application's normal settings so
the production-only reverse-proxy and cookie policy remains owned by the DGX
deployment. X-Forwarded-Proto is trusted only from explicitly configured proxy
source IPs. An empty allowlist fails closed and must be replaced with an
observed Cloudflare connector source before HTTPS session qualification.
"""

import os

from .settings import *  # noqa: F403


def _csv(name: str) -> list[str]:
    return [value.strip() for value in os.environ.get(name, "").split(",") if value.strip()]


ALLOWED_HOSTS = _csv("DJANGO_ALLOWED_HOSTS")
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must contain explicit production hostnames")

CSRF_TRUSTED_ORIGINS = _csv("DJANGO_CSRF_TRUSTED_ORIGINS")
if not CSRF_TRUSTED_ORIGINS or any(not origin.startswith("https://") for origin in CSRF_TRUSTED_ORIGINS):
    raise RuntimeError("DJANGO_CSRF_TRUSTED_ORIGINS must contain explicit HTTPS origins")

# Do not trust the forwarded scheme from arbitrary peers on the Compose network.
# Populate this exact-IP allowlist only after observing the connector's source.
TRUSTED_PROXY_IPS = frozenset(_csv("DJANGO_TRUSTED_PROXY_IPS"))


class TrustedProxyProtoMiddleware:
    """Discard forwarded HTTPS claims unless the socket peer is trusted."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.META.get("REMOTE_ADDR") not in TRUSTED_PROXY_IPS:
            request.META.pop("HTTP_X_FORWARDED_PROTO", None)
        return self.get_response(request)


# Run before SecurityMiddleware and any middleware that checks request.is_secure().
MIDDLEWARE = [
    "omnibioai.dgx_production_settings.TrustedProxyProtoMiddleware",
    *MIDDLEWARE,
]

# Keep Host sourced from the actual Host header; the forwarded-host header is
# deliberately ignored. The custom middleware enforces the proxy source boundary.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = False

SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"

# Public HTTP->HTTPS enforcement belongs at Cloudflare.  Enabling a Django
# redirect here would also redirect private Compose-network health and service
# calls, while adding no protection to the HTTPS-only public route.
SECURE_SSL_REDIRECT = False
