"""Security tests for preserving the existing RAG Redis credential."""

from __future__ import annotations

import os
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import redis_acl_bootstrap as acl  # noqa: E402


class RagCredentialMaterializationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="rag-credential-test-")
        self.root = Path(self.temp.name)
        self.source = self.root / "rag.env"
        self.credential_dir = self.root / "protected" / "redis-acl"
        self.secret = b"synthetic-rag-password-value"
        self._write_url("redis_rag_cache", self.secret)

    def tearDown(self):
        self.temp.cleanup()

    def _write_url(self, username: str, password: bytes | None, raw_url: str | None = None):
        if raw_url is None:
            user = quote(username, safe="")
            encoded = quote((password or b"").decode("utf-8"), safe="")
            raw_url = f"redis://{user}:{encoded}@redis:6379/0"
        self.source.write_text(f"CACHE_REDIS_URL={raw_url}\n", encoding="utf-8")
        self.source.chmod(0o600)

    def test_creates_exact_decoded_credential_with_restricted_modes_and_is_idempotent(self):
        self.assertEqual(acl.materialize_rag_credential(self.source, self.credential_dir), "created")
        target = self.credential_dir / "redis_rag_cache.pass"
        self.assertEqual(target.read_bytes(), self.secret)
        self.assertEqual(self.credential_dir.stat().st_mode & 0o777, 0o700)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        before = target.stat()
        self.assertEqual(acl.materialize_rag_credential(self.source, self.credential_dir), "already-present")
        after = target.stat()
        self.assertEqual((after.st_ino, after.st_mtime_ns), (before.st_ino, before.st_mtime_ns))

    def test_existing_different_file_is_never_overwritten(self):
        self.credential_dir.mkdir(parents=True, mode=0o700)
        target = self.credential_dir / "redis_rag_cache.pass"
        target.write_bytes(b"different-synthetic-password")
        target.chmod(0o600)
        with self.assertRaisesRegex(acl.BootstrapError, "refusing overwrite"):
            acl.materialize_rag_credential(self.source, self.credential_dir)
        self.assertEqual(target.read_bytes(), b"different-synthetic-password")

    def test_malformed_missing_and_wrong_identity_sources_fail_without_leaking(self):
        bad_urls = [
            "not-a-url-synthetic-secret",
            "redis://wrong_user:synthetic-password@redis:6379/0",
            "redis://redis_rag_cache@redis:6379/0",
            "redis://redis_rag_cache:synthetic-password@redis:invalid/0",
        ]
        for value in bad_urls:
            with self.subTest(case="synthetic malformed input"):
                self._write_url("", None, value)
                with self.assertRaises(acl.BootstrapError) as caught:
                    acl.materialize_rag_credential(self.source, self.credential_dir)
                self.assertNotIn("synthetic", str(caught.exception))
                self.assertFalse(self.credential_dir.exists())
        self.source.write_text("OTHER=value\n", encoding="utf-8")
        self.source.chmod(0o600)
        with self.assertRaises(acl.BootstrapError):
            acl.materialize_rag_credential(self.source, self.credential_dir)

    def test_duplicate_source_key_and_unsafe_permissions_fail_closed(self):
        url = "redis://redis_rag_cache:synthetic-password-value@redis:6379/0"
        self.source.write_text(f"CACHE_REDIS_URL={url}\nCACHE_REDIS_URL={url}\n", encoding="utf-8")
        self.source.chmod(0o600)
        with self.assertRaises(acl.BootstrapError):
            acl.materialize_rag_credential(self.source, self.credential_dir)
        self._write_url("redis_rag_cache", self.secret)
        self.source.chmod(0o644)
        with self.assertRaisesRegex(acl.BootstrapError, "permissions"):
            acl.materialize_rag_credential(self.source, self.credential_dir)

    def test_cli_diagnostics_do_not_leak_synthetic_credential(self):
        secret = "synthetic-cli-secret-value"
        self._write_url("wrong_user", secret.encode())
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            status = acl.main([
                "materialize-rag-credential", "--source", str(self.source),
                "--credential-dir", str(self.credential_dir),
            ])
        self.assertEqual(status, 2)
        self.assertNotIn(secret, stdout.getvalue())
        self.assertNotIn(secret, stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
