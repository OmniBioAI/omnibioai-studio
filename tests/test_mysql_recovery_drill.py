"""Static guards on scripts/mysql-recovery-drill.sh: the recovery drill must stay
isolated from the live MySQL container and use only synthetic data. The script text is
inspected and never executed.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""

from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "mysql-recovery-drill.sh"


def test_drill_is_isolated_and_uses_only_synthetic_data():
    """The script text uses --network none, an empty-password throwaway MySQL and
    synthetic readiness_drill data, and never mentions the live omnibioai-studio-mysql-1
    container or any .env file."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "--network none" in text
    assert "MYSQL_ALLOW_EMPTY_PASSWORD=yes" in text
    assert "omnibioai-studio-mysql-1" not in text
    assert ".env" not in text
    assert "readiness_drill" in text
    assert "synthetic-" in text


def test_drill_has_cleanup_and_integrity_checks():
    """The script text installs an EXIT cleanup trap and contains the index_checks=PASS,
    constraint_checks=PASS and rows_after_write integrity checks."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert "trap cleanup EXIT" in text
    assert "index_checks=PASS" in text
    assert "constraint_checks=PASS" in text
    assert "rows_after_write" in text
