"""Conservative local credential checks; reports locations, never secret values.

Run from the repository root before pushing. Scans all reachable Git blobs and
current tracked files, including staged/newly tracked files. This is a heuristic
check, not proof that a repository contains no sensitive information.
"""
import os
from pathlib import Path
import re
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args])


patterns = {
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
}
# Compare against configured secrets without printing or writing their values.
for name, value in os.environ.items():
    if re.search(r'SECRET|TOKEN|PASSWORD|DATABASE_URL|API_KEY', name) and len(value) >= 12:
        patterns['configured sensitive value: ' + name] = re.escape(value.encode())

findings = []
objects = git('rev-list', '--objects', '--all').decode().splitlines()
blobs = 0
for entry in objects:
    oid, _, path = entry.partition(' ')
    if git('cat-file', '-t', oid).strip() != b'blob':
        continue
    blobs += 1
    data = git('cat-file', 'blob', oid)
    for label, pattern in patterns.items():
        if re.search(pattern, data):
            findings.append((f'history {oid[:12]} {path}', label))

paths = git('ls-files', '-z').decode().split('\0')
for name in filter(None, paths):
    path = Path(name)
    if not path.is_file():
        continue
    if re.search(r'(^|/)(?:\.env(?:\..*)?|client[_-]secret.*\.json|.*credentials.*\.json|token(?:s|\..*)?\.json)$', name, re.I) and path.name != '.env.example':
        findings.append((name, 'sensitive filename'))
    for label, pattern in patterns.items():
        if re.search(pattern, path.read_bytes()):
            findings.append((name, label))

for location, label in findings:
    print(f'REVIEW: {location}: {label}')
print(f'{"FAIL" if findings else "PASS"}: checked {blobs} historical blobs and {len(list(filter(None, paths)))} tracked paths; {len(findings)} findings')
sys.exit(bool(findings))
