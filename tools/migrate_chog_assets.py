"""Move authored CHOG art into its own namespace and remove inherited media.

Run once on the original adaptation. Source code and the MIT notice remain.
The archived upstream commit is used only by verification, not by the game.
"""
from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parent.parent


def migrate():
    roster = json.loads((ROOT / 'chog-roster.json').read_text())['characters']
    authored = set(json.loads((ROOT / 'assets/chog/asset-build.json').read_text())['generated_files'])
    authored.add('assets/ui/dummy-avatar.webp')
    replacements = {}
    manifest_map = {}
    for ch in roster:
        cid, kit = ch['id'], ch['source_kit_id']
        target = 'assets/chog/fighters/' + cid
        source = 'assets/' + ('mecha' if kit == 'arco' else kit)
        for path in sorted(authored):
            if path.startswith(source + '/'):
                dest = target + path[len(source):]
            elif kit == 'arco' and path.startswith('assets/ui/'):
                dest = target + '/ui/' + Path(path).name
            elif path == 'assets/menu/' + kit + '-select.webp':
                dest = target + '/ui/select.webp'
            else:
                continue
            dest = dest.replace('/human/', '/base/').replace('/wolf/', '/empowered/')
            dest = dest.replace('portrait-human', 'portrait-base').replace('portrait-wolf', 'portrait-empowered')
            dest = dest.replace('avatar-human', 'avatar-base').replace('avatar-wolf', 'avatar-empowered')
            dest = dest.replace('icon-human-', 'icon-base-').replace('icon-wolf-', 'icon-empowered-')
            if cid == 'yot':
                dest = dest.replace('arco-avatar.webp', 'portrait.webp').replace('ultimate-cutin.webp', 'cutin.webp')
                for a, b in {'attack':'icon-basic','skill1':'icon-skill1','skill2':'icon-skill2','squadron-icon':'icon-ultimate'}.items():
                    if Path(dest).name == a + '.webp': dest = str(Path(dest).with_name(b + '.webp'))
            replacements[path] = dest
        variants = ['human', 'wolf'] if kit == 'fenr' else [None]
        for variant in variants:
            old = source + ('/' + variant if variant else '') + '/manifest.js'
            new = target + ('/base' if variant == 'human' else '/empowered' if variant == 'wolf' else '') + '/manifest.js'
            replacements[old] = new
            manifest_map[new] = old
    for old, new in replacements.items():
        src, dst = ROOT / old, ROOT / new
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
    # Prefix replacements also resolve dynamically composed effect paths.
    for ch in roster:
        old = 'assets/' + ('mecha' if ch['source_kit_id'] == 'arco' else ch['source_kit_id']) + '/'
        replacements[old] = 'assets/chog/fighters/' + ch['id'] + '/'
    replacements.update({
        'assets/stage-config.js':'assets/chog/arenas/config.js',
        'assets/ui/drone-config.js':'assets/chog/effects/drone-config.js',
        'assets/ui/drone.png':'assets/chog/effects/partner-drone.webp',
        'assets/menu/locked.svg':'assets/chog/ui/locked.svg',
        'assets/audio/announcer/manifest.js':'assets/chog/audio/manifest.js',
    })
    for path in ROOT.iterdir():
        if path.suffix not in {'.js', '.html', '.css'} or path.name == 'precache.js': continue
        text = path.read_text()
        for old, new in sorted(replacements.items(), key=lambda item: -len(item[0])):
            text = text.replace(old, new)
        text = text.replace('AETHER_PRELOAD', 'CHOG_PRELOAD').replace('AETHER_PRECACHE', 'CHOG_PRECACHE')
        text = text.replace('aether.fullscreenHint','chog.fullscreenHint').replace('aether.music','chog.music')
        text = text.replace('aetherFullscreen','chogFullscreen').replace('aetherActivate','chogActivate')
        text = text.replace('aether-fullscreen','chog-fullscreen').replace('aether-activate','chog-activate')
        path.write_text(text)
    # Only the new CHOG namespace survives: no dormant old media is shipped.
    removed = []
    for path in (ROOT / 'assets').iterdir():
        if path.name == 'chog': continue
        removed += [str(p.relative_to(ROOT)) for p in path.rglob('*') if p.is_file()] if path.is_dir() else [str(path.relative_to(ROOT))]
        shutil.rmtree(path) if path.is_dir() else path.unlink()
    for name in ['docs', 'guide']:
        path = ROOT / name
        if path.exists():
            removed += [str(p.relative_to(ROOT)) for p in path.rglob('*') if p.is_file()]
            shutil.rmtree(path)
    result = {'manifest_sources':manifest_map, 'removed_inherited_files':removed,
              'authored_asset_moves':{a:b for a,b in replacements.items() if a in authored}}
    (ROOT / 'assets/chog/migration.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Moved CHOG artwork; removed', len(removed), 'inherited media and guide files.')


if __name__ == '__main__':
    migrate()
