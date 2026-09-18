"""Drift guard between the services declared in docker-compose.yml and the service
catalog in docs/SYSTEM_ARCHITECTURE.md.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""

from pathlib import Path

from scripts.check_service_catalog import catalog_services, compose_services, duplicates


def test_compose_and_catalog_match():
    """Compose and the architecture catalog each list exactly 41 services, the two
    service sets are identical, and the catalog has no duplicate entries."""
    root = Path(__file__).resolve().parents[1]
    compose = compose_services(root / "docker-compose.yml")
    catalog = catalog_services(root / "docs" / "SYSTEM_ARCHITECTURE.md")

    assert len(compose) == 41
    assert len(catalog) == 41
    assert set(compose) == set(catalog)
    assert duplicates(catalog) == []
