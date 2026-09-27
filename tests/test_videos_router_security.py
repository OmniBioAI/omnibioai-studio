"""Regression checks for the fail-closed Studio video-service boundary."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "docker" / "nginx-router.conf"


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


def test_video_router_guard_covers_required_raw_traversal_shapes():
    text = ROUTER.read_text()
    guard = text[text.index("map $request_uri $video_path_invalid"):text.index("map $request_uri $video_path_invalid") + 500]
    for marker in ("\\.\\.", "%2e", "%5c", "%25(?:2e|2f|5c)"):
        assert marker in guard
