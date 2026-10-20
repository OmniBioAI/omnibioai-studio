"""scripts/check-env.sh — regression guard.

check-env.sh had the identical bug as backup-mysql.sh (same
`source <(grep ...)` pattern), which meant the pre-deployment secret
validator would itself crash on the same rotated secret it exists to
help catch problems with. See scripts/lib-env.sh and
omnibioai-docs/security/mysql_backup_recovery_evidence.md.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""
import subprocess
import tempfile
import os
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "check-env.sh"


def _prepare_project(root: Path, *, include_devhub_secret: bool) -> Path:
    (root / "scripts").mkdir()
    lines = [
        "MYSQL_ROOT_PASSWORD=strong-mysql-test-password",
        "AUTH_SECRET_KEY=strong-auth-test-secret-value",
    ]
    if include_devhub_secret:
        lines.append("DEVHUB_INTERNAL_PROXY_SECRET=independent-proxy-test-secret")
    lines.extend([
        "LICENSE_SECRET=strong-license-test-secret",
        "LIMS_PASSWORD=strong-lims-test-password",
        "GF_ADMIN_PASSWORD=strong-grafana-test-password",
        "JUPYTER_TOKEN=strong-jupyter-test-token",
        "RSTUDIO_PASSWORD=strong-rstudio-test-password",
        "VSCODE_PASSWORD=strong-vscode-test-password",
        "MACHINE_DIR=/some/real/path",
        "WORKSPACE_HOST=/some/real/path",
        "WORK_DIR=/some/real/path",
        "DATA_DIR=/some/real/path",
    ])
    (root / ".env").write_text("\n".join(lines) + "\n", encoding="utf-8")
    script_copy = root / "scripts" / "check-env.sh"
    script_copy.write_text(SCRIPT.read_text(encoding="utf-8"), encoding="utf-8")
    for name in ("lib-env.sh", "lib-paths.sh"):
        (root / "scripts" / name).write_text(
            (SCRIPT.parent / name).read_text(encoding="utf-8"), encoding="utf-8"
        )
    return script_copy


def test_uses_the_safe_loader_not_the_vulnerable_pattern():
    """check-env.sh loads its .env through lib-env.sh's load_env_file and its
    non-comment code never uses the source <( ... ) pattern."""
    text = SCRIPT.read_text(encoding="utf-8")
    code_lines = [ln for ln in text.splitlines() if not ln.strip().startswith("#")]
    code = "\n".join(code_lines)
    assert "source <(" not in code
    assert "load_env_file" in code
    assert "lib-env.sh" in code


def test_missing_devhub_secret_does_not_block_non_devhub_environment_check():
    with tempfile.TemporaryDirectory() as td:
        script = _prepare_project(Path(td), include_devhub_secret=False)
        result = subprocess.run(["bash", str(script)], capture_output=True, text=True, timeout=10)
        assert result.returncode == 0, result.stdout + result.stderr
        assert "Dev Hub profile is inactive" in result.stdout


def test_requested_devhub_profile_requires_independent_secret():
    with tempfile.TemporaryDirectory() as td:
        script = _prepare_project(Path(td), include_devhub_secret=False)
        env = dict(os.environ, DEVHUB_ENABLED="true")
        result = subprocess.run(["bash", str(script)], env=env, capture_output=True, text=True, timeout=10)
        assert result.returncode != 0
        assert "DEVHUB_INTERNAL_PROXY_SECRET is not set" in result.stdout


def test_requested_devhub_profile_rejects_jwt_secret_reuse():
    with tempfile.TemporaryDirectory() as td:
        script = _prepare_project(Path(td), include_devhub_secret=False)
        env_file = Path(td) / ".env"
        env_file.write_text(
            env_file.read_text(encoding="utf-8") +
            "DEVHUB_INTERNAL_PROXY_SECRET=strong-auth-test-secret-value\n",
            encoding="utf-8",
        )
        env = dict(os.environ, DEVHUB_ENABLED="true")
        result = subprocess.run(["bash", str(script)], env=env, capture_output=True, text=True, timeout=10)
        assert result.returncode != 0
        assert "must be independent" in result.stdout


def test_survives_a_value_containing_parentheses():
    """check-env.sh exits 0 and reports all critical secrets set when a secret value
    contains parentheses and shell metacharacters; run against a throwaway copy in a
    temp dir."""
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / "scripts").mkdir()
        # check-env.sh resolves ENV_FILE relative to its own script dir.
        (root / ".env").write_text(
            "MYSQL_ROOT_PASSWORD=a-strong-password-(with-parens)\n"
            "AUTH_SECRET_KEY=another-strong-key-!@#$%^&*()\n"
            "DEVHUB_INTERNAL_PROXY_SECRET=independent-proxy-key-!@#$%^&*()\n"
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
        paths_copy = root / "scripts" / "lib-paths.sh"
        paths_copy.write_text(
            (SCRIPT.parent / "lib-paths.sh").read_text(encoding="utf-8"), encoding="utf-8"
        )
        result = subprocess.run(
            ["bash", str(script_copy)], capture_output=True, text=True, timeout=10,
        )
        assert "syntax error" not in result.stderr
        assert result.returncode == 0, result.stdout + result.stderr
        assert "All critical secrets are set" in result.stdout
