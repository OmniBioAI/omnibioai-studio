from pathlib import Path

from scripts.safe_compose_diagnostics import dotenv_names, load_compose, report


SECRET_SENTINEL = "must-never-appear-in-output"


def test_report_exposes_names_and_presence_but_never_values(tmp_path: Path):
    compose_path = tmp_path / "compose.yml"
    env_path = tmp_path / ".env"
    compose_path.write_text(
        """
services:
  worker:
    environment:
      CELERY_BROKER_URL: ${CELERY_BROKER_URL}
      OPTIONAL_TOKEN: ${OPTIONAL_TOKEN:-}
    depends_on:
      redis:
        condition: service_started
  redis:
    healthcheck:
      test: [CMD, redis-cli, ping]
""",
        encoding="utf-8",
    )
    env_path.write_text(f"CELERY_BROKER_URL={SECRET_SENTINEL}\n", encoding="utf-8")

    output = report(load_compose(compose_path), dotenv_names(env_path), show_env=True)

    assert "CELERY_BROKER_URL: SET" in output
    assert "OPTIONAL_TOKEN: UNSET" in output
    assert SECRET_SENTINEL not in output
    assert "redis://" not in output


def test_report_does_not_resolve_interpolation_default(tmp_path: Path):
    compose_path = tmp_path / "compose.yml"
    compose_path.write_text(
        f"services:\n  api:\n    environment:\n      API_TOKEN: ${{API_TOKEN:-{SECRET_SENTINEL}}}\n",
        encoding="utf-8",
    )

    output = report(load_compose(compose_path), set(), show_env=True)

    assert "API_TOKEN: UNSET" in output
    assert SECRET_SENTINEL not in output
