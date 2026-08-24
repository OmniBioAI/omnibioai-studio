from pathlib import Path

from scripts.check_service_catalog import catalog_services, compose_services, duplicates


def test_compose_and_catalog_match():
    root = Path(__file__).resolve().parents[1]
    compose = compose_services(root / "docker-compose.yml")
    catalog = catalog_services(root / "docs" / "SYSTEM_ARCHITECTURE.md")

    assert len(compose) == 40
    assert len(catalog) == 40
    assert set(compose) == set(catalog)
    assert duplicates(catalog) == []
