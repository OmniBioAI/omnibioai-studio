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
                if "json_key" in credential and (
                    not isinstance(credential["json_key"], str)
                    or not re.fullmatch(r"[a-zA-Z0-9_.-]+", credential["json_key"])
                ):
                    raise BootstrapError("credential JSON key reference is invalid")
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
                value = json.loads(value)[ref["json_key"]].encode("utf-8")
            except (UnicodeError, json.JSONDecodeError, KeyError, TypeError, AttributeError):
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
    args = parser.parse_args(argv)
    try:
        if args.command == "inspect":
            print(json.dumps(inspect_acl_file(args.acl_file), sort_keys=True))
        else:
            status = bootstrap(args.data_dir, args.policy, args.credential_dir)
            print(f"redis ACL bootstrap: {status}")
        return 0
    except BootstrapError as exc:
        print(f"redis ACL bootstrap refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
