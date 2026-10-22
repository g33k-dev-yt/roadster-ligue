#!/usr/bin/env python3
"""Collect exact Cargo dependency metadata and supplied license notices.
Run after Cargo.lock updates: python3 tools/native-notices.py
This is a notice collector, not a legal-compliance audit. System libraries are separate.
"""
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote

root = Path(__file__).resolve().parent.parent
if len(sys.argv) > 1:
    metadata = json.loads(Path(sys.argv[1]).read_text())
else:
    metadata = json.loads(subprocess.check_output([
        'cargo', 'metadata', '--manifest-path', str(root / 'src-tauri/Cargo.toml'),
        '--format-version', '1', '--locked'
    ]))

parts = ["""ROADSTER LIGUE — NATIVE DEPENDENCY NOTICES

Generated from the exact Cargo.lock dependency metadata, including optional,
build-only and other-platform dependencies. Inclusion here does not mean that
every listed crate is linked into every installer. No dependency source files
were modified by this project. Each entry includes an exact source-package URL.

Original license / copyright / notice files shipped with the crate are reproduced
where available. Some upstream crates do not ship a separate license file; their
manifest's license, authors and source location are retained instead. Applicable
standard license texts are also reproduced by other entries in this collection.
This collection is not a legal audit and does not replace upstream license terms.
Native OS libraries (WebKitGTK, GTK, system WebViews, etc.) retain their own terms.
Browser assets and JavaScript dependencies have separate notices in licenses/.
"""]
count = 0
for package in sorted(metadata['packages'], key=lambda p: (p['name'], p['version'])):
    if not package.get('source'):
        continue
    count += 1
    folder = Path(package['manifest_path']).parent
    name, version = package['name'], package['version']
    parts.append('\n' + '=' * 78 + '\n' + name + ' ' + version + '\n' + '=' * 78)
    parts.append('Declared license: ' + (package.get('license') or 'see license file'))
    parts.append('Authors (as declared): ' + '; '.join(package.get('authors') or []))
    parts.append('Repository: ' + (package.get('repository') or '(see source package)'))
    parts.append('Exact unmodified source: https://crates.io/api/v1/crates/' + quote(name, safe='') + '/' + quote(version, safe='') + '/download')
    files = set()
    for file in folder.iterdir():
        if file.is_file() and file.name.lower().startswith(('license', 'licence', 'copying', 'notice', 'unlicense', 'copyright')):
            files.add(file)
        elif file.is_dir() and file.name.lower() in ('license', 'licenses', 'licence', 'licences'):
            files.update(f for f in file.rglob('*') if f.is_file())
    if package.get('license_file'):
        files.add(folder / package['license_file'])
    if not files:
        parts.append('No separate license file included in upstream crate; see the exact source package and declared license above.')
    for file in sorted(files):
        try:
            text = file.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        parts.append('\n--- ' + file.relative_to(folder).as_posix() + ' ---\n' + text)
output = root / 'src-tauri/NATIVE_DEPENDENCY_NOTICES.txt'
output.write_text('\n'.join(parts), encoding='utf-8')
print(f'Collected {count} native package notices: {output.name} ({output.stat().st_size:,} bytes)')
