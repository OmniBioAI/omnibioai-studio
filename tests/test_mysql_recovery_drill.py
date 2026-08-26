from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "mysql-recovery-drill.sh"


def test_drill_is_isolated_and_uses_only_synthetic_data():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "--network none" in text
    assert "MYSQL_ALLOW_EMPTY_PASSWORD=yes" in text
    assert "omnibioai-studio-mysql-1" not in text
    assert ".env" not in text
    assert "readiness_drill" in text
    assert "synthetic-" in text


def test_drill_has_cleanup_and_integrity_checks():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "trap cleanup EXIT" in text
    assert "index_checks=PASS" in text
    assert "constraint_checks=PASS" in text
    assert "rows_after_write" in text
