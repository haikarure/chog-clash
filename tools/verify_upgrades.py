"""Regression of actual audit defects, art bounds, settings, and staged loading.

Original evidence remains in validation/audit. This writes validation/upgrades.
"""
from pathlib import Path
import json,hashlib,time,subprocess,os
from concurrent.futures import ThreadPoolExecutor
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'validation/upgrades';OUT.mkdir(exist_ok=True)
BASE=os.environ.get('CHOG_TEST_URL','http://localhost:5174');report={'checks':{},'errors':[],'httpErrors':[]}
def manifest(path):return json.JSONDecoder().raw_decode(path.read_text().split('=',1)[1].lstrip())[0]
def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  context=browser.new_context(viewport={'width':1280,'height':720},service_workers='block');page=context.new_page()
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.on('response',lambda r:report['httpErrors'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
  page.goto(BASE+'/play.html?touch=0');page.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")')
  # The menu does not wait for unselected sprite sheets or spoken media.
  initial=page.evaluate('performance.getEntriesByType("resource").map(e=>e.name)')
  assert not any('sprite-sheet' in url for url in initial),initial
  assert not any(url.endswith('.mp3') for url in initial),initial
  report['checks']['menuHasNoAtlasOrAudioDependency']=True
  page.evaluate('async()=>{__game.manual=true;await __game.prepareAll();}')
  page.evaluate('()=>{__game.startMatch({player:"rogue",enemy:"tabsu",mode:"training"});__game.setAI(false);}')
  # Holding a direction through hitstun resumes movement without another key-down.
  result=page.evaluate('''()=>{
   const g=__game;g.receiveHit(6);const before=g.hero.x;g.press('d');g.advance(.75);g.release('d');return g.hero.x-before;
  }''');assert result>20,result;report['checks']['heldDirectionAfterHurt']=result
  report['checks']['ownerTimingParity']=page.evaluate('''()=>{
   const g=__game,results=[];
   for(const c of CHOG.characters){g.startMatch({player:c.id,enemy:c.id,mode:'training'});g.setAI(false);g.attack(3);g.enemyCast('attack',3);
    const player=g.hero.action,enemy=g.dummy.action;if(player.duration!==enemy.duration||player.hitAt!==enemy.hitAt)throw Error(c.id+' owner timing');results.push(c.id);}
   return results;
  }''')
  report['checks']['castVulnerabilityAndCancellation']=page.evaluate('''()=>{
   const g=__game,results=[];
   for(const id of ['rogue','mamio']){
    g.startMatch({player:id,enemy:'yot',mode:'training'});g.setAI(false);g.cast(id==='mamio'?'ultimate':'skill1');if(!g.receiveHit(6)||g.hero.action||g.hero.transformPending>0)throw Error(id+' player cast not interrupted');
    g.startMatch({player:'yot',enemy:id,mode:'training'});g.setAI(false);Object.assign(g.hero,{x:530,facing:1});Object.assign(g.dummy,{x:625,facing:-1});g.enemyCast(id==='mamio'?'ultimate':'skill1');g.attack();g.advance(.28);
    if(g.dummy.damage!==6||g.dummy.action||g.dummy.transformPending>0)throw Error(id+' CPU cast not interrupted');results.push(id);
   }return results;
  }''')
  result=page.evaluate('''()=>{
   const g=__game;g.startMatch({player:'rogue',enemy:'tabsu',mode:'training'});g.setAI(false);g.hero.x=530;g.dummy.x=625;g.attack();g.advance(.9);
   if(g.snapshot().comboHits!==0)throw Error('Combo survived recovered dummy');g.hero.x=530;g.dummy.x=625;g.attack();g.advance(.27);return g.snapshot().comboHits;
  }''');assert result==1,result;report['checks']['trueComboReset']=True
  result=page.evaluate('''()=>{
   const g=__game;g.startMatch({player:'rogue',enemy:'tabsu',mode:'versus'});g.setAI(false);g.advance(3);g.dummy.damage=200;g.advance(.1);g.press('r');
   return {wins:g.snapshot().match.playerWins,banner:document.querySelector('#round-call-detail').textContent};
  }''');assert result['wins']==1 and 'ROGUE' in result['banner'],result;report['checks']['vsResetAndPublicName']=result
  page.evaluate('()=>{__game.startMatch({player:"rogue",enemy:"tabsu",mode:"training"});__game.setAI(false);__game.hero.hp=100;__game.dummy.damage=100;__game.draw();}')
  assert page.locator('#health-fill').evaluate('e=>e.style.width')=='50%'
  assert page.locator('#guard-fill').evaluate('e=>e.style.width')=='50%'
  assert page.locator('#guard-label').is_visible();page.screenshot(path=str(OUT/'health-half.png'))
  report['checks']['healthHalfIsHalfWidth']=True
  page.emulate_media(reduced_motion='reduce')
  page.evaluate('__game.cast("ultimate");__game.advance(.08)')
  assert page.locator('#ultimate-cutin').evaluate('e=>e.style.transform')=='translateX(0%) rotate(0deg)'
  report['checks']['reducedMotionStaticCutin']=True;page.emulate_media(reduced_motion='no-preference')
  # Audio resolver plays one two-layer impact for either owner.
  page.locator('#arena').click(position={'x':30,'y':450});page.wait_for_function('__game.snapshot().audioState==="running"')
  audio=page.evaluate('''()=>{
   const g=__game,out=[];
   for(const owner of ['player','enemy']){g.startMatch({player:'rogue',enemy:'rogue',mode:'training'});g.setAI(false);g.hero.x=530;g.dummy.x=625;const before=g.snapshot().audioSources;if(owner==='player')g.attack();else g.enemyCast('attack');g.advance(.25);out.push(g.snapshot().audioSources-before);}return out;
  }''');assert audio==[2,2],audio;report['checks']['singleImpactBothOwners']=audio
  # Rebind through the visible settings controls, then use the actual keyboard.
  page.evaluate('__game.startMatch({player:"rogue",enemy:"tabsu",mode:"training"});__game.setAI(false)')
  page.locator('#settings-btn').click();page.locator('summary',has_text='Customize keyboard').click();page.locator('#binding-grid button',has_text='Move right').click();page.keyboard.press('k');page.locator('#close-settings').click()
  before=page.evaluate('__game.hero.x');page.keyboard.down('k');page.evaluate('__game.advance(.2)');page.keyboard.up('k');assert page.evaluate('__game.hero.x')>before
  report['checks']['keyboardRebind']=True
  page.locator('#settings-btn').click()
  page.locator('#volume-slider').evaluate("e=>{e.value='9';e.dispatchEvent(new Event('input',{bubbles:true}));}")
  page.locator('#voice-slider').evaluate("e=>{e.value='65';e.dispatchEvent(new Event('input',{bubbles:true}));}")
  page.reload();page.wait_for_function('window.__game?.snapshot().ready')
  assert page.locator('#volume-slider').input_value()=='9';assert page.locator('#voice-slider').input_value()=='65';report['checks']['independentAudioPreferencesPersist']=True
  # Hidden gameplay no longer rewrites the DOM thousands of times per second.
  count=page.evaluate('''async()=>{let count=0;const o=new MutationObserver(events=>count+=events.length);o.observe(document.querySelector('#game-shell'),{subtree:true,attributes:true,childList:true,characterData:true});await new Promise(r=>setTimeout(r,1000));o.disconnect();return count;}''')
  assert count<10,count;report['checks']['hiddenGameMutationsPerSecond']=count
  # Check authoritative geometry and primary readable text at desktop/touch sizes.
  page.evaluate('async()=>{__game.manual=true;await __game.prepareMatch({player:"rogue",enemy:"tabsu"});__game.startMatch({player:"rogue",enemy:"tabsu",mode:"training"});__game.setAI(false);__game.setHitboxes(true);__game.advance(.1);}')
  page.screenshot(path=str(OUT/'collision-overlay.png'))
  sizes=[]
  for width,height in [(1280,720),(1024,768),(1920,800),(844,390),(740,360)]:
   page.set_viewport_size({'width':width,'height':height});page.evaluate('__game.draw()')
   row=page.evaluate('''()=>({hp:parseFloat(getComputedStyle(document.querySelector('#health-label')).fontSize),skill:parseFloat(getComputedStyle(document.querySelector('.skill-name')).fontSize),pause:document.querySelector('#pause-btn').getBoundingClientRect().height})''')
   assert row['hp']>=12 and row['skill']>=12 and row['pause']>=44,row;sizes.append(dict(width=width,height=height,**row));page.screenshot(path=str(OUT/f'combat-{width}x{height}.png'))
  report['checks']['readablePrimaryHud']=sizes
  context.close()
  # Browser-independent art bounds check against the full unclipped rig.
  page=browser.new_page();page.goto(BASE+'/tools/effect-preview.html');page.evaluate('ART_READY')
  jobs=[]
  for path in sorted((ROOT/'assets/chog/fighters').rglob('manifest.js')):
   m=manifest(path);cid=path.parent.relative_to(ROOT/'assets/chog/fighters').parts[0]
   jobs.append(dict(id=cid,empowered=path.parent.name=='empowered',width=m['cell']['width'],height=m['cell']['height'],anchorX=m['cell']['width']/2,anchorY=m['cell']['height']-m['cell']['safe_margin_y'],states={s:len(fs) for s,fs in m['frame_layout']['rows'].items()}))
  art=page.evaluate('''jobs=>{
   const c=document.createElement('canvas');c.width=1024;c.height=768;const ctx=c.getContext('2d',{willReadFrequently:true});const failures=[],heights={};let count=0;
   for(const j of jobs)for(const [state,n] of Object.entries(j.states))for(let frame=0;frame<n;frame++){
    ctx.clearRect(0,0,1024,768);ctx.save();ctx.translate(512,580);ChogArt.render(ctx,j.id,state,frame,n,j.empowered);ctx.restore();const data=ctx.getImageData(0,0,1024,768).data;let outside=0,top=768,bottom=0;
    for(let y=0;y<768;y++)for(let x=0;x<1024;x++)if(data[(y*1024+x)*4+3]>=40){top=Math.min(top,y);bottom=Math.max(bottom,y+1);if(x<512-j.anchorX||x>=512+j.width-j.anchorX||y<580-j.anchorY||y>=580+j.height-j.anchorY)outside++;}
    if(outside)failures.push({id:j.id,state,frame,outside});if(state==='idle'&&frame===0&&!j.empowered)heights[j.id]=bottom-top;count++;
   }return {frames:count,clipped:failures,firstIdleHeightIncludingProps:heights};
  }''',jobs)
  assert not art['clipped'],art['clipped'];assert art['frames']==867,art
  report['checks']['rig']=art
  browser.close()
 # Signal integrity and uniqueness of all new spoken cues.
 voice=json.loads((ROOT/'assets/chog/audio/voice-production.json').read_text());pcm=[]
 for row in voice['clips']:
  decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(ROOT/row['file']),'-f','s16le','-'])
  pcm.append(hashlib.sha256(decoded).hexdigest())
 assert len(set(pcm))==44;report['checks']['uniqueSpokenCues']=44
 before=json.loads((ROOT/'validation/audit/landing-baseline.json').read_text())
 changes=[name for name,digest in before.items() if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest]
 assert not changes,changes;report['checks']['landingFilesUnchanged']=len(before)
 assert not report['errors'] and not report['httpErrors'],report
 report['status']='passed';(OUT/'regression.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
