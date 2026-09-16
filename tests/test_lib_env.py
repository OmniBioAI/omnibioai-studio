"""scripts/lib-env.sh — safe .env loader.

Regression tests for the 2026-09-16 backup-mysql.sh incident: the
previous loader was `source <(grep -v '^#' "$ENV_FILE" | grep -v
'^$')`, which feeds every KEY=VALUE line to the bash parser rather than
treating it as literal text. A rotated secret whose value contained
parentheses produced a bash syntax error under `set -e`, aborting the
script before the dump ever ran -- silently, since stderr only went to
a log file nobody watched. Nightly backups failed for ~5 weeks. See
omnibioai-docs/security/mysql_backup_recovery_evidence.md.

load_env_file() (lib-env.sh) fixes this by parsing KEY=VALUE with pure
parameter expansion -- never source/eval/process-substitution on the
file's contents, so no value's content can break the parser.

Real subprocess execution against synthetic, throwaway .env content --
no real secrets, no docker, no network. Values below are placeholders
invented for this test file only.
"""
import subprocess
import tempfile
from pathlib import Path

LIB = Path(__file__).resolve().parent.parent / "scripts" / "lib-env.sh"


def _load_and_echo(env_content: str, var_names: list[str]) -> subprocess.CompletedProcess:
    with tempfile.TemporaryDirectory() as td:
        env_file = Path(td) / ".env"
        env_file.write_text(env_content, encoding="utf-8")
        echo_lines = "\n".join(f'echo "{v}=${{{v}:-__UNSET__}}"' for v in var_names)
        script = f'''
set -euo pipefail
source "{LIB}"
set -a
load_env_file "{env_file}"
set +a
{echo_lines}
'''
        return subprocess.run(
            ["bash", "-c", script], capture_output=True, text=True, timeout=10
        )


def test_value_with_parentheses_loads_without_syntax_error():
    # The exact shape of the real incident: an unquoted value containing "(" and ")".
    result = _load_and_echo("SECRET_KEY=abc(def)ghi\n", ["SECRET_KEY"])
    assert result.returncode == 0, result.stderr
    assert "syntax error" not in result.stderr
    assert "SECRET_KEY=abc(def)ghi" in result.stdout


def test_value_with_dollar_ampersand_asterisk_bang_hash_loads_literally():
    result = _load_and_echo("SECRET_KEY=a$$b&c*d!e#f\n", ["SECRET_KEY"])
    assert result.returncode == 0, result.stderr
    assert "SECRET_KEY=a$$b&c*d!e#f" in result.stdout


def test_value_with_backtick_does_not_trigger_command_substitution():
    result = _load_and_echo("SECRET_KEY=`whoami`\n", ["SECRET_KEY"])
    assert result.returncode == 0, result.stderr
    # Must load the literal text "`whoami`", not the output of running whoami.
    assert "SECRET_KEY=`whoami`" in result.stdout
    assert result.stdout.count("SECRET_KEY=") == 1


def test_value_containing_quotes_loads_literally():
    result = _load_and_echo('SECRET_KEY=it\'s "quoted" text\n', ["SECRET_KEY"])
    assert result.returncode == 0, result.stderr
    assert """SECRET_KEY=it's "quoted" text""" in result.stdout


def test_comments_and_blank_lines_are_skipped():
    result = _load_and_echo("# a comment\n\nFOO=bar\n", ["FOO"])
    assert result.returncode == 0, result.stderr
    assert "FOO=bar" in result.stdout


def test_export_prefixed_line_is_handled():
    result = _load_and_echo("export FOO=bar\n", ["FOO"])
    assert result.returncode == 0, result.stderr
    assert "FOO=bar" in result.stdout


def test_missing_env_file_is_not_fatal():
    script = f'''
set -euo pipefail
source "{LIB}"
load_env_file "/nonexistent/path/.env"
echo "LOADER_OK"
'''
    result = subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    assert "LOADER_OK" in result.stdout


def test_malformed_line_without_equals_is_skipped_not_fatal():
    # Fail-closed-but-not-crashing: a garbled line is ignored, later
    # well-formed lines still load, and the loader itself never errors.
    result = _load_and_echo("THIS_LINE_HAS_NO_EQUALS_SIGN\nFOO=bar\n", ["FOO"])
    assert result.returncode == 0, result.stderr
    assert "FOO=bar" in result.stdout


def test_value_containing_equals_signs_is_preserved_in_full():
    result = _load_and_echo("SECRET_KEY=a=b=c\n", ["SECRET_KEY"])
    assert result.returncode == 0, result.stderr
    assert "SECRET_KEY=a=b=c" in result.stdout


def test_loader_never_uses_source_eval_or_process_substitution():
    # Structural guard against regressing back to the vulnerable pattern.
    # Only the code matters here -- the header comment deliberately quotes
    # the old broken pattern for incident context, so strip comment lines
    # before checking.
    code_lines = [
        line for line in LIB.read_text(encoding="utf-8").splitlines()
        if not line.strip().startswith("#")
    ]
    code = "\n".join(code_lines)
    assert "source <(" not in code
    assert "eval " not in code
    assert "eval\t" not in code
