"""Read-only sprite geometry and decoded audio measurements for the post-landing audit."""
from pathlib import Path
import json,subprocess,hashlib,math,re,base64
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'validation/audit'
OUT.mkdir(exist_ok=True)

def manifest(p):return json.JSONDecoder().raw_decode(p.read_text().split('=',1)[1].lstrip())[0]
jobs=[];atlas_rows=[]
for p in sorted((ROOT/'assets/chog/fighters').rglob('manifest.js')):
    m=manifest(p);identifier=str(p.parent.relative_to(ROOT/'assets/chog/fighters'))
    job={'id':identifier.split('/')[0],'variant':identifier,'empowered':identifier.endswith('empowered'),'anchorX':m['cell']['width']/2,'anchorY':m['cell']['height']-m['cell']['safe_margin_y'],'cellW':m['cell']['width'],'cellH':m['cell']['height'],'states':{s:len(fs) for s,fs in m['frame_layout']['rows'].items()}}
    jobs.append(job)
    im=Image.open(p.parent/'run/sprite-sheet-alpha.webp').convert('RGBA')
    for state,fs in m['frame_layout']['rows'].items():
        for i,f in enumerate(fs):
            frame=im.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']));alpha=frame.getchannel('A').point(lambda a:255 if a>=40 else 0);box=alpha.getbbox()
            raw=hashlib.sha256(frame.tobytes()).hexdigest()
            atlas_rows.append({'id':identifier,'state':state,'frame':i,'bbox':box,'height':box[3]-box[1],'width':box[2]-box[0],'bottomFromFeet':box[3]-job['anchorY'],'pixelHash':raw,'edgeBottom':box[3]>=f['h'],'edgeLeft':box[0]==0,'edgeRight':box[2]>=f['w']})
# Current bitmap footprints are measured independently of nominal rig height and transparent cell size.
(OUT/'atlas-frames.json').write_text(json.dumps(atlas_rows,indent=2)+'\n')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1280,'height':900})
    page.goto('http://127.0.0.1:5173/tools/rig-preview.html');page.evaluate('ART_READY')
    measured=page.evaluate(r'''jobs=>{
      const c=document.createElement('canvas');c.width=640;c.height=500;const ctx=c.getContext('2d',{willReadFrequently:true});const output=[];
      for(const j of jobs)for(const [state,n] of Object.entries(j.states))for(let i=0;i<n;i++){
        ctx.clearRect(0,0,640,500);ctx.save();ctx.translate(320,360);ChogArt.render(ctx,j.id,state,i,n,j.empowered);ctx.restore();
        const rgba=ctx.getImageData(0,0,640,500).data;let minX=640,minY=500,maxX=-1,maxY=-1,outside=0;
        const left=320-j.anchorX,top=360-j.anchorY,right=left+j.cellW,bottom=top+j.cellH;
        for(let y=0;y<500;y++)for(let x=0;x<640;x++){if(rgba[(y*640+x)*4+3]<40)continue;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(x<left||x>=right||y<top||y>=bottom)outside++;}
        output.push({id:j.variant,state,frame:i,unclippedBBox:[minX-320,minY-360,maxX+1-320,maxY+1-360],pixelsOutsideCell:outside,excessBottom:Math.max(0,maxY+1-bottom),excessLeft:Math.max(0,left-minX),excessRight:Math.max(0,maxX+1-right)});
      }return output;
    }''',jobs)
    # Live-rendered diagnostic board: no source or atlas image is changed.
    page.evaluate(r'''() => {
      document.querySelector('#animated').checked=false;
      document.querySelector('header').remove();document.body.style.cssText='margin:0;padding:20px;background:#f8f0dd;font:16px sans-serif';document.querySelector('main').remove();
      const title=document.createElement('h1');title.textContent='CHOG rig audit / current baked pose model';document.body.append(title);
      const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:10px';document.body.append(grid);
      for(const id of Object.keys(ChogArt.designs)){
        const a=document.createElement('article');a.style.cssText='border:2px solid #211827;background:#efe5d3';a.innerHTML='<h2>'+id+' / idle → crouch → overhead</h2>';
        const c=document.createElement('canvas');c.width=540;c.height=250;c.style.cssText='width:100%;height:auto';a.append(c);grid.append(a);const ctx=c.getContext('2d');
        for(const [i,state] of ['idle','crouch','attack2'].entries()){
          ctx.save();ctx.translate(90+i*180,210);ctx.strokeStyle='#b84b43';ctx.beginPath();ctx.moveTo(-85,0);ctx.lineTo(85,0);ctx.stroke();ChogArt.render(ctx,id,state,state==='idle'?0:2,4);ctx.restore();
        }
      }
    }''')
    page.screenshot(path=str(OUT/'rig-board.png'),full_page=True)
    b.close()
