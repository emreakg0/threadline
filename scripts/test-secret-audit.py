"""Regression tests for the existing audit; no real credentials are used.

Created separately because no audit regression harness existed.
"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('secret_audit', Path(__file__).with_name('secret-audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class SecretAuditTests(unittest.TestCase):
    def test_fingerprints_and_beta_values(self):
        fingerprint = 'a' * 64
        approval = json.dumps({'keySha256': fingerprint, 'project': 'synthetic'})
        for data in [
            approval,
            json.dumps(approval),  # Escaped JSON inside TOML.
            'key_fingerprint = "' + fingerprint + '"',
            'THREADLINE_' + 'GEMINI_FREE_TIER_APPROVAL = "{}"',
            'THREADLINE_' + 'GEMINI_LIVE_AUTHORIZED = "true"',
        ]:
            with self.subTest():
                self.assertTrue(audit.matches(data.encode(), audit.BASE_PATTERNS))

    def test_references_and_computed_test_fixtures_are_allowed(self):
        for data in [
            b'process.env.THREADLINE_GEMINI_FREE_TIER_APPROVAL',
            b'keySha256: createHash("sha256").update("fixture").digest("hex")',
            b'lockfileIntegrity = "ordinary-integrity-value"',
        ]:
            self.assertEqual(audit.matches(data, audit.BASE_PATTERNS), [])

    def test_exact_configured_credential_and_digest_are_detected(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'synthetic-test-credential'}, clear=True):
            patterns = audit.build_patterns()
        value = b'synthetic-test-credential'
        self.assertTrue(audit.matches(value, patterns))
        self.assertTrue(audit.matches(audit.hashlib.sha256(value).hexdigest().encode(), patterns))

    def test_forced_private_file_is_rejected(self):
        self.assertTrue(audit.sensitive_filename('artifacts/api-server/.local/threadline-gemini-authorization.json'))
        self.assertFalse(audit.sensitive_filename('.env.example'))

    def test_index_is_checked_even_when_working_copy_is_clean(self):
        payload = b'THREADLINE_' + b'GEMINI_LIVE_AUTHORIZED = "true"'
        def fake_git(*args):
            return b'.replit\0' if args[0] == 'ls-files' else payload
        with patch.object(audit, 'git', side_effect=fake_git):
            findings, count = audit.inspect_current(audit.BASE_PATTERNS)
        self.assertEqual(count, 1)
        self.assertIn(('index .replit', 'beta authorization assignment'), findings)

    def test_log_findings_never_print_values(self):
        with tempfile.TemporaryDirectory() as directory:
            value = b'AIza' + b'X' * 35
            Path(directory, 'server.log').write_bytes(value)
            findings, count = audit.inspect_logs([Path(directory)], audit.BASE_PATTERNS)
            self.assertEqual(count, 1)
            self.assertEqual(len(findings), 1)
            self.assertNotIn(value.decode(), repr(findings))

    def test_cli_fails_without_echoing_committed_values(self):
        with tempfile.TemporaryDirectory() as directory:
            def git(*args):
                subprocess.run(['git', *args], cwd=directory, check=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            git('init')
            payload = b'THREADLINE_' + b'GEMINI_LIVE_AUTHORIZED = "true"'
            Path(directory, '.replit').write_bytes(payload)
            git('add', '.replit')
            # Cover clean worktree hiding a staged value through the real CLI.
            Path(directory, '.replit').write_text('# clean')
            result = subprocess.run(['python3', str(Path(audit.__file__).resolve()), '--current-only'],
                                    cwd=directory, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertNotIn(payload.decode(), result.stdout + result.stderr)
            self.assertIn('index .replit', result.stdout)


if __name__ == '__main__':
    unittest.main()
