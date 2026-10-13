"""Fail if any upstream media survives anywhere outside Git history.

Hashes catch a renamed copy too. Atlas integrity is checked separately.
"""
from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
SUFFIXES={'.webp','.png','.jpg','.jpeg','.mp3','.mp4','.ogg','.wav','.ttf','.woff','.woff2','.svg'}
commit=json.loads((ROOT/'chog-roster.json').read_text())['reference']['commit']
upstream={}
for line in subprocess.check_output(['git','ls-tree','-r',commit],cwd=ROOT,text=True).splitlines():
    metadata,path=line.split('\t')
    if Path(path).suffix.lower() in SUFFIXES:
        blob=subprocess.check_output(['git','cat-file','blob',metadata.split()[2]],cwd=ROOT)
        upstream.setdefault(hashlib.sha256(blob).hexdigest(),[]).append(path)
current=[]; leftovers=[]
for path in ROOT.rglob('*'):
    if any(part in {'.git','node_modules','out','cache','data'} for part in path.parts) or not path.is_file() or path.suffix.lower() not in SUFFIXES: continue
    h=hashlib.sha256(path.read_bytes()).hexdigest()
    relative=path.relative_to(ROOT).as_posix()
    current.append({'file':relative,'sha256':h,'bytes':path.stat().st_size})
    if h in upstream: leftovers.append({'file':relative,'upstream_sources':upstream[h]})
assert not leftovers,leftovers
assert all(p['file'].startswith('assets/chog/') or p['file'].startswith('validation/') for p in current), 'Media outside CHOG namespace'
for entry in current:
    path=ROOT/entry['file']
    if '/ui/fx-' in entry['file'] or 'partner-drone.webp' in entry['file']:
        with Image.open(path) as im:
            assert im.mode=='RGBA' and im.getchannel('A').getextrema()==(0,255),entry['file']
            assert im.getchannel('A').getbbox(),entry['file']
for name in ['rayj-house','cwo-alley','house-cup','neon-street','cwo-rally']:
    with Image.open(ROOT/'assets/chog/arenas'/f'{name}.webp') as im: assert im.size==(1280,720)
report={'status':'passed','compared_upstream_media_files':sum(map(len,upstream.values())),
        'leftover_upstream_media':leftovers,'current_media':current,
        'scope':'Working tree and runtime media; original MIT code and Git history remain attributed.'}
(ROOT/'validation/media-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(f"{len(current)} current media files; zero copies of {report['compared_upstream_media_files']} upstream media files.")
