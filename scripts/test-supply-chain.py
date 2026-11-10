"""Exercise installed package-manager policies against an isolated local registry.

No project dependencies, live credentials or public registry packages are used.
All manifests, tarballs, caches and locks belong to temporary test fixtures.
"""
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
import json
import os
import subprocess
import tarfile
import tempfile
import threading

ROOT = Path(__file__).resolve().parent.parent
CLEAN_ENV = {key: value for key, value in os.environ.items() if not key.lower().startswith(('npm_config_', 'pnpm_config_'))}


def config(key):
    return json.loads(subprocess.check_output(['pnpm', 'config', 'get', key, '--json'], cwd=ROOT, text=True))


assert subprocess.check_output(['pnpm', '--version'], text=True).strip() == '10.26.1'
assert config('minimumReleaseAge') == 10080
assert config('blockExoticSubdeps') is True
assert config('trustPolicy') == 'no-downgrade'
assert config('minimumReleaseAgeExclude') == []
assert config('trustPolicyExclude') == []
assert subprocess.check_output(['npm', 'config', 'get', 'min-release-age'], cwd=ROOT, env=CLEAN_ENV, text=True).strip() == '7'

now = datetime.now(timezone.utc)
old = (now - timedelta(days=30)).isoformat()
later = (now - timedelta(days=20)).isoformat()
young = (now - timedelta(minutes=5)).isoformat()
manifests = {}
metadata = {}


class Registry(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        name = self.path.split('?', 1)[0].strip('/')
        if name.endswith('.tgz'):
            manifest = manifests.get(name)
            if manifest is None:
                self.send_error(404)
                return
            archive = BytesIO()
            with tarfile.open(fileobj=archive, mode='w:gz') as tar:
                content = json.dumps(manifest).encode()
                entry = tarfile.TarInfo('package/package.json')
                entry.size = len(content)
                tar.addfile(entry, BytesIO(content))
            body = archive.getvalue()
            content_type = 'application/octet-stream'
        elif name in metadata:
            body = json.dumps(metadata[name]).encode()
            content_type = 'application/json'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)


registry = ThreadingHTTPServer(('127.0.0.1', 0), Registry)
base = f'http://127.0.0.1:{registry.server_port}'


def package(name, versions):
    meta = {'name': name, 'dist-tags': {'latest': list(versions)[-1]}, 'versions': {}, 'time': {}}
    for version, (published, dependencies, trusted) in versions.items():
        tarball = f'{name}-{version}.tgz'
        manifest = {'name': name, 'version': version, 'dependencies': dependencies, 'dist': {'tarball': f'{base}/{tarball}'}}
        if trusted:
            manifest['dist']['attestations'] = {'provenance': {'predicateType': 'https://slsa.dev/provenance/v1'}}
        manifests[tarball] = manifest
        meta['versions'][version] = manifest
        meta['time'][version] = published
    metadata[name] = meta


package('focus-policy-age', {'1.0.0': (young, {}, False), '2.0.0': (young, {}, False)})
package('focus-policy-trust', {'1.0.0': (old, {}, True), '2.0.0': (later, {}, False)})
package('focus-policy-child', {'1.0.0': (old, {}, False)})
package('focus-policy-parent', {'1.0.0': (old, {'focus-policy-child': f'{base}/focus-policy-child-1.0.0.tgz'}, False)})
thread = threading.Thread(target=registry.serve_forever, daemon=True)
thread.start()

try:
    with tempfile.TemporaryDirectory(prefix='focus-city-policy-') as temporary:
        root = Path(temporary)

        def install(label, dependency, *, exception=None, manager='pnpm', expected_error=None):
            directory = root / label
            directory.mkdir()
            (directory / 'package.json').write_text(json.dumps({'name': 'policy-fixture', 'private': True, 'dependencies': dependency}))
            policy = {
                'minimumReleaseAge': config('minimumReleaseAge'),
                'minimumReleaseAgeExclude': [exception] if exception else [],
                'blockExoticSubdeps': config('blockExoticSubdeps'),
                'trustPolicy': config('trustPolicy'),
            }
            # JSON values are also valid YAML scalars and sequences.
            (directory / 'pnpm-workspace.yaml').write_text('\n'.join(f'{key}: {json.dumps(value)}' for key, value in policy.items()) + '\n')
            (directory / '.npmrc').write_text(f'registry={base}/\nmin-release-age=7\naudit=false\nfund=false\nfetch-retries=0\nfetch-timeout=10000\n')
            if manager == 'pnpm':
                command = ['pnpm', 'install', '--lockfile-only', '--ignore-scripts', '--store-dir', str(directory / 'store')]
            else:
                command = ['npm', 'install', '--package-lock-only', '--ignore-scripts', '--cache', str(directory / 'cache')]
            # Avoid inherited install flags changing the fixture policy.
            try:
                result = subprocess.run(command, cwd=directory, env=CLEAN_ENV, text=True, capture_output=True, timeout=40)
            except subprocess.TimeoutExpired as error:
                raise AssertionError(f'{label}: fixture timeout; output: {error.stdout!r} {error.stderr!r}') from error
            output = result.stdout + result.stderr
            if expected_error:
                assert result.returncode != 0 and expected_error in output, f'{label}: expected {expected_error}\n{output}'
            else:
                assert result.returncode == 0, f'{label}: install failed\n{output}'
            print('PASS:', label, flush=True)

        install('pnpm-rejects-young', {'focus-policy-age': '1.0.0'}, expected_error='ERR_PNPM_NO_MATURE_MATCHING_VERSION')
        install('pnpm-allows-exact-urgent-exception', {'focus-policy-age': '1.0.0'}, exception='focus-policy-age@1.0.0')
        install('pnpm-exception-does-not-allow-other-version', {'focus-policy-age': '2.0.0'}, exception='focus-policy-age@1.0.0', expected_error='ERR_PNPM_NO_MATURE_MATCHING_VERSION')
        install('pnpm-rejects-trust-downgrade', {'focus-policy-trust': '2.0.0'}, expected_error='ERR_PNPM_TRUST_DOWNGRADE')
        install('pnpm-rejects-exotic-transitive', {'focus-policy-parent': '1.0.0'}, expected_error='ERR_PNPM_EXOTIC_SUBDEP')
        install('npm-fallback-rejects-young', {'focus-policy-age': '1.0.0'}, manager='npm', expected_error='ETARGET')
finally:
    registry.shutdown()
    registry.server_close()
