"""Bake editable CHOG rigs/effects and optimize generated arena art with Canvas."""
from pathlib import Path
import base64
import json
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ROSTER = json.loads((ROOT / 'chog-roster.json').read_text())


def manifest(path):
    return json.JSONDecoder().raw_decode(path.read_text().split('=', 1)[1].lstrip())[0]


def save_data_url(path, url):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(url.split(',', 1)[1]))


def assignments(path):
    text=path.read_text();out={}
    for match in re.finditer(r'window\.(\w+)\s*=\s*',text):
        out[match[1]]=json.JSONDecoder().raw_decode(text[match.end():])[0]
    return out


def upgrade_layout(page,path,cid,empowered):
    values=assignments(path);key=next(k for k in values if k.endswith('MANIFEST'));m=values[key]
    counts={s:len(fs) for s,fs in m['frame_layout']['rows'].items()}
    counts.update(idle=6,walk=8,run=8,jump=4)
    geometry=page.evaluate('''job=>{
      const c=document.createElement('canvas');c.width=1024;c.height=768;const ctx=c.getContext('2d',{willReadFrequently:true});const rows={};
      for(const [state,n] of Object.entries(job.counts)){rows[state]=[];for(let i=0;i<n;i++){
        ctx.clearRect(0,0,1024,768);ctx.save();ctx.translate(512,580);ChogArt.render(ctx,job.id,state,i,n,job.empowered);ctx.restore();
        const d=ctx.getImageData(0,0,1024,768).data;let left=1024,top=768,right=0,bottom=0;
        for(let y=0;y<768;y++)for(let x=0;x<1024;x++)if(d[(y*1024+x)*4+3]>=40){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
        rows[state].push({left:left-512,right:right-512,top:top-580,bottom:bottom-580});
      }}return rows;
    }''',dict(id=cid,empowered=empowered,counts=counts))
    all_bounds=[b for rows in geometry.values() for b in rows]
    width=max(320,((int(max(max(abs(b['left']),abs(b['right'])) for b in all_bounds))*2+32+15)//16)*16)
    anchor_y=((int(max(-b['top'] for b in all_bounds))+24+15)//16)*16
    safe=max(32,((int(max(b['bottom'] for b in all_bounds))+24+15)//16)*16)
    height=anchor_y+safe;rows={};offset=0;columns=4
    for state,count in counts.items():
        rows[state]=[dict(x=((offset+i)%columns)*width,y=((offset+i)//columns)*height,w=width,h=height) for i in range(count)];offset+=count
    m['cell'].update(width=width,height=height,safe_margin_y=safe,anchor_x=width//2,anchor_y=anchor_y)
    m['frame_layout'].update(sheetWidth=width*columns,sheetHeight=((offset+columns-1)//columns)*height,rows=rows)
    m.setdefault('presentation',{}).update(version=2,bodyHeight=page.evaluate('id=>ChogArt.profiles[id].height',cid),rig='two-bone chains, planted feet, persona keys',airFrames=dict(takeoff=0,rising=1,apex=2,falling=3))
    for state,count in counts.items():
        if state in m['animation']['rows']:m['animation']['rows'][state]['frames']=count
    for metric_key in [k for k in values if k.endswith('METRICS')]:
        metric=values[metric_key];metric['anchor']={'x':width//2,'y':anchor_y}
        metric['states']={s:{'frames':[dict(frame=i,bounds=b,height=b['bottom']-b['top']) for i,b in enumerate(bs)]} for s,bs in geometry.items()}
        scale=page.evaluate('id=>ChogArt.designs[id].bodyScale',cid)
        for state,stride in [('walk',32),('run',44)]:metric['states'][state]['stride_estimate']=round(stride*scale*2,2)
        m['presentation']['stride']={state:metric['states'][state]['stride_estimate'] for state in ['walk','run']}
        metric['playback']={'jump':{'airFrame':1,'torsoPivot':{'x':0,'y':-110}},'doublejump':{'frame':0,'duration':.28,'pivot':{'x':0,'y':-110}}}
        # Sockets are measured from the new constrained hand, not inherited tip pixels.
        metric['emitters']={}
        for state in ['attack1','attack2','attack3','skill1','skill2','ultimate']:
            socket=page.evaluate('args=>ChogArt.socket(...args)',[cid,state,2,counts[state],empowered])
            metric['emitters'][state]={**socket,'frame':2,'method':'CHOG v2 measured constrained front-hand socket'}
    path.write_text('/* CHOG v2 rig layout and measured presentation geometry. */\n'+'\n'.join('window.'+k+' = '+json.dumps(v,separators=(',',':'))+';' for k,v in values.items())+'\n')
    return m


def build(base_url='http://127.0.0.1:5173',rigs_only=False):
    outputs, frame_count = [], 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        page.goto(base_url + '/tools/effect-preview.html', wait_until='load')
        page.evaluate('() => window.ART_READY')
        for ch in ROSTER['characters']:
            cid = ch['id']
            fighter = ROOT / 'assets/chog/fighters' / cid
            variants = ['base', 'empowered'] if cid == 'mamio' else [None]
            for variant in variants:
                directory = fighter / variant if variant else fighter
                m = upgrade_layout(page,directory/'manifest.js',cid,variant=='empowered')
                layout, cell = m['frame_layout'], m['cell']
                job = dict(id=cid, empowered=variant == 'empowered', width=layout['sheetWidth'],
                           height=layout['sheetHeight'], rows=layout['rows'],
                           anchorX=cell['width'] / 2, anchorY=cell['height'] - cell['safe_margin_y'])
                target = directory / 'run/sprite-sheet-alpha.webp'
                save_data_url(target, page.evaluate('job => ChogArt.atlas(job)', job))
                frame_count += sum(len(v) for v in job['rows'].values())
                outputs.append(str(target.relative_to(ROOT)))
            def export(filename, function, arguments):
                target = fighter / 'ui' / filename
                save_data_url(target, page.evaluate(f'args => ChogArt.{function}(...args)', arguments))
                outputs.append(str(target.relative_to(ROOT)))
            export('portrait.webp', 'portrait', [cid])
            export('cutin.webp', 'cutin', [cid])
            export('select.webp', 'selection', [cid])
            for slot in ['basic', 'skill1', 'skill2', 'ultimate']:
                export('icon-' + slot + '.webp', 'icon', [cid, slot])
            if cid == 'mamio':
                for variant in variants:
                    export('portrait-' + variant + '.webp', 'portrait', [cid, variant == 'empowered'])
                    for slot in ['basic', 'skill1', 'skill2']:
                        export('icon-' + variant + '-' + slot + '.webp', 'icon', [cid, slot, variant == 'empowered'])
            print('Baked', ch['display_name'], flush=True)
        effects = page.evaluate('ChogEffects.sets')
        for cid, names in effects.items():
            for name in names:
                target = ROOT / 'assets/chog/fighters' / cid / 'ui' / ('fx-' + name + '.webp')
                save_data_url(target, page.evaluate('args => ChogEffects.effect(...args)', [cid, name]))
                outputs.append(str(target.relative_to(ROOT)))
        target = ROOT / 'assets/chog/effects/partner-drone.webp'
        save_data_url(target, page.evaluate('ChogEffects.partnerDrone()'))
        outputs.append(str(target.relative_to(ROOT)))
        for arena in ([] if rigs_only else json.loads((ROOT / 'tools/arena-generation.json').read_text())['assets']):
            relative = 'assets/chog/arenas/' + arena['id'] + '.webp'
            url = base_url + '/assets/chog/source-art/' + arena['id'] + '.png'
            data = page.evaluate('''async src => {
                const im=new Image();im.src=src;await im.decode();
                const c=document.createElement('canvas');c.width=1280;c.height=720;
                c.getContext('2d').drawImage(im,0,0,1280,720);
                return c.toDataURL('image/webp',.93);
            }''', url)
            save_data_url(ROOT / relative, data)
            outputs.append(relative)
        browser.close()
    report = dict(generator='CHOG Canvas 2D rigs/effects plus built-in image_gen arenas',
                  sources=['tools/chog-art.js','tools/chog-effects.js','tools/arena-generation.json'],
                  characters=12, atlases=13, body_frame_slots=frame_count,
                  effects=sum(len(v) for v in effects.values()) + 1, generated_files=outputs)
    (ROOT / 'assets/chog/asset-build.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Body frame slots:', frame_count, 'Effects:', report['effects'])


if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--rigs-only',action='store_true');args=parser.parse_args()
    build(rigs_only=args.rigs_only)
