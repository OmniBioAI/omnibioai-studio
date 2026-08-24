from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_settings_default_uses_canonical_root_compose():
    settings = (ROOT / "src/ui/pages/Settings.jsx").read_text(encoding="utf-8")
    assert 'compose_file:    "docker-compose.yml"' in settings
    assert '"docker/docker-compose.yml"' not in settings


def test_legacy_heredoc_is_not_presented_as_compose_yaml():
    assert not (ROOT / "docker/docker-compose.yml").exists()
