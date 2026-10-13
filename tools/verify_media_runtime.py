"""Browser decoding, stale-cache removal and runtime media origin checks."""
from pathlib import Path
import json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
base='http://127.0.0.1:5173'
errors=[];failures=[];requests=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':720})
    page=context.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    page.on('response',lambda r:failures.append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    page.goto(base+'/tools/effect-preview.html')
    page.evaluate("async () => {const c=await caches.open('chog-clash-assets-v1');await c.put('assets/stage.webp',new Response('stale placeholder'));}")
    page.goto(base+'/play.html?touch=0',wait_until='load')
    page.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")',timeout=60000)
    page.wait_for_function('!!navigator.serviceWorker.controller',timeout=15000)
    caches=page.evaluate('caches.keys()')
    assert 'chog-clash-assets-v1' not in caches,caches
    audio=page.evaluate('''async () => {
      const context=new (window.AudioContext||window.webkitAudioContext)();
      const files=CHOG_PRECACHE.files.map(f=>f[0]).filter(f=>f.endsWith('.mp3'));
      const results=[];
      for(const file of files){
        const res=await fetch(file);if(!res.ok)throw Error(file);
        const buffer=await context.decodeAudioData(await res.arrayBuffer());
        if(!(buffer.duration>.1)||buffer.numberOfChannels<1)throw Error('Invalid audio '+file);
        results.push({file,duration:buffer.duration,channels:buffer.numberOfChannels});
      }
      await context.close();return results;
    }''')
    assert len(audio)>=45,len(audio)
    page.evaluate('async()=>{__game.manual=true;await __game.prepareAll();}')
    page.click('[data-cmd=training]')
    page.wait_for_function('__game.snapshot().audioState==="running"')
    page.evaluate('FrontEnd.home()')
    for i,stage in enumerate(['rayj-house','cwo-alley','house-cup','neon-street','cwo-rally']):
        page.evaluate('stage=>{__game.startMatch({player:"rogue",enemy:"tonashiro",mode:"training",stage});__game.advance(1);}',stage)
        page.screenshot(path=str(ROOT/'validation'/('arena-'+stage+'.png')))
    page.evaluate('''() => {
      __game.startMatch({player:'yot',enemy:'mamio',mode:'training'});
      __game.cast('ultimate');__game.advance(.1);
    }''')
    page.screenshot(path=str(ROOT/'validation/chog-ultimate.png'))
    media=[url for url in requests if Path(urlparse(url).path).suffix.lower() in {'.webp','.png','.jpg','.svg','.mp3','.ttf','.mp4'}]
    assert all(urlparse(url).path.startswith('/assets/chog/') for url in media),media
    assert not errors,errors
    assert not failures,failures
    browser.close()
report={'status':'passed','decoded_audio':audio,'runtime_media_requests':len(media),
        'all_media_in_chog_namespace':True,'old_cache_removed':True,'caches':caches,
        'arenas_rendered':5,'javascript_errors':errors,'http_errors':failures}
(ROOT/'validation/media-runtime.json').write_text(json.dumps(report,indent=2)+'\n')
print(str(len(audio))+' audio files decoded; five arenas rendered; all media are CHOG; old cache removed.')
