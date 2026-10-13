"""Read-only browser audit of game presentation and combat behavior, excluding landing edits.
Writes evidence into validation/audit. Known defects are observations, not assertions.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'validation/audit'
OUT.mkdir(exist_ok=True)
BASE='http://127.0.0.1:5173'
report={'scope':'post-landing game; no runtime edits','errors':[],'http_errors':[],'viewports':[],'probes':{}}
INSTRUMENT=r'''(() => {
 const original=CanvasRenderingContext2D.prototype.drawImage;
 window.__auditCapture=false;window.__auditDraws=[];
 CanvasRenderingContext2D.prototype.drawImage=function(im,...args){
   if(window.__auditCapture&&im?.src){const m=this.getTransform();window.__auditDraws.push({src:im.src,args,matrix:[m.a,m.b,m.c,m.d,m.e,m.f]});}
   return original.call(this,im,...args);
 };
})()'''
METRICS=r'''() => {
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
 const selectors=['.mode-kicker','.bar-caption','.fighter-mark','.skill-name','.skill-art kbd','.round-wins','.class-tag','.dossier-moves span','.dossier-moves kbd','.card-name','.collection-note','.setting-row small'];
 const typography=Object.fromEntries(selectors.map(s=>[s,[...document.querySelectorAll(s)].filter(visible).map(e=>({text:e.textContent.trim(),px:parseFloat(getComputedStyle(e).fontSize),color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}))]));
 const buttons=[...document.querySelectorAll('button')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent.trim().slice(0,50)||e.getAttribute('aria-label'),w:r.width,h:r.height,x:r.x,y:r.y,below44:r.width<44||r.height<44};});
 return {typography,buttons,horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
}'''

def start(page,player='rogue',enemy='tabsu',mode='training',stage='house-cup'):
    page.evaluate('o=>{__game.startMatch(o);__game.manual=true;__game.setAI(false);__game.draw();}',dict(player=player,enemy=enemy,mode=mode,stage=stage))

def capture(page):
    return page.evaluate('''() => {__auditDraws=[];__auditCapture=true;__game.draw();__auditCapture=false;return __auditDraws;}''')

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,args=['--no-sandbox'])
    c=b.new_context(viewport={'width':1280,'height':720},reduced_motion='reduce')
    c.add_init_script(INSTRUMENT)
    page=c.new_page()
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('response',lambda r:report['http_errors'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    page.goto(BASE+'/play.html?touch=0')
    page.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")',timeout=60000)
    page.evaluate('__game.manual=true')
    for w,h in [(1280,720),(1440,900),(1024,768),(1920,800),(844,390),(740,360),(768,1024)]:
        page.set_viewport_size({'width':w,'height':h})
        page.evaluate('FrontEnd.home()')
        page.click('[data-cmd=versus]')
        menu=page.evaluate(METRICS)
        page.screenshot(path=str(OUT/f'roster-{w}x{h}.png'))
        page.click('[data-fighter=ping]');page.click('[data-cmd=confirm]')
        page.wait_for_function('document.querySelector("#front-menu").dataset.step==="1"')
        page.click('[data-fighter=cookie]');page.click('[data-cmd=confirm]')
        page.wait_for_function('document.querySelector("#front-menu").dataset.screen==="arena"')
        arena=page.evaluate(METRICS)
        start(page)
        draws=capture(page)
        hud=page.evaluate(METRICS)
        page.screenshot(path=str(OUT/f'combat-{w}x{h}.png'))
        report['viewports'].append({'width':w,'height':h,'combat_scale':min(w/1280,h/720),'backdrop_scale':max(w/1280,h/720),'relative_fighter_scale':min(w/1280,h/720)/max(w/1280,h/720),'menu':menu,'arena':arena,'hud':hud,'draws':draws})
    page.set_viewport_size({'width':1280,'height':720})
    for stage in ['rayj-house','cwo-alley','house-cup','neon-street','cwo-rally']:
        start(page,player='venty',enemy='tonashiro',stage=stage)
        page.screenshot(path=str(OUT/f'stage-{stage}.png'))
    start(page)
    page.evaluate('__game.setHitboxes(true)')
    page.screenshot(path=str(OUT/'hitboxes.png'))
    page.evaluate('__game.setHitboxes(false)')
    for hp in [200,100,50]:
        page.evaluate('hp=>{__game.hero.hp=hp;__game.draw()}',hp)
        page.screenshot(path=str(OUT/f'health-{hp}.png'))
    page.click('#settings-btn')
    report['settings']=page.evaluate(METRICS)
    page.screenshot(path=str(OUT/'settings-desktop.png'))
    page.click('#close-settings')

    report['probes']['quake_rate']=page.evaluate('''() => {
      const g=__game,run=side=>{g.startMatch({player:'bigchog',enemy:'bigchog',mode:'training'});g.setAI(false);side==='player'?g.cast('ultimate'):g.enemyCast('ultimate');g.advance(.3);const s=g.snapshot();const q=side==='player'?s.quake:s.enemyQuake;return {elapsedSimulated:.3,groupTime:q?.t,phase:q?.phase,slams:q?.slams};};
      return {player:run('player'),enemy:run('enemy')};
    }''')
    report['probes']['held_movement_during_stun']=page.evaluate('''() => {
      const g=__game;g.startMatch({player:'rogue',enemy:'tabsu',mode:'training'});g.setAI(false);g.receiveHit(12);g.press('d');g.advance(.6);const x=g.hero.x;g.advance(.3);const heldDelta=g.hero.x-x;g.release('d');g.press('d');g.advance(.3);return {heldDelta,repressedDelta:g.hero.x-x,hurtTime:g.hero.hurtTime};
    }''')
    report['probes']['skill_invulnerability']=page.evaluate('''() => {
      const g=__game;g.startMatch({player:'rogue',enemy:'rogue',mode:'training'});g.setAI(false);g.cast('skill1');const incoming=g.receiveHit(12);const hp=g.hero.hp;
      g.startMatch({player:'rogue',enemy:'rogue',mode:'training'});g.setAI(false);g.hero.x=530;g.dummy.x=620;g.enemyCast('skill1');const before={...g.dummy.action};g.attack(1);g.advance(.2);return {playerDamageAccepted:incoming,playerHP:hp,enemyWasCasting:before.type,enemyDamage:g.dummy.damage,enemyAction:g.dummy.action,enemyState:g.dummy.state};
    }''')
    report['probes']['attack_hit_timing']=page.evaluate('''() => CHOG.characters.map(c=>{
      const g=__game;g.startMatch({player:c.id,enemy:c.id,mode:'training'});g.setAI(false);g.attack(3);const player={duration:g.hero.action.duration,hitAt:g.hero.action.hitAt??.5};g.enemyCast('attack',3);const enemy={duration:g.dummy.action.duration,hitAt:g.dummy.action.hitAt??.5};return {id:c.id,player,enemy,deltaMs:(enemy.hitAt*enemy.duration-player.hitAt*player.duration)*1000};
    })''')
    report['probes']['projectile_recovery']=page.evaluate('''() => {
      const g=__game;g.startMatch({player:'rogue',enemy:'tabsu',mode:'training'});g.setAI(false);g.cast('skill1');const duration=g.hero.action.duration;g.advance(.26);return {duration,simulated:.26,action:g.hero.action,state:g.hero.state};
    }''')
    report['probes']['combo_after_recovery']=page.evaluate('''() => {
      const g=__game;g.startMatch({player:'rogue',enemy:'tabsu',mode:'training'});g.setAI(false);g.hero.x=530;g.dummy.x=620;g.attack(1);g.advance(.2);g.advance(1);const before={dummyState:g.dummy.state,combo:g.snapshot().comboHits};g.attack(1);g.advance(.2);return {before,after:{dummyState:g.dummy.state,combo:g.snapshot().comboHits,totalDamage:g.snapshot().totalDamage},gapSeconds:1};
    }''')
    report['probes']['hit_sfx_duplicate']=page.evaluate('''() => {
      const g=__game,run=owner=>{g.startMatch({player:'rogue',enemy:'rogue',mode:'training'});g.setAI(false);g.hero.x=530;g.dummy.x=620;const before=g.snapshot().audioSources;if(owner==='player')g.attack(1);else g.enemyCast('attack',1);g.advance(.2);return {newSources:g.snapshot().audioSources-before,heroHP:g.hero.hp,enemyDamage:g.dummy.damage};};return {player:run('player'),enemy:run('enemy')};
    }''')
    report['probes']['legacy_round_name']=page.evaluate('''() => {
      const g=__game;g.startMatch({player:'rogue',enemy:'tabsu',mode:'versus'});g.setAI(false);g.advance(2);g.dummy.damage=200;g.advance(.01);return {publicPlayer:g.snapshot().selectedCharacter,detail:document.querySelector('#round-call-detail').textContent,score:g.snapshot().match.playerWins};
    }''')
    page.screenshot(path=str(OUT/'legacy-round-name.png'))
    report['probes']['restart_hotkey_in_versus']=page.evaluate('''() => {const g=__game;const before=g.snapshot().match;g.press('r');return {before,after:g.snapshot().match};}''')
    start(page)
    report['probes']['reduced_motion_cutin']=page.evaluate('''() => {
      const g=__game;g.cast('ultimate');g.draw();const before=document.querySelector('#ultimate-cutin').style.transform;g.advance(.08);return {systemReduce:matchMedia('(prefers-reduced-motion:reduce)').matches,before,after:document.querySelector('#ultimate-cutin').style.transform};
    }''')
    start(page)
    report['probes']['reduced_motion_shake']=page.evaluate('''() => {__game.receiveHit(12,{freeze:false});__game.advance(.01);return {systemReduce:matchMedia('(prefers-reduced-motion:reduce)').matches,trauma:__game.snapshot().trauma};}''')
    report['probes']['reduced_motion_shake']['draws']=capture(page)
    page.evaluate('FrontEnd.home()')
    report['probes']['hidden_game_mutations']=page.evaluate('''async () => {
      let mutations=0;const root=document.querySelector('#game-shell'),m=new MutationObserver(entries=>mutations+=entries.length);m.observe(root,{attributes:true,subtree:true,childList:true});await new Promise(r=>setTimeout(r,1000));m.disconnect();return {menuOpen:__game.snapshot().menuOpen,oneSecondMutations:mutations};
    }''')
    page.click('[data-cmd=settings]')
    page.fill('#volume-slider','9');page.locator('#volume-slider').dispatch_event('input')
    before=page.locator('#volume-value').input_value()
    page.reload();page.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")',timeout=60000)
    report['probes']['sfx_preference_reload']={'before':before,'after':page.locator('#volume-value').input_value()}

    # Touch menus, settings and gameplay, in an actual landscape browser viewport.
    tc=b.new_context(viewport={'width':740,'height':360},has_touch=True,is_mobile=True,reduced_motion='reduce')
    tp=tc.new_page();tp.goto(BASE+'/play.html?touch=1&embed=1');tp.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")',timeout=60000);tp.evaluate('__game.manual=true')
    tp.locator('[data-cmd=versus]').tap();tp.locator('[data-cmd=confirm]').tap();tp.wait_for_function('document.querySelector("#front-menu").dataset.step==="1"');tp.locator('[data-cmd=confirm]').tap();tp.wait_for_function('document.querySelector("#front-menu").dataset.screen==="arena"')
    report['touch_arena']=tp.evaluate(METRICS);tp.screenshot(path=str(OUT/'touch-arena.png'))
    tp.locator('[data-cmd=start]').tap();tp.evaluate('__game.advance(2)');tp.screenshot(path=str(OUT/'touch-combat.png'))
    tp.locator('#settings-btn').tap();report['touch_settings']=tp.evaluate(METRICS);tp.screenshot(path=str(OUT/'touch-settings.png'))
    b.close()
(OUT/'browser.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'viewports':len(report['viewports']),'errors':report['errors'],'http_errors':report['http_errors'],'probes':{k:v for k,v in report['probes'].items() if k not in ['attack_hit_timing','reduced_motion_shake']}},indent=2))
