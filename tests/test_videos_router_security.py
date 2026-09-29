"""Regression checks for the fail-closed Studio video-service boundary."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "docker" / "nginx-router.conf"
COMPOSE = ROOT / "docker-compose.yml"


def test_video_router_guards_the_original_request_target_before_fallback():
    text = ROUTER.read_text()
    assert "map $request_uri $video_path_invalid" in text
    assert "~*^/_svc/videos(?:/|$|%2f|%5c)[^?]*(?:\\.\\.|%2e|%5c|%25(?:2e|2f|5c)) 1;" in text
    default_server = text[text.index("server {\n    listen 80 default_server;\n    server_name _;"):]
    assert "if ($video_path_invalid) { return 400; }" in default_server
    assert default_server.index("if ($video_path_invalid)") < default_server.index("location ^~ /_svc/videos")
    assert "location / { set $web_ui_upstream web-ui:80; proxy_pass http://$web_ui_upstream; }" in default_server


def test_video_router_keeps_legitimate_proxy_route_and_query_strings():
    text = ROUTER.read_text()
    route = "location ^~ /_svc/videos      { set $videos_upstream videos:8086; rewrite ^/_svc/videos(/.*)$      $1 break; proxy_pass http://$videos_upstream; }"
    assert route in text
    guard = text[text.index("map $request_uri $video_path_invalid"):text.index("map $request_uri $video_path_invalid") + 500]
    assert "[^?]" in guard


def test_video_catalog_and_media_routes_precede_the_studio_spa_fallback():
    text = ROUTER.read_text()
    default_server = text[text.index("server {\n    listen 80 default_server;\n    server_name _;"):]
    catalog = "location = /videos.json       { set $videos_upstream videos:8086; proxy_pass http://$videos_upstream; }"
    media = "location ^~ /videos/           { set $videos_upstream videos:8086; proxy_pass http://$videos_upstream; }"
    fallback = "location / { set $web_ui_upstream web-ui:80; proxy_pass http://$web_ui_upstream; }"
    assert catalog in default_server
    assert media in default_server
    assert default_server.index(catalog) < default_server.index(fallback)
    assert default_server.index(media) < default_server.index(fallback)


def test_video_routes_use_compose_service_name_and_internal_port():
    text = ROUTER.read_text()
    routes = text[text.index("location = /videos.json"):text.index("location = /videos.json") + 500]
    assert "videos:8086" in routes
    assert "127.0.0.1:8086" not in routes


def test_videos_service_does_not_overlay_the_packaged_studio_portal():
    text = COMPOSE.read_text()
    videos = text[text.index("\n  videos:\n"):text.index("\n  opa:", text.index("\n  videos:\n"))]
    assert "${VIDEO_DIR}:/videos:ro" in videos
    assert "/usr/share/nginx/html" not in videos
    assert "/usr/share/nginx/media" not in videos


def test_video_router_guard_covers_required_raw_traversal_shapes():
    text = ROUTER.read_text()
    guard = text[text.index("map $request_uri $video_path_invalid"):text.index("map $request_uri $video_path_invalid") + 500]
    for marker in ("\\.\\.", "%2e", "%5c", "%25(?:2e|2f|5c)"):
        assert marker in guard
