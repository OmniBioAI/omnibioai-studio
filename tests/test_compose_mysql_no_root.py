"""Static checks on the dev/DGX docker-compose.yml mysql service: the
healthcheck needs no root account and no password, and the root password
reaches the container only through a compose secret file.

Purely static (no docker daemon), same approach as
test_compose_network_exposure.py. The behaviour itself (unhealthy during
the init-phase temporary server, healthy after, healthy with root@'%'
dropped, unhealthy with mysqld stopped) was verified on a throwaway
mysql:8.0 container; see docs/MYSQL-ROOT-PASSWORD-FILE.md.

Developer:
    Manish Kumar <manish@omnibioai.org>
"""
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent


def _compose():
    return yaml.safe_load((REPO_ROOT / "docker-compose.yml").read_text())


def _mysql():
    return _compose()["services"]["mysql"]


def test_healthcheck_uses_no_root_and_no_password():
    """Exec form, no shell, no -p/--password, and never the root user."""
    test = _mysql()["healthcheck"]["test"]
    assert test[0] == "CMD", "exec form: no shell, so no variable expansion into argv"
    args = test[1:]
    assert args[0] == "mysqladmin" and "ping" in args
    assert not any(a.startswith("-p") or a.startswith("--password") for a in args)
    assert "root" not in args and "-uroot" not in args
    assert not any("MYSQL_ROOT_PASSWORD" in a for a in args)
    assert "--no-defaults" in args, "must not pick up credentials from an option file"


def test_healthcheck_is_tcp_to_loopback():
    """TCP to 127.0.0.1: the entrypoint's init-phase temporary server runs
    with networking off, so it must not answer this probe."""
    args = _mysql()["healthcheck"]["test"]
    assert "--protocol=TCP" in args
    assert args[args.index("-h") + 1] == "127.0.0.1"


def test_root_password_comes_from_secret_file():
    mysql = _mysql()
    env = mysql["environment"]
    assert "MYSQL_ROOT_PASSWORD" not in env
    assert env["MYSQL_ROOT_PASSWORD_FILE"] == "/run/secrets/mysql-root-password"
    assert "mysql-root-password" in mysql["secrets"]
    secret = _compose()["secrets"]["mysql-root-password"]
    assert secret["file"].startswith("${MYSQL_ROOT_PASSWORD_SECRET_FILE:?"), "fail closed when unset"
