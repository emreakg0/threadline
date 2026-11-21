"""Conservative local credential checks; reports locations, never secret values.

Run from the repository root before pushing. Scans reachable/reflog Git blobs,
the actual index, and tracked working files. Optional retained-log checks never
print matched content. This is a heuristic, not proof of absence of secrets.
"""
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args])


BASE_PATTERNS = {
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'GitHub token': rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})',
    'OpenAI key': rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}',
    'Google API key': rb'\bAIza[0-9A-Za-z_-]{30,}',
    'Google OAuth secret': rb'GOCSPX-[A-Za-z0-9_-]{20,}',
    'AWS access key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'credential URL': rb'(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s\"\'<>:]+:[^\s\"\'<>@]+@',
    'JWT': rb'\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,}',
    'npm token': rb'\bnpm_[A-Za-z0-9]{30,}',
    'credential assignment': rb'(?i)(?:client_secret|private_key|access_token|refresh_token|_authToken)\s*[\"\']?\s*[:=]\s*[\"\'][A-Za-z0-9_+/=-]{24,}[\"\']',
    'key fingerprint': rb'(?i)(?:key[_-]?sha256|key[_-]?fingerprint|(?:gemini|api[_-]?key)[_-]?(?:sha256|fingerprint))[^a-z0-9\r\n]{1,16}(?:sha256:)?[a-f0-9]{64}\b',
    'production approval data assignment': rb'(?im)^\s*(?:export\s+)?["\']?THREADLINE_PRODUCTION_(?:GEMINI_API_KEY|GEMINI_KEY_SHA256|AI_SUBJECTS)["\']?\s*=[ \t]*[^\s#]+',
    'beta authorization assignment': rb'(?im)^\s*(?:export\s+)?[\"\']?THREADLINE_GEMINI_(?:FREE_TIER_APPROVAL|LIVE_AUTHORIZED)[\"\']?\s*=\s*\S+',
}


def build_patterns() -> dict[str, bytes]:
    patterns = dict(BASE_PATTERNS)
    # Compare internally; neither raw secrets nor their digests are logged.
    for name, value in os.environ.items():
        if re.search(r'SECRET|TOKEN|PASSWORD|DATABASE_URL|API_KEY', name) and len(value) >= 12:
            patterns['configured sensitive value: ' + name] = re.escape(value.encode())
            if re.search(r'API_KEY|SECRET', name):
                digest = hashlib.sha256(value.encode()).hexdigest().encode()
                patterns['configured key fingerprint: ' + name] = rb'(?i)' + re.escape(digest)
    return patterns


def matches(data: bytes, patterns: dict[str, bytes]) -> list[str]:
    return [label for label, pattern in patterns.items() if re.search(pattern, data)]


def sensitive_filename(name: str) -> bool:
    return Path(name).name != '.env.example' and bool(re.search(
        r'(^|/)(?:\.env(?:\..*)?|client[_-]secret.*\.json|.*credentials.*\.json|'
        r'token(?:s|\..*)?\.json|threadline-gemini-authorization\.json)$', name, re.I))


def inspect_history(patterns: dict[str, bytes]) -> tuple[list[tuple[str, str]], int]:
    findings = []
    blobs = 0
    for entry in git('rev-list', '--objects', '--all', '--reflog').decode().splitlines():
        oid, _, path = entry.partition(' ')
        if git('cat-file', '-t', oid).strip() != b'blob':
            continue
        blobs += 1
        labels = matches(git('cat-file', 'blob', oid), patterns)
        if sensitive_filename(path):
            labels.append('sensitive filename')
        findings.extend((f'history {oid[:12]} {path}', label) for label in labels)
    return findings, blobs


def inspect_current(patterns: dict[str, bytes]) -> tuple[list[tuple[str, str]], int]:
    findings = []
    paths = list(filter(None, git('ls-files', '-z').decode().split('\0')))
    for name in paths:
        # Check the index separately: a clean working file can hide a staged leak.
        sources = [('index', git('show', f':{name}'))]
        path = Path(name)
        if path.is_file() and not path.is_symlink():
            sources.append(('working', path.read_bytes()))
        for scope, data in sources:
            labels = matches(data, patterns)
            if sensitive_filename(name):
                labels.append('sensitive filename')
            findings.extend((f'{scope} {name}', label) for label in labels)
    return findings, len(paths)


def inspect_logs(directories: list[Path], patterns: dict[str, bytes]) -> tuple[list[tuple[str, str]], int]:
    findings = []
    count = 0
    seen = set()
    for directory in directories:
        if not directory.is_dir():
            raise ValueError('Requested log directory is unavailable')
        for path in directory.rglob('*'):
            if not path.is_file() or path.is_symlink() or path in seen:
                continue
            seen.add(path)
            count += 1
            labels = matches(path.read_bytes(), patterns)
            findings.extend((f'log {path}', label) for label in labels)
    return findings, count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--current-only', action='store_true',
                        help='Check index/worktree only; does not certify history is clean')
    parser.add_argument('--log-dir', type=Path, action='append', default=[],
                        help='Also check retained logs without printing matched values')
    args = parser.parse_args()
    patterns = build_patterns()
    findings, paths = inspect_current(patterns)
    historical, blobs = ([], 0) if args.current_only else inspect_history(patterns)
    logged, logs = inspect_logs(args.log_dir, patterns)
    findings.extend(historical + logged)
    for location, label in findings:
        print(f'REVIEW: {location}: {label}')
    print(f'{"FAIL" if findings else "PASS"}: {blobs} historical blobs, '
          f'{paths} indexed/working paths, {logs} log files; {len(findings)} findings')
    return int(bool(findings))


if __name__ == '__main__':
    sys.exit(main())
