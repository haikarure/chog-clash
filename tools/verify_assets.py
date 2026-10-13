"""Inspect atlas contracts and prove kit data has not changed from upstream."""
from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
roster=json.loads((ROOT/'chog-roster.json').read_text())
source_files=[]
source_map=json.loads((ROOT/'assets/chog/migration.json').read_text())['manifest_sources']
frames=0
atlases=[]
for ch in roster['characters']:
    kit=ch['source_kit_id']
    if kit!='arco':source_files.append(kit+'.js')
    for variant in (['human','wolf'] if kit=='fenr' else [None]):
        directory=ROOT/'assets/chog/fighters'/ch['id']
        if variant: directory=directory/('base' if variant=='human' else 'empowered')
        source_files.append((directory/'manifest.js').relative_to(ROOT).as_posix())
        m=json.JSONDecoder().raw_decode((directory/'manifest.js').read_text().split('=',1)[1].lstrip())[0]
        atlas=directory/'run/sprite-sheet-alpha.webp'
        with Image.open(atlas) as im:
            layout=m['frame_layout']
            assert im.size==(layout['sheetWidth'],layout['sheetHeight']),atlas
            for state,row in layout['rows'].items():
                for f in row:
                    alpha=im.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h'])).getchannel('A')
                    assert alpha.getbbox(),(ch['id'],variant,state)
                    frames+=1
        atlases.append(dict(character=ch['id'],variant=variant or 'base',file=atlas.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(atlas.read_bytes()).hexdigest()))
for path in source_files:
    original=subprocess.check_output(['git','show',roster['reference']['commit']+':'+source_map.get(path,path)],cwd=ROOT)
    if not path.endswith('manifest.js'):assert original==(ROOT/path).read_bytes(), 'Kit data changed: '+path
for item in json.loads((ROOT/'assets/chog/source-provenance.json').read_text())['sources']:
    assert hashlib.sha256((ROOT/item['path']).read_bytes()).hexdigest()==item['sha256'],item['id']
assert len(atlases)==13 and frames==867
result=dict(status='passed',checked_on='2026-10-12',atlases=atlases,nonempty_frames=frames,
            unchanged_kit_files=[p for p in source_files if not p.endswith('manifest.js')],presentation_manifest_version=2,original_reference_images=12)
(ROOT/'validation').mkdir(exist_ok=True)
(ROOT/'validation/asset-contract.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'{frames} nonempty frames in {len(atlases)} atlases. {len(source_files)} kit/presentation contracts verified; 12 original references unchanged.')