(OUT/'unclipped-rig.json').write_text(json.dumps(measured,indent=2)+'\n')
clipped=[r for r in measured if r['pixelsOutsideCell']>0]

def audio_measure(path):
    pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-acodec','pcm_f32le','-'])
    samples=np.frombuffer(pcm,dtype='<f4')
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(path)]))['streams'][0]
    loud=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=print_format=json','-f','null','-'],capture_output=True,text=True).stderr
    match=re.search(r'\{\s*"input_i".*?\}',loud,re.S);ln=json.loads(match.group()) if match else {}
    peak=float(np.max(np.abs(samples)));rms=float(np.sqrt(np.mean(samples.astype(float)**2)))
    return {'file':str(path.relative_to(ROOT)),'sampleRate':int(probe['sample_rate']),'channels':int(probe['channels']),'decodedSeconds':len(samples)/int(probe['sample_rate'])/int(probe['channels']),'samplePeakDbFS':20*math.log10(max(peak,1e-12)),'rmsDbFS':20*math.log10(max(rms,1e-12)),'integratedLUFS':ln.get('input_i'),'truePeakDbTP':ln.get('input_tp'),'decodedPcmSHA256':hashlib.sha256(pcm).hexdigest(),'nearFullScaleSamples':int(np.count_nonzero(np.abs(samples)>=.999))}
with ThreadPoolExecutor(max_workers=4) as pool: audio=list(pool.map(audio_measure,sorted((ROOT/'assets/chog/audio').glob('*.mp3'))))
duplicates=defaultdict(list)
for row in audio:duplicates[row['decodedPcmSHA256']].append(row['file'])
paired=[names for names in duplicates.values() if len(names)>1]
(OUT/'audio.json').write_text(json.dumps({'files':audio,'identicalDecodedGroups':paired,'limitations':'Technical signal/file audit. No physical-device or calibrated speaker listening test.'},indent=2)+'\n')
# Palette ratios: foreground/background contrast measurements, not a conformance claim for the entire game.
colors={'ink':'211827','paper':'f8f0dd','purple':'904de2','lilac':'d8b7f5','yellow':'ffe13b','coral':'ff674f','blue':'56ccff','p1Reserve':'a6e7ff','cpuReserve':'ffbcae'}
def lum(hex):
    rgb=[int(hex[i:i+2],16)/255 for i in [0,2,4]];linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb];return sum(v*w for v,w in zip(linear,[.2126,.7152,.0722]))
pairs=[]
for a,z in [('ink','paper'),('ink','yellow'),('ink','blue'),('ink','coral'),('purple','paper'),('purple','lilac'),('blue','p1Reserve'),('coral','cpuReserve')]:
    x,y=sorted([lum(colors[a]),lum(colors[z])]);pairs.append({'a':a,'b':z,'ratio':(y+.05)/(x+.05)})
(OUT/'palette.json').write_text(json.dumps({'colors':colors,'pairs':pairs},indent=2)+'\n')
summary={'frames':len(atlas_rows),'clippedFrames':len(clipped),'clippedByState':{state:sum(r['state']==state for r in clipped) for state in sorted({r['state'] for r in clipped})},'maxBottomExcess':max(r['excessBottom'] for r in measured),'audioFiles':len(audio),'uniqueDecodedAudio':len(duplicates),'identicalDecodedGroups':paired,'paletteRatios':pairs}
(OUT/'art-audio-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
