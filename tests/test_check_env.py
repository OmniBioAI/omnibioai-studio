"""scripts/check-env.sh — regression guard.

check-env.sh had the identical bug as backup-mysql.sh (same
`source <(grep ...)` pattern), which meant the pre-deployment secret
validator would itself crash on the same rotated secret it exists to
help catch problems with. See scripts/lib-env.sh and
omnibioai-docs/security/mysql_backup_recovery_evidence.md.
"""
import subprocess
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "check-env.sh"


def test_uses_the_safe_loader_not_the_vulnerable_pattern():
    text = SCRIPT.read_text(encoding="utf-8")
    code_lines = [ln for ln in text.splitlines() if not ln.strip().startswith("#")]
    code = "\n".join(code_lines)
    assert "source <(" not in code
    assert "load_env_file" in code
    assert "lib-env.sh" in code


def test_survives_a_value_containing_parentheses():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / "scripts").mkdir()
        # check-env.sh resolves ENV_FILE relative to its own script dir.
        (root / ".env").write_text(
            "MYSQL_ROOT_PASSWORD=a-strong-password-(with-parens)\n"
            "AUTH_SECRET_KEY=another-strong-key-!@#$%^&*()\n"
            "LICENSE_SECRET=yet-another-strong-one\n"
            "LIMS_PASSWORD=also-strong\n"
            "GF_ADMIN_PASSWORD=also-strong\n"
            "JUPYTER_TOKEN=also-strong\n"
            "RSTUDIO_PASSWORD=also-strong\n"
            "VSCODE_PASSWORD=also-strong\n"
            "MACHINE_DIR=/some/real/path\n"
            "WORKSPACE_HOST=/some/real/path\n"
            "WORK_DIR=/some/real/path\n"
            "DATA_DIR=/some/real/path\n",
            encoding="utf-8",
        )
        script_copy = root / "scripts" / "check-env.sh"
        script_copy.write_text(SCRIPT.read_text(encoding="utf-8"), encoding="utf-8")
        lib_copy = root / "scripts" / "lib-env.sh"
        lib_copy.write_text(
            (SCRIPT.parent / "lib-env.sh").read_text(encoding="utf-8"), encoding="utf-8"
        )
        result = subprocess.run(
            ["bash", str(script_copy)], capture_output=True, text=True, timeout=10,
        )
        assert "syntax error" not in result.stderr
        assert result.returncode == 0, result.stdout + result.stderr
        assert "All critical secrets are set" in result.stdout
