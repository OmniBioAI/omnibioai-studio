"""Tests for the canonical Redis ACL renderer/bootstrap.

The optional integration case starts only a disposable Redis 7 container on
Docker's isolated `none` network. It never reads or mutates production Redis.
Run it with RUN_REDIS_DOCKER_TESTS=1.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import redis_acl_bootstrap as acl  # noqa: E402


POLICY_PATH = ROOT / "config/redis/acl-policy.json"


class RedisAclBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="redis-acl-test-")
        self.root = Path(self.temp.name)
        self.data = self.root / "data"
        self.data.mkdir(mode=0o700)
        self.creds = self.root / "credentials"
        self.creds.mkdir(mode=0o700)
        self.policy = acl.load_policy(POLICY_PATH)
        self.credentials = {}
        for user in self.policy["users"]:
            ref = user["credential"]
            if ref is None:
                continue
            synthetic = ("test-only-" + user["name"] + "-credential-value").encode()
            self.credentials[user["name"]] = synthetic.decode()
            file_name = ref.get("file", user["name"] + ".pass")
            path = self.creds / file_name
            if "json_key" in ref:
                path.write_text(json.dumps({ref["json_key"]: synthetic.decode()}))
            else:
                path.write_bytes(synthetic + b"\n")
            path.chmod(0o600)

    def tearDown(self):
        self.temp.cleanup()

    def boot(self):
        return acl.bootstrap(self.data, POLICY_PATH, self.creds)

    def test_policy_is_26_users_with_default_off_and_exact_rag_target_separate(self):
        self.assertEqual(len(self.policy["users"]), 26)
        default = next(u for u in self.policy["users"] if u["name"] == "default")
        self.assertFalse(default["enabled"])
        self.assertIsNone(default["credential"])
        self.assertIn("nopass", default["flags"])
        cache_manager = next(u for u in self.policy["users"] if u["name"] == "redis_cache_manager")
        self.assertEqual(cache_manager["key_patterns"], ["~omnibioai:cache:*", "~cache-manager-lock:*"])
        self.assertEqual(cache_manager["command_rules"], ["-@all", "+ping", "+get", "+set", "+del", "+scan", "+eval", "+evalsha"])
        monitoring = next(u for u in self.policy["users"] if u["name"] == "redis_monitoring")
        self.assertEqual(monitoring["credential"], {
            "file": "redis_exporter_passwords.json",
            "json_key": "redis://redis_monitoring@redis:6379",
        })
        rag_target = json.loads((ROOT / "config/redis/rag-cache-target-policy.json").read_text())
        self.assertEqual(rag_target["status"], "future-contract-not-assigned-to-a-production-identity")
        self.assertEqual(rag_target["commands"], ["PING", "GET", "SETEX", "DEL", "ZADD", "ZRANGE", "ZRANGEBYLEX", "ZREM", "ZCARD", "MULTI", "EXEC"])
        self.assertEqual(rag_target["key_patterns"], ["~rag:query:*", "~rag:studies_list"])

    def test_empty_volume_bootstraps_acl_and_secret_safe_inspection(self):
        self.assertEqual(self.boot(), "initialized")
        acl_path = self.data / acl.ACL_NAME
        self.assertEqual(acl_path.stat().st_mode & 0o777, 0o600)
        rendered = acl_path.read_text()
        self.assertNotIn("test-only-", rendered)
        safe = acl.inspect_acl_file(acl_path)
        self.assertEqual(len(safe), 26)
        self.assertFalse(next(x for x in safe if x["username"] == "default")["enabled"])
        self.assertTrue(all(x["password_configured"] for x in safe if x["username"] != "default"))
        self.assertNotIn("#", json.dumps(safe))
        self.assertNotIn("test-only-", json.dumps(safe))

    def test_idempotent_managed_bootstrap_does_not_rewrite(self):
        self.assertEqual(self.boot(), "initialized")
        before_acl = (self.data / acl.ACL_NAME).read_bytes()
        before_marker = (self.data / acl.MARKER_NAME).read_bytes()
        self.assertEqual(self.boot(), "managed-match")
        self.assertEqual((self.data / acl.ACL_NAME).read_bytes(), before_acl)
        self.assertEqual((self.data / acl.MARKER_NAME).read_bytes(), before_marker)

    def test_missing_or_malformed_credential_fails_before_publication(self):
        path = self.creds / "redis_auth.pass"
        path.unlink()
        with self.assertRaisesRegex(acl.BootstrapError, "credential file is missing"):
            self.boot()
        self.assertFalse((self.data / acl.ACL_NAME).exists())
        path.write_text("bad\ninput-that-must-not-leak")
        path.chmod(0o600)
        with self.assertRaisesRegex(acl.BootstrapError, "malformed"):
            self.boot()
        self.assertFalse((self.data / acl.ACL_NAME).exists())

    def test_exporter_map_uses_exact_target_key_and_fails_closed(self):
        path = self.creds / "redis_exporter_passwords.json"
        ref = next(u["credential"] for u in self.policy["users"] if u["name"] == "redis_monitoring")
        expected = ref["json_key"]
        value = self.credentials["redis_monitoring"]
        self.assertEqual(acl._read_credential({"name": "redis_monitoring", "credential": ref}, self.creds), value.encode())
        path.write_text(json.dumps({"wrong-target-key": value}), encoding="utf-8")
        with self.assertRaises(acl.BootstrapError):
            acl._read_credential({"name": "redis_monitoring", "credential": ref}, self.creds)
        path.write_text("{\"" + expected + "\":\"" + value + "\",\"" + expected + "\":\"other-value\"}", encoding="utf-8")
        with self.assertRaises(acl.BootstrapError):
            acl._read_credential({"name": "redis_monitoring", "credential": ref}, self.creds)
        path.write_text(json.dumps({expected: [value]}), encoding="utf-8")
        with self.assertRaises(acl.BootstrapError):
            acl._read_credential({"name": "redis_monitoring", "credential": ref}, self.creds)
        path.write_text("{malformed synthetic map", encoding="utf-8")
        with self.assertRaises(acl.BootstrapError) as caught:
            acl._read_credential({"name": "redis_monitoring", "credential": ref}, self.creds)
        self.assertNotIn(value, str(caught.exception))
        path.write_text('{"' + expected + '":"' + value + '","' + expected + '":"other-value"}', encoding="utf-8")
        with self.assertRaises(acl.BootstrapError):
            acl._read_credential({"name": "redis_monitoring", "credential": ref}, self.creds)

    def _existing_unmanaged_acl(self):
        (self.data / acl.ACL_NAME).write_bytes(acl.render_acl(self.policy, self.creds))
        (self.data / "dump.rdb").write_bytes(b"disposable fixture")

    def test_adoption_is_marker_only_atomic_and_idempotent(self):
        self._existing_unmanaged_acl()
        acl_path = self.data / acl.ACL_NAME
        before_bytes = acl_path.read_bytes()
        before_stat = acl_path.stat()
        self.assertEqual(acl.adopt(self.data, POLICY_PATH, self.creds), "adopted")
        self.assertEqual(acl_path.read_bytes(), before_bytes)
        after_stat = acl_path.stat()
        self.assertEqual((after_stat.st_ino, after_stat.st_mode, after_stat.st_mtime_ns),
                         (before_stat.st_ino, before_stat.st_mode, before_stat.st_mtime_ns))
        self.assertEqual(acl.adopt(self.data, POLICY_PATH, self.creds), "managed-match")
        self.assertEqual(acl_path.read_bytes(), before_bytes)
        marker = json.loads((self.data / acl.MARKER_NAME).read_text())
        self.assertEqual(marker, {"schema_version": 1, "policy_sha256": acl._policy_digest(self.policy)})
        self.assertNotIn("test-only-", json.dumps(marker))

    def test_adoption_uses_protected_files_not_inherited_stale_environment(self):
        self._existing_unmanaged_acl()
        previous = os.environ.get("REDIS_AUTH_PASSWORD")
        os.environ["REDIS_AUTH_PASSWORD"] = "stale-synthetic-env-value"
        try:
            self.assertEqual(acl.adopt(self.data, POLICY_PATH, self.creds), "adopted")
        finally:
            if previous is None:
                os.environ.pop("REDIS_AUTH_PASSWORD", None)
            else:
                os.environ["REDIS_AUTH_PASSWORD"] = previous

    def test_adoption_refuses_default_enabled_identity_and_rule_drift(self):
        rendered = acl.render_acl(self.policy, self.creds)
        cases = [
            (rendered.replace(b"user default off", b"user default on", 1), "default"),
            (b"\n".join(line for line in rendered.splitlines() if not line.startswith(b"user redis_healthcheck ")) + b"\n", "identity"),
            (rendered + b"user unexpected on #" + b"a" * 64 + b" -@all\n", "identity"),
            (rendered.replace(b"+ping", b"+info", 1), "differs from canonical"),
            (rendered.replace(b"~rag:query:*", b"~other:*", 1), "differs from canonical"),
            (rendered.replace(b"user redis_healthcheck on", b"user redis_healthcheck off", 1), "differs from canonical"),
            (b"user redis_admin on #" + b"x" * 64 + b" -@all\n", "identity"),
        ]
        for contents, message in cases:
            with self.subTest(message=message, fixture="synthetic"):
                (self.data / acl.ACL_NAME).write_bytes(contents)
                (self.data / "dump.rdb").write_bytes(b"fixture")
                with self.assertRaisesRegex(acl.BootstrapError, message):
                    acl.adopt(self.data, POLICY_PATH, self.creds)
                self.assertEqual((self.data / acl.ACL_NAME).read_bytes(), contents)
                self.assertFalse((self.data / acl.MARKER_NAME).exists())

    def test_adoption_refuses_missing_credentials_malformed_acl_and_existing_bad_marker(self):
        self._existing_unmanaged_acl()
        credential = self.creds / "redis_auth.pass"
        original = credential.read_bytes()
        credential.unlink()
        with self.assertRaisesRegex(acl.BootstrapError, "credential file is missing"):
            acl.adopt(self.data, POLICY_PATH, self.creds)
        credential.write_bytes(original)
        credential.chmod(0o600)
        acl_path = self.data / acl.ACL_NAME
        acl_path.write_bytes(b"not an ACL record\n")
        with self.assertRaises(acl.BootstrapError):
            acl.adopt(self.data, POLICY_PATH, self.creds)
        acl_path.write_bytes(acl.render_acl(self.policy, self.creds))
        (self.data / acl.MARKER_NAME).write_text('{"schema_version":1,"policy_sha256":"wrong"}')
        with self.assertRaises(acl.BootstrapError):
            acl.adopt(self.data, POLICY_PATH, self.creds)

    def test_adoption_refuses_when_credential_verifier_does_not_match(self):
        self._existing_unmanaged_acl()
        credential = self.creds / "redis_auth.pass"
        credential.write_bytes(b"different-synthetic-auth-credential\n")
        credential.chmod(0o600)
        acl_before = (self.data / acl.ACL_NAME).read_bytes()
        with self.assertRaisesRegex(acl.BootstrapError, "differs from canonical"):
            acl.adopt(self.data, POLICY_PATH, self.creds)
        self.assertEqual((self.data / acl.ACL_NAME).read_bytes(), acl_before)
        self.assertFalse((self.data / acl.MARKER_NAME).exists())

    def test_adoption_marker_failure_leaves_no_partial_marker_or_acl_change(self):
        self._existing_unmanaged_acl()
        acl_before = (self.data / acl.ACL_NAME).read_bytes()
        original = acl._atomic_create_exclusive
        def fail_marker(*_args):
            raise OSError("synthetic marker failure")
        acl._atomic_create_exclusive = fail_marker
        try:
            with self.assertRaises(acl.BootstrapError):
                acl.adopt(self.data, POLICY_PATH, self.creds)
        finally:
            acl._atomic_create_exclusive = original
        self.assertFalse((self.data / acl.MARKER_NAME).exists())
        self.assertEqual((self.data / acl.ACL_NAME).read_bytes(), acl_before)
    def test_unsafe_credential_permissions_fail_closed(self):
        path = self.creds / "redis_admin.pass"
        path.chmod(0o644)
        with self.assertRaisesRegex(acl.BootstrapError, "permissions"):
            self.boot()
        self.assertFalse((self.data / acl.ACL_NAME).exists())

    def test_malformed_policy_fails_closed(self):
        bad = self.root / "bad.json"
        bad.write_text('{"schema_version":1,"users":[]}')
        with self.assertRaises(acl.BootstrapError):
            acl.bootstrap(self.data, bad, self.creds)
        self.assertEqual(list(self.data.iterdir()), [])

    def test_unmanaged_acl_is_not_overwritten(self):
        existing = b"user default off -@all\n"
        (self.data / acl.ACL_NAME).write_bytes(existing)
        with self.assertRaisesRegex(acl.BootstrapError, "unmanaged ACL"):
            self.boot()
        self.assertEqual((self.data / acl.ACL_NAME).read_bytes(), existing)

    def test_nonempty_volume_without_acl_is_not_treated_as_fresh(self):
        (self.data / "dump.rdb").write_bytes(b"synthetic disposable marker")
        with self.assertRaisesRegex(acl.BootstrapError, "non-empty volume"):
            self.boot()
        self.assertFalse((self.data / acl.ACL_NAME).exists())

    def test_managed_missing_identity_extra_identity_and_policy_drift_refuse(self):
        self.boot()
        path = self.data / acl.ACL_NAME
        original = path.read_bytes()
        rows = original.splitlines(keepends=True)
        path.write_bytes(b"".join(row for row in rows if b"redis_healthcheck " not in row))
        with self.assertRaisesRegex(acl.BootstrapError, "missing identities"):
            self.boot()
        path.write_bytes(original + b"user unexpected on #" + b"a" * 64 + b" -@all\n")
        with self.assertRaisesRegex(acl.BootstrapError, "unexpected extra identities"):
            self.boot()
        path.write_bytes(original.replace(b"+ping", b"+info", 1))
        with self.assertRaisesRegex(acl.BootstrapError, "policy mismatch"):
            self.boot()

    def test_incomplete_marker_or_wrong_policy_marker_refuses(self):
        self.boot()
        marker = self.data / acl.MARKER_NAME
        marker.write_text('{"schema_version":1,"policy_sha256":"wrong"}\n')
        with self.assertRaisesRegex(acl.BootstrapError, "marker mismatch"):
            self.boot()
        marker.unlink()
        with self.assertRaisesRegex(acl.BootstrapError, "unmanaged ACL"):
            self.boot()

    def test_sanitized_acl_inspection_never_emits_password_material(self):
        safe = acl.sanitized_acl_metadata(
            "user sample on #" + "b" * 64 + " sanitize-payload ~safe:* resetchannels -@all +get\n"
        )
        text = json.dumps(safe)
        self.assertIn('"password_configured": true', text)
        self.assertNotIn("b" * 64, text)
        sanitized = acl.sanitized_acl_metadata("user sample on >plaintext-secret -@all +get\n")
        self.assertTrue(sanitized[0]["password_configured"])
        self.assertNotIn("plaintext-secret", json.dumps(sanitized))
        malformed_hash = acl.sanitized_acl_metadata("user sample on #unexpected-secret-material -@all +get\n")
        self.assertNotIn("unexpected-secret-material", json.dumps(malformed_hash))
    @unittest.skipUnless(
        os.environ.get("RUN_REDIS_DOCKER_TESTS") == "1" and shutil.which("docker"),
        "set RUN_REDIS_DOCKER_TESTS=1 to run disposable Redis 7 integration test",
    )
    def test_no_listener_before_acl_and_default_is_off_from_first_redis_response(self):
        self.assertEqual(self.boot(), "initialized")
        # Redis is not started by the bootstrapper. The only process that can
        # listen is launched below with the already validated ACL file.
        name = "redis-acl-test-" + next(tempfile._get_candidate_names())
        started = subprocess.run(
            ["docker", "run", "-d", "--network", "none", "--name", name,
             "--user", f"{os.getuid()}:{os.getgid()}", "-v", f"{self.data}:/data",
             "redis:7-alpine", "redis-server", "--port", "6379", "--aclfile", "/data/users.acl",
             "--save", "", "--appendonly", "no"],
            capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(started.returncode, 0)
        container = started.stdout.strip()

        def redis_exec(auth_user: str | None, command: str, password: str | None = None) -> str:
            if auth_user:
                shell = "IFS= read -r REDISCLI_AUTH; export REDISCLI_AUTH; exec redis-cli --raw --user " + auth_user + " " + command
                input_data = (password or "").encode() + b"\n"
                args = ["docker", "exec", "-i", container, "sh", "-c", shell]
            else:
                args = ["docker", "exec", container, "redis-cli", "--raw", *command.split()]
                input_data = None
            proc = subprocess.run(args, input=input_data, capture_output=True, timeout=20)
            return proc.stdout.decode(errors="replace").strip() + proc.stderr.decode(errors="replace").strip()

        try:
            health_password = self.credentials["redis_healthcheck"]
            # The unauthenticated probe must be denied; authenticated PING is
            # the readiness check and proves ACLs were active at first use.
            result = ""
            for _ in range(40):
                result = redis_exec("redis_healthcheck", "PING", health_password)
                if result == "PONG":
                    break
                __import__("time").sleep(0.25)
            if result != "PONG":
                logs = subprocess.run(["docker", "logs", container], capture_output=True, text=True, timeout=10)
                diagnostic = (logs.stdout + logs.stderr)
                diagnostic = re.sub(r"#[0-9a-fA-F]{64}", "#[redacted]", diagnostic)
                diagnostic = re.sub(r"test-only-[^\s]+", "[redacted]", diagnostic)
                self.fail("disposable Redis did not become ready; sanitized startup diagnostic: " + diagnostic[-1200:])
            self.assertIn("NOAUTH", redis_exec(None, "PING"))
            admin_password = self.credentials["redis_admin"]
            rows = acl.sanitized_acl_metadata(redis_exec("redis_admin", "ACL LIST", admin_password))
            self.assertEqual(len(rows), 26)
            self.assertFalse(next(r for r in rows if r["username"] == "default")["enabled"])
            self.assertEqual(self.boot(), "managed-match")
            subprocess.run(["docker", "restart", container], check=True, capture_output=True, timeout=30)
            self.assertEqual(redis_exec("redis_healthcheck", "PING", health_password), "PONG")
        finally:
            subprocess.run(["docker", "rm", "-f", container], capture_output=True, timeout=30)


if __name__ == "__main__":
    unittest.main()
