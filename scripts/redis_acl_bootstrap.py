#!/usr/bin/env python3
"""Fail-closed initializer for the tracked, non-secret Redis ACL policy.

Run it as a Compose one-shot initializer before redis-server. It never starts
Redis itself. A new empty data directory gets an ACL file and a non-secret
ownership marker atomically; an existing volume is accepted only when that
marker and the fully rendered ACL match exactly. Unmanaged data and drift are
never overwritten.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
import tempfile
from urllib.parse import unquote_to_bytes, urlsplit
from pathlib import Path
from typing import Any, Mapping


POLICY_VERSION = 1
MARKER_NAME = ".omnibioai-acl-bootstrap.json"
ACL_NAME = "users.acl"
USER_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,64}$")
TOKEN_RE = re.compile(r"^[^\s\x00\r\n]+$")
COMMAND_RE = re.compile(r"^[+-](?:@[a-z0-9_-]+|[a-z0-9|_-]+)$", re.I)
FLAG_ALLOWLIST = {"nopass", "sanitize-payload"}


class BootstrapError(Exception):
    """Safe-to-report failure; messages must never include credential data."""


def _canonical_json(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def load_policy(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_bytes()
        policy = json.loads(raw)
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise BootstrapError("policy file is unavailable or malformed") from None
    validate_policy(policy)
    return policy


def validate_policy(policy: Any) -> None:
    if not isinstance(policy, dict) or policy.get("schema_version") != POLICY_VERSION:
        raise BootstrapError("unsupported ACL policy schema")
    users = policy.get("users")
    if not isinstance(users, list) or not users:
        raise BootstrapError("ACL policy has no users")
    names: set[str] = set()
    for user in users:
        if not isinstance(user, dict):
            raise BootstrapError("ACL policy user entry is malformed")
        name = user.get("name")
        if not isinstance(name, str) or not USER_RE.fullmatch(name) or name in names:
            raise BootstrapError("ACL policy has an invalid or duplicate username")
        names.add(name)
        if not isinstance(user.get("enabled"), bool):
            raise BootstrapError("ACL policy enabled state is malformed")
        credential = user.get("credential")
        if name == "default":
            if user["enabled"] or credential is not None or "nopass" not in user.get("flags", []):
                raise BootstrapError("default user must remain disabled without a credential")
        else:
            if "nopass" in user.get("flags", []):
                raise BootstrapError("named ACL users must not use nopass")
            if not isinstance(credential, dict):
                raise BootstrapError("named ACL user lacks one credential reference")
            if "env" in credential:
                if set(credential) != {"env"} or not isinstance(credential["env"], str) or not re.fullmatch(
                    r"REDIS_[A-Z0-9_]+_PASSWORD", credential["env"]
                ):
                    raise BootstrapError("credential environment reference is invalid")
            elif "file" in credential:
                file_name = credential["file"]
                if set(credential) - {"file", "json_key"} or not isinstance(file_name, str) or Path(file_name).name != file_name:
                    raise BootstrapError("credential file reference is invalid")
                if "json_key" in credential:
                    key = credential["json_key"]
                    if not isinstance(key, str) or not key or len(key) > 256 or any(ord(c) < 0x20 for c in key):
                        raise BootstrapError("credential JSON key reference is invalid")
                    if not re.fullmatch(r"[a-zA-Z0-9_.-]+", key):
                        try:
                            target = urlsplit(key)
                            if (target.scheme not in {"redis", "rediss"} or not target.hostname
                                    or target.port is None or target.username is None
                                    or target.password is not None or target.query or target.fragment):
                                raise ValueError
                        except (ValueError, UnicodeError):
                            raise BootstrapError("credential JSON key reference is invalid") from None
            else:
                raise BootstrapError("unsupported credential reference")
        if not isinstance(user.get("flags"), list) or any(
            flag not in FLAG_ALLOWLIST for flag in user["flags"]
        ):
            raise BootstrapError("ACL policy contains an unsupported user flag")
        for field in ("key_patterns", "channel_patterns", "command_rules"):
            values = user.get(field)
            if not isinstance(values, list) or any(
                not isinstance(value, str) or not TOKEN_RE.fullmatch(value)
                for value in values
            ):
                raise BootstrapError("ACL policy contains malformed rules")
        if any(not COMMAND_RE.fullmatch(rule) for rule in user["command_rules"]):
            raise BootstrapError("ACL policy contains an invalid command rule")
        if not isinstance(user.get("reset_channels"), bool):
            raise BootstrapError("ACL channel reset state is malformed")
        selectors = user.get("selectors")
        if not isinstance(selectors, list):
            raise BootstrapError("ACL selectors are malformed")
        for selector in selectors:
            if not isinstance(selector, dict):
                raise BootstrapError("ACL selector is malformed")
            if (
                not isinstance(selector.get("key_patterns"), list)
                or not isinstance(selector.get("channel_patterns"), list)
                or not isinstance(selector.get("command_rules"), list)
                or not isinstance(selector.get("reset_channels"), bool)
                or any(not isinstance(x, str) or not TOKEN_RE.fullmatch(x) for x in selector["key_patterns"])
                or any(not isinstance(x, str) or not TOKEN_RE.fullmatch(x) for x in selector["channel_patterns"])
                or any(not isinstance(x, str) or not COMMAND_RE.fullmatch(x) for x in selector["command_rules"])
            ):
                raise BootstrapError("ACL selector contains malformed rules")
    if "default" not in names:
        raise BootstrapError("ACL policy must explicitly contain the default user")


def sanitized_acl_metadata(text: str) -> list[dict[str, Any]]:
    """Return safe metadata from ACL LIST/ACL-file text; never return hashes."""
    result: list[dict[str, Any]] = []
    for line in text.splitlines():
        # Redis ACL LIST and users.acl are whitespace-tokenized records. Do
        # not use shell/comment parsing here: a Redis password hash starts
        # with `#` and must be recognized as a token, not a comment.
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = stripped.split()
        if not parts:
            continue
        if parts[0] != "user" or len(parts) < 3:
            raise BootstrapError("ACL text contains an unrecognized record")
        if ("on" in parts[2:]) == ("off" in parts[2:]):
            raise BootstrapError("ACL text has an invalid enabled state")
        name = parts[1]
        if not USER_RE.fullmatch(name):
            raise BootstrapError("ACL text contains an invalid username")
        rules = []
        password_configured = False
        for token in parts[2:]:
            if token.startswith(("#", ">", "<", "!")):
                # Hashes, cleartext passwords, and revoked/legacy password
                # tokens are all suppressed regardless of shape.
                password_configured = True
                continue
            rules.append(token)
        result.append({
            "username": name,
            "enabled": "on" in parts[2:],
            "password_configured": password_configured,
            "sanitized_rules": rules,
        })
    return sorted(result, key=lambda row: row["username"])


def _read_credential(user: Mapping[str, Any], credential_dir: Path) -> bytes:
    ref = user["credential"]
    if "file" in ref:
        file_name = ref["file"]
    else:
        # `env` is the canonical secret-generation reference. Electron
        # materializes it once as an owner-only per-user file; the bootstrap
        # itself consumes only files, never inherited secret environment.
        file_name = user["name"] + ".pass"
    if file_name:
        if credential_dir.is_symlink() or not credential_dir.is_dir():
            raise BootstrapError("credential directory is missing or unsafe")
        directory_stat = credential_dir.stat()
        if stat.S_IMODE(directory_stat.st_mode) & 0o077:
            raise BootstrapError("credential directory permissions must be 0700 or stricter")
        path = credential_dir / file_name
        if path.is_symlink():
            raise BootstrapError("credential file must not be a symlink")
        try:
            file_stat = path.stat()
            if not stat.S_ISREG(file_stat.st_mode) or stat.S_IMODE(file_stat.st_mode) & 0o077:
                raise BootstrapError("credential file permissions must be 0600 or stricter")
            fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            try:
                file_stat = os.fstat(fd)
                if not stat.S_ISREG(file_stat.st_mode) or stat.S_IMODE(file_stat.st_mode) & 0o077:
                    raise BootstrapError("credential file permissions must be 0600 or stricter")
                with os.fdopen(fd, "rb") as stream:
                    fd = -1
                    value = stream.read()
            finally:
                if fd >= 0:
                    os.close(fd)
        except OSError:
            raise BootstrapError("required credential file is missing or unreadable") from None
        if "json_key" in ref:
            try:
                mapping = json.loads(value, object_pairs_hook=_unique_json_object)
                if not isinstance(mapping, dict) or ref["json_key"] not in mapping:
                    raise ValueError
                mapped_value = mapping[ref["json_key"]]
                if not isinstance(mapped_value, str):
                    raise ValueError
                value = mapped_value.encode("utf-8")
            except (UnicodeError, json.JSONDecodeError, KeyError, TypeError, AttributeError, ValueError):
                raise BootstrapError("credential map is malformed or missing the required entry") from None
        if value.endswith(b"\n"):
            value = value[:-1]
    if not 16 <= len(value) <= 4096 or any(c in value for c in (b"\x00", b"\r", b"\n")):
        raise BootstrapError("credential input is empty or malformed")
    return value


def render_acl(policy: Mapping[str, Any], credential_dir: Path) -> bytes:
    validate_policy(policy)
    # Redis ACL files require each non-empty line to begin with `user`; keep
    # provenance in the separate JSON marker, not as an ACL-file comment.
    lines: list[str] = []
    for user in policy["users"]:
        tokens = ["user", user["name"], "on" if user["enabled"] else "off"]
        if user["credential"] is not None:
            password = _read_credential(user, credential_dir)
            tokens.append("#" + hashlib.sha256(password).hexdigest())
        tokens.extend(user["flags"])
        tokens.extend(user["key_patterns"])
        if user["reset_channels"]:
            tokens.append("resetchannels")
        tokens.extend(user["channel_patterns"])
        tokens.extend(user["command_rules"])
        for selector in user["selectors"]:
            group = list(selector["key_patterns"])
            if selector["reset_channels"]:
                group.append("resetchannels")
            group.extend(selector["channel_patterns"])
            group.extend(selector["command_rules"])
            tokens.append("(" + " ".join(group) + ")")
        lines.append(" ".join(tokens))
    return ("\n".join(lines) + "\n").encode("utf-8")


def _policy_digest(policy: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(policy)).hexdigest()


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def _normalized_acl(data: bytes) -> list[str]:
    try:
        text = data.decode("utf-8")
        records = []
        for line in text.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                records.append(" ".join(stripped.split()))
        return sorted(records)
    except (UnicodeError, ValueError):
        raise BootstrapError("existing ACL file is malformed") from None


def _acl_usernames(data: bytes) -> set[str]:
    try:
        result = set()
        for line in data.decode("utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            tokens = stripped.split()
            if len(tokens) < 3 or tokens[0] != "user" or not USER_RE.fullmatch(tokens[1]):
                raise BootstrapError("existing ACL file is malformed")
            if tokens[1] in result:
                raise BootstrapError("existing ACL contains a duplicate identity")
            result.add(tokens[1])
        return result
    except UnicodeError:
        raise BootstrapError("existing ACL file is malformed") from None


def _atomic_write(directory: Path, name: str, contents: bytes) -> None:
    fd, temporary = tempfile.mkstemp(prefix=".redis-acl-", dir=directory)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, directory / name)
        dir_fd = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def bootstrap(data_dir: Path, policy_path: Path, credential_dir: Path) -> str:
    """Create a new ACL or verify an existing managed one; never reconcile drift."""
    try:
        if not data_dir.is_dir() or data_dir.is_symlink():
            raise BootstrapError("Redis data directory is missing or unsafe")
        policy = load_policy(policy_path)
        candidate = render_acl(policy, credential_dir)
        acl_path = data_dir / ACL_NAME
        marker_path = data_dir / MARKER_NAME
        entries = {entry.name for entry in data_dir.iterdir() if entry.name != "lost+found"}

        if acl_path.exists() and marker_path.exists():
            try:
                marker = json.loads(marker_path.read_bytes())
            except (OSError, json.JSONDecodeError):
                raise BootstrapError("managed ACL marker is malformed") from None
            if marker != {"schema_version": 1, "policy_sha256": _policy_digest(policy)}:
                raise BootstrapError("managed ACL policy marker mismatch; refusing drift")
            existing = acl_path.read_bytes()
            expected_users = {user["name"] for user in policy["users"]}
            actual_users = _acl_usernames(existing)
            missing_users = sorted(expected_users - actual_users)
            extra_users = sorted(actual_users - expected_users)
            if missing_users:
                raise BootstrapError("managed ACL is missing identities; refusing drift")
            if extra_users:
                raise BootstrapError("managed ACL has unexpected extra identities; refusing drift")
            if _normalized_acl(existing) != _normalized_acl(candidate):
                raise BootstrapError("managed ACL policy mismatch; refusing drift")
            return "managed-match"

        if acl_path.exists() or marker_path.exists():
            raise BootstrapError("incomplete or unmanaged ACL state; explicit reconciliation required")

        allowed_empty_volume_entries = {"lost+found"}
        if entries - allowed_empty_volume_entries:
            raise BootstrapError("non-empty volume has no managed ACL; refusing fresh-volume bootstrap")

        marker = _canonical_json({
            "schema_version": 1,
            "policy_sha256": _policy_digest(policy),
        })
        _atomic_write(data_dir, ACL_NAME, candidate)
        _atomic_write(data_dir, MARKER_NAME, marker)
        return "initialized"
    except BootstrapError:
        raise
    except OSError:
        raise BootstrapError("ACL bootstrap I/O failed; no reconciliation attempted") from None


def _validate_existing(data_dir: Path, policy: Mapping[str, Any], candidate: bytes) -> bytes:
    acl_path = data_dir / ACL_NAME
    marker_path = data_dir / MARKER_NAME
    try:
        if marker_path.is_symlink() or not marker_path.is_file():
            raise BootstrapError("managed ACL marker is missing or unsafe")
        marker = json.loads(marker_path.read_bytes(), object_pairs_hook=_unique_json_object)
        if marker != {"schema_version": 1, "policy_sha256": _policy_digest(policy)}:
            raise BootstrapError("managed ACL policy marker mismatch; refusing drift")
        if acl_path.is_symlink() or not acl_path.is_file():
            raise BootstrapError("managed ACL file is missing or unsafe")
        existing = acl_path.read_bytes()
    except BootstrapError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError, TypeError):
        raise BootstrapError("managed ACL state is malformed") from None
    expected_users = {user["name"] for user in policy["users"]}
    actual_users = _acl_usernames(existing)
    if actual_users != expected_users:
        raise BootstrapError("managed ACL identity set mismatch; refusing drift")
    metadata = sanitized_acl_metadata(existing.decode("utf-8"))
    default = next((row for row in metadata if row["username"] == "default"), None)
    if default is None or default["enabled"]:
        raise BootstrapError("default ACL identity must remain disabled")
    if _normalized_acl(existing) != _normalized_acl(candidate):
        raise BootstrapError("managed ACL policy mismatch; refusing drift")
    return existing


def _atomic_create_exclusive(directory: Path, name: str, contents: bytes) -> None:
    """Publish one file atomically without replacing an existing directory entry."""
    fd, temporary = tempfile.mkstemp(prefix=".redis-acl-marker-", dir=directory)
    temp_path = Path(temporary)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temp_path, directory / name, follow_symlinks=False)
        temp_path.unlink()
        dir_fd = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except FileExistsError:
        try:
            temp_path.unlink()
        except OSError:
            pass
        raise BootstrapError("ownership marker already exists; refusing adoption") from None
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            temp_path.unlink()
        except OSError:
            pass
        raise


def adopt(data_dir: Path, policy_path: Path, credential_dir: Path) -> str:
    """Mark an exact pre-existing ACL volume as managed without changing ACL bytes."""
    try:
        if data_dir.is_symlink() or not data_dir.is_dir():
            raise BootstrapError("Redis data directory is missing or unsafe")
        policy = load_policy(policy_path)
        candidate = render_acl(policy, credential_dir)
        acl_path = data_dir / ACL_NAME
        marker_path = data_dir / MARKER_NAME
        entries = {entry.name for entry in data_dir.iterdir() if entry.name != "lost+found"}
        if marker_path.exists() or marker_path.is_symlink():
            _validate_existing(data_dir, policy, candidate)
            return "managed-match"
        if not entries:
            raise BootstrapError("adoption requires a non-empty pre-existing volume")
        if acl_path.is_symlink() or not acl_path.is_file():
            raise BootstrapError("adoption requires a regular existing ACL file")
        existing = acl_path.read_bytes()
        expected_users = {user["name"] for user in policy["users"]}
        if _acl_usernames(existing) != expected_users:
            raise BootstrapError("existing ACL identity set mismatch; refusing adoption")
        metadata = sanitized_acl_metadata(existing.decode("utf-8"))
        default = next((row for row in metadata if row["username"] == "default"), None)
        if default is None or default["enabled"]:
            raise BootstrapError("default ACL identity must remain disabled")
        if _normalized_acl(existing) != _normalized_acl(candidate):
            raise BootstrapError("existing ACL differs from canonical policy; refusing adoption")
        marker = _canonical_json({
            "schema_version": 1,
            "policy_sha256": _policy_digest(policy),
        })
        _atomic_create_exclusive(data_dir, MARKER_NAME, marker)
        return "adopted"
    except BootstrapError:
        raise
    except (OSError, UnicodeError, ValueError):
        raise BootstrapError("adoption validation failed; no ACL reconciliation attempted") from None


def materialize_rag_credential(source_path: Path, credential_dir: Path) -> str:
    """Safely preserve the password in an existing redis_rag_cache URL."""
    try:
        if source_path.is_symlink() or not source_path.is_file():
            raise BootstrapError("RAG credential source is missing or unsafe")
        source_stat = source_path.stat()
        if stat.S_IMODE(source_stat.st_mode) & 0o077:
            raise BootstrapError("RAG credential source permissions are unsafe")
        source = source_path.read_text(encoding="utf-8")
        matches = [line.partition("=")[2] for line in source.splitlines()
                   if line.startswith("CACHE_REDIS_URL=")]
        if len(matches) != 1 or not matches[0]:
            raise BootstrapError("RAG credential source is missing or ambiguous")
        parsed = urlsplit(matches[0])
        if parsed.scheme not in {"redis", "rediss"} or not parsed.hostname or parsed.port is None:
            raise BootstrapError("RAG credential URL is malformed")
        if parsed.username is None or unquote_to_bytes(parsed.username).decode("utf-8") != "redis_rag_cache":
            raise BootstrapError("RAG credential URL identity is invalid")
        if parsed.password is None or parsed.query or parsed.fragment:
            raise BootstrapError("RAG credential URL is malformed")
        password = unquote_to_bytes(parsed.password)
        if not 16 <= len(password) <= 4096 or any(char in password for char in (0, 10, 13)):
            raise BootstrapError("RAG credential URL password is malformed")

        parent = credential_dir.parent
        if parent.is_symlink() or not parent.is_dir() or stat.S_IMODE(parent.stat().st_mode) != 0o700:
            raise BootstrapError("credential parent directory permissions must be 0700")
        if credential_dir.exists() or credential_dir.is_symlink():
            if credential_dir.is_symlink() or not credential_dir.is_dir():
                raise BootstrapError("credential directory is unsafe")
            if stat.S_IMODE(credential_dir.stat().st_mode) != 0o700:
                raise BootstrapError("credential directory permissions must be 0700")
        else:
            credential_dir.mkdir(mode=0o700)
        destination = credential_dir / "redis_rag_cache.pass"
        if destination.exists() or destination.is_symlink():
            if destination.is_symlink() or not destination.is_file():
                raise BootstrapError("existing RAG credential file is unsafe")
            dest_stat = destination.stat()
            if stat.S_IMODE(dest_stat.st_mode) != 0o600:
                raise BootstrapError("existing RAG credential file permissions must be 0600")
            if destination.read_bytes() != password:
                raise BootstrapError("existing RAG credential differs; refusing overwrite")
            return "already-present"
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(destination, flags, 0o600)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(password)
                stream.flush()
                os.fsync(stream.fileno())
        except Exception:
            try:
                destination.unlink()
            except OSError:
                pass
            raise
        dir_fd = os.open(credential_dir, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
        return "created"
    except BootstrapError:
        raise
    except Exception:
        # Never echo parser, path, or URL values: they may contain credentials.
        raise BootstrapError("RAG credential materialization failed safely") from None


def inspect_acl_file(path: Path) -> list[dict[str, Any]]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        raise BootstrapError("ACL input is unavailable") from None
    return sanitized_acl_metadata(text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    boot = sub.add_parser("bootstrap")
    boot.add_argument("--policy", type=Path, required=True)
    boot.add_argument("--data-dir", type=Path, required=True)
    boot.add_argument("--credential-dir", type=Path, required=True)
    inspect = sub.add_parser("inspect")
    inspect.add_argument("--acl-file", type=Path, required=True)
    adoption = sub.add_parser("adopt")
    adoption.add_argument("--policy", type=Path, required=True)
    adoption.add_argument("--data-dir", type=Path, required=True)
    adoption.add_argument("--credential-dir", type=Path, required=True)
    rag = sub.add_parser("materialize-rag-credential")
    rag.add_argument("--source", type=Path, required=True)
    rag.add_argument("--credential-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "inspect":
            print(json.dumps(inspect_acl_file(args.acl_file), sort_keys=True))
        elif args.command == "adopt":
            status = adopt(args.data_dir, args.policy, args.credential_dir)
            print(f"redis ACL adoption: {status}")
        elif args.command == "materialize-rag-credential":
            status = materialize_rag_credential(args.source, args.credential_dir)
            print(f"RAG credential materialization: {status}")
        else:
            status = bootstrap(args.data_dir, args.policy, args.credential_dir)
            print(f"redis ACL bootstrap: {status}")
        return 0
    except BootstrapError as exc:
        print(f"redis ACL bootstrap refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
