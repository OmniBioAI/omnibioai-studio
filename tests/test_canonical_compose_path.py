"""Canonical Compose path guards: the Settings page defaults to the root
docker-compose.yml, and the legacy docker/docker-compose.yml heredoc no longer exists as
a Compose file.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_settings_default_uses_canonical_root_compose():
    """Settings.jsx defaults compose_file to the root docker-compose.yml and never
    references docker/docker-compose.yml."""
    settings = (ROOT / "src/ui/pages/Settings.jsx").read_text(encoding="utf-8")
    assert 'compose_file:    "docker-compose.yml"' in settings
    assert '"docker/docker-compose.yml"' not in settings


def test_legacy_heredoc_is_not_presented_as_compose_yaml():
    """The legacy docker/docker-compose.yml path does not exist on disk, so it cannot be
    mistaken for a real Compose file."""
    assert not (ROOT / "docker/docker-compose.yml").exists()
