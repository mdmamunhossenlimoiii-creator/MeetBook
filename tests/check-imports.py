#!/usr/bin/env python3
"""Static check: every named import from a local module is exported by that module (js/, js/admin/, scripts/)."""
import re, glob, os, sys
root = sys.argv[1] if len(sys.argv) > 1 else '.'
files = glob.glob(root + '/js/**/*.js', recursive=True) + glob.glob(root + '/scripts/**/*.mjs', recursive=True)
exports = {}
for f in files:
    s = open(f).read()
    names = set(re.findall(r'export\s+(?:async\s+)?(?:function|const|let|class)\s+([\w$]+)', s))
    for blk in re.findall(r'export\s*\{([^}]*)\}', s):
        for n in blk.split(','):
            n = n.strip().split(' as ')[-1].strip()
            if n: names.add(n)
    exports[os.path.normpath(f)] = names
bad = 0
for f in files:
    s = open(f).read()
    d = os.path.dirname(f)
    for names, src in re.findall(r"import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'", s):
        mod = os.path.normpath(os.path.join(d, src))
        if mod not in exports: print(f"MISSING FILE: {f} imports {src}"); bad += 1; continue
        for n in names.split(','):
            n = n.strip().split(' as ')[0].strip()
            if n and n not in exports[mod]: print(f"MISSING: {f} imports {n} from {src}"); bad += 1
    for ns, src in re.findall(r"import\s*\*\s*as\s+(\w+)\s+from\s*'(\.[^']+)'", s):
        mod = os.path.normpath(os.path.join(d, src))
        if mod not in exports: print(f"MISSING FILE: {f} imports {src}"); bad += 1; continue
        for used in set(re.findall(r'\b' + ns + r'\.(\w+)\(', s)):
            if used not in exports[mod]: print(f"MISSING: {f} uses {ns}.{used} not exported by {src}"); bad += 1
    for src in re.findall(r"import\('(\.[^']+)'\)", s):
        if os.path.normpath(os.path.join(d, src)) not in exports: print(f"MISSING FILE: {f} dynamic import {src}"); bad += 1
print("import check done, problems:", bad)
sys.exit(1 if bad else 0)
