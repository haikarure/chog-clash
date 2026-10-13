"""Browser integration checks for the complete CHOG roster and original combat.

Run the CHOG server on 5173. Optional --baseline http://127.0.0.1:5174
compares deterministic combat scenarios against an untouched Aether checkout.
"""
from pathlib import Path
import argparse
import hashlib
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'validation'
ROSTER = json.loads((ROOT / 'chog-roster.json').read_text())['characters']

SCENARIOS = r"""roster => {
  const g=window.__game;g.manual=true;Math.random=()=>.5;
  const results=[];
  for(const c of roster)for(const owner of ['player','enemy'])for(const move of ['attack1','attack2','attack3','skill1','skill2','ultimate']) {
    const id=c.runtime||c.id;
    if(!g.startMatch({player:owner==='player'?id:'arco',enemy:owner==='enemy'?id:'arco',mode:'training'}))throw Error('Cannot start '+id);
    g.setAI(false);g.clearInput();
    Object.assign(g.hero,{x:530,y:g.config.groundY,hp:200,vx:0,vy:0,facing:1,grounded:true,invuln:0,action:null});
    Object.assign(g.dummy,{x:625,y:g.config.groundY,damage:0,vx:0,vy:0,facing:-1,grounded:true,invuln:0,action:null});
    const index=Number(move.slice(-1)),slot=move.startsWith('attack')?'attack':move;
    const started=owner==='player'?(slot==='attack'?g.attack(index):g.cast(slot)):g.enemyCast(slot,index||1);
    if(!started)throw Error(c.id+' '+owner+' '+move+' did not start');
    g.advance(.1);
    const immediate=g.snapshot(),actor=owner==='player'?immediate.hero:immediate.dummy;
    if(!actor.action&&!actor.transformPending&&!actor.formTime)throw Error('No animation/action '+c.id+' '+move);
    if(slot==='ultimate' && !document.querySelector('#ultimate-cutin').classList.contains('visible'))throw Error('No ultimate cut-in '+c.id+' '+owner);
    g.advance(2.5);
    const s=g.snapshot(),a=owner==='player'?s.hero:s.dummy;
    results.push({id:c.id,owner,move,damage:owner==='player'?s.dummy.damage:200-s.hero.hp,
      cooldowns:a.cooldowns,form:a.form,formTime:a.formTime,action:a.action?.name||null,
      x:a.x,y:a.y});
  }
  return results;
}"""


def wait_ready(page, base, entry="play.html"):
    page.goto(base + '/' + entry + '?touch=0', wait_until='load')
    page.wait_for_function('window.__game && __game.snapshot().ready', timeout=60000)
    page.wait_for_function('!document.getElementById("boot")', timeout=10000)
    page.evaluate('async () => {__game.manual=true;await __game.prepareAll();}')


def checks(base, baseline=None):
    OUT.mkdir(exist_ok=True)
    report={'checked_on':'2026-10-12','baseline_commit':ROSTER and json.loads((ROOT/'chog-roster.json').read_text())['reference']['commit'],
            'roster':12,'startup_pairs':0,'combat_scenarios':0,'errors':[], 'failed_requests':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':900})
        page=context.new_page()
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('response',lambda r:report['failed_requests'].append({'url':r.url,'status':r.status}) if r.status>=400 and not r.url.endswith('favicon.ico') else None)
        wait_ready(page,base)
        page.screenshot(path=str(OUT/'home.png'))
        # All 144 combinations render their respective player/CPU portraits and identities.
        pairs=page.evaluate(r"""ids => {
          let count=0;const g=__game;
          for(const player of ids)for(const enemy of ids){
            if(!g.startMatch({player,enemy,mode:'training'}))throw Error(player+' vs '+enemy);
            g.advance(.01);const s=g.snapshot();
            if(s.selectedCharacter!==player||s.opponentCharacter!==enemy)throw Error('ID mapping');
            if(document.querySelector('#player-name').textContent!==CHOG.get(player).name||document.querySelector('#enemy-name').textContent!==CHOG.get(enemy).name)throw Error('HUD mapping');
            if(!s.spriteLoaded||!s.manifestLoaded)throw Error('Missing atlas');count++;
          }return count;
        }""",[c['id'] for c in ROSTER])
        report['startup_pairs']=pairs
        combat=page.evaluate(SCENARIOS,ROSTER)
        report['combat_scenarios']=len(combat)
        report['combat_results']=combat
        if baseline:
            original=context.new_page()
            # Add the same manual-only QA hook to the response in memory, leaving the checkout untouched.
            def expose(route):
                response=route.fetch()
                text=response.text().replace('startMatch,setMenuOpen,menuSound,','enemyCast: cpuStart,startMatch,setMenuOpen,menuSound,',1)
                route.fulfill(response=response,body=text)
            original.route('**/game.js',expose)
            wait_ready(original,baseline,entry="")
            reference=original.evaluate(SCENARIOS,[{**c,'runtime':c['source_kit_id']} for c in ROSTER])
            assert combat==reference, 'Combat changed from Aether: '+str([(a,b) for a,b in zip(combat,reference) if a!=b][:3])
            report['baseline_combat']='144 scenarios identical to pinned Aether source'
            original.close()
        # Mamio transformation, empowered skills, and return on both sides.
        report['mamio_forms']=page.evaluate(r"""() => {
          const g=__game,results=[];
          for(const owner of ['player','enemy']){
            g.startMatch({player:owner==='player'?'mamio':'yot',enemy:owner==='enemy'?'mamio':'yot',mode:'training'});
            g.setAI(false);const actor=owner==='player'?g.hero:g.dummy;
            const cast=slot=>owner==='player'?g.cast(slot):g.enemyCast(slot);
            cast('ultimate');g.advance(1.1);
            if(actor.form!=='wolf')throw Error('Mamio empowerment');
            if(document.querySelector(owner==='player'?'#player-class':'#enemy-class').textContent!=='EMPOWERED')throw Error('Empowered HUD');
            for(const slot of ['skill1','skill2']){if(!cast(slot))throw Error('Empowered '+slot);g.advance(1.2);}
            g.advance(13);if(actor.form!=='human'||actor.cooldowns.ultimate<=0)throw Error('Mamio revert/cooldown');
            results.push(owner+' base → empowered → base');
          }return results;
        }""")
        # Trigger the counter and put a target inside the gravity well; neither deals
        # damage to a passive target standing in the melee scenario above.
        report['counter_and_gravity']=page.evaluate(r"""() => {
          const g=__game,results=[];
          for(const owner of ['player','enemy'])for(const fighter of ['toad','cookie']){
            g.startMatch({player:owner==='player'?fighter:'yot',enemy:owner==='enemy'?fighter:'yot',mode:'training'});g.setAI(false);
            const gap=fighter==='cookie'?230:95;
            Object.assign(g.hero,{x:530,y:g.config.groundY,facing:1,grounded:true,invuln:0});
            Object.assign(g.dummy,{x:530+gap,y:g.config.groundY,facing:-1,invuln:0});
            if(owner==='player')g.cast('skill2');else g.enemyCast('skill2');
            if(fighter==='toad'){if(owner==='player')g.enemyCast('attack');else g.attack();}
            g.advance(1.2);
            const damage=owner==='player'?g.dummy.damage:200-g.hero.hp;
            if(damage!==24)throw Error(fighter+' '+owner+' skill2 damage: '+damage);
            results.push({fighter,owner,damage});
          }return results;
        }""")
        # Exercise CPU on every difficulty, on every arena, for every rival.
        report['cpu_matches']=page.evaluate(r"""ids => {
          const g=__game,results=[];const stages=Object.keys(MatchRules.stages),levels=Object.keys(MatchRules.difficulties);
          for(let i=0;i<ids.length;i++){
            g.startMatch({player:'yot',enemy:ids[i],mode:'versus',stage:stages[i%5],level:levels[i%4]});
            g.advance(30);const s=g.snapshot();
            if(!Number.isFinite(s.hero.hp)||!Number.isFinite(s.dummy.x))throw Error('CPU state invalid '+ids[i]);
            if(s.hero.hp===200&&s.match.round===1&&s.dummy.cooldowns.ultimate===0)throw Error('CPU did not engage '+ids[i]);
            results.push({rival:ids[i],stage:s.stageId,level:s.difficulty,round:s.match.round,playerHP:s.hero.hp});
          }return results;
        }""",[c['id'] for c in ROSTER])
        # Round progression, 90-second timeout, first-to-two results and rematch.
        page.evaluate(r"""() => {
          const g=__game;g.startMatch({player:'cookie',enemy:'tabsu',mode:'versus'});g.setAI(false);g.advance(3);
          g.dummy.damage=200;g.advance(.1);if(g.snapshot().match.playerWins!==1)throw Error('Round 1 score');
          g.advance(6);g.dummy.damage=200;g.advance(.1);g.advance(4);
          if(document.querySelector('#front-menu').dataset.screen!=='result')throw Error('Missing result');
        }""")
        assert 'COOKIE WINS' in page.locator('#front-menu').inner_text()
        page.screenshot(path=str(OUT/'result.png'))
        page.click('[data-cmd=rematch]')
        page.wait_for_function('!__game.snapshot().menuOpen')
        assert page.evaluate('__game.snapshot().selectedCharacter')=='cookie'
        assert page.evaluate('__game.snapshot().match.playerWins')==0
        page.evaluate("() => {__game.startMatch({player:'yot',enemy:'mamio',mode:'versus'});__game.setAI(false);__game.advance(3);__game.hero.hp=199;__game.advance(90);}")
        assert page.evaluate('__game.snapshot().match.enemyWins')==1
        report['rounds_results_rematch_timeout']='passed'
        # Actual desktop keyboard and menu selections.
        page.evaluate('FrontEnd.home()')
        page.click('[data-cmd=training]')
        assert page.locator('[data-fighter]').count()==12
        assert page.locator('[data-fighter][aria-disabled=true]').count()==0
        page.screenshot(path=str(OUT/'roster.png'))
        page.click('[data-fighter=rogue]');page.click('[data-cmd=confirm]');page.wait_for_function('document.querySelector("#front-menu").dataset.step==="1"')
        page.click('[data-fighter=toad]');page.click('[data-cmd=confirm]');page.wait_for_function('document.querySelector("#front-menu").dataset.screen==="arena"')
        page.click('[data-stage=cwo-rally]');page.click('[data-cmd=start]');page.wait_for_function('!__game.snapshot().menuOpen')
        assert page.evaluate('__game.snapshot().selectedCharacter')=='rogue'
        page.evaluate('__game.advance(1.5)')
        start_x=page.evaluate('__game.hero.x')
        page.keyboard.down('d');page.evaluate('__game.advance(.2)');page.keyboard.up('d')
        assert page.evaluate('__game.hero.x')>start_x
        page.keyboard.press('w');page.evaluate('__game.advance(.18)')
        assert not page.evaluate('__game.hero.grounded')
        page.keyboard.press('w');page.evaluate('__game.advance(.08)')
        assert page.evaluate('__game.hero.jumps')==2
        page.evaluate('__game.advance(1.2)')
        page.keyboard.press('i');assert page.evaluate('__game.hero.cooldowns.skill1')>0
        page.evaluate('__game.advance(1.2)')
        page.keyboard.press('Escape');assert page.evaluate('__game.snapshot().paused')
        frozen=page.evaluate('__game.hero.x');page.evaluate('__game.advance(1)');assert page.evaluate('__game.hero.x')==frozen
        page.keyboard.press('Escape');assert not page.evaluate('__game.snapshot().paused')
        page.keyboard.press('r');assert page.evaluate('__game.snapshot().totalDamage')==0
        report['keyboard_pause_reset']='passed'
        page.evaluate("() => {__game.startMatch({player:'yot',enemy:'mamio',mode:'training'});__game.advance(1.5);}")
        page.screenshot(path=str(OUT/'combat.png'))
        # Mobile landscape shell with Android emulation and actual menu taps.
        mobile=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=1,
          user_agent='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')
        mp=mobile.new_page();mp.on('pageerror',lambda e:report['errors'].append('mobile: '+str(e)))
        mp.goto(base+'/mobile.html?touch=1',wait_until='load')
        frame=mp.frame(name='game') or mp.frames[1]
        frame.wait_for_function('window.__game && __game.snapshot().ready',timeout=60000)
        frame.wait_for_function('!document.getElementById("boot")')
        frame.evaluate('async()=>{__game.manual=true;await __game.prepareAll();}')
        frame.locator('[data-cmd=training]').tap();frame.locator('[data-fighter=ping]').tap();frame.locator('[data-cmd=confirm]').tap()
        frame.wait_for_function('document.querySelector("#front-menu").dataset.step==="1"')
        frame.locator('[data-fighter=bigchog]').tap();frame.locator('[data-cmd=confirm]').tap()
        frame.wait_for_function('document.querySelector("#front-menu").dataset.screen==="arena"')
        frame.locator('[data-cmd=start]').tap();frame.wait_for_function('!__game.snapshot().menuOpen');frame.evaluate('__game.advance(1.5)')
        arrow=frame.locator('.dbtn-right');x=frame.evaluate('__game.hero.x')
        arrow.dispatch_event('pointerdown',{'pointerId':91,'pointerType':'touch','bubbles':True});frame.evaluate('__game.advance(.2)');arrow.dispatch_event('pointerup',{'pointerId':91,'pointerType':'touch','bubbles':True})
        assert frame.evaluate('__game.hero.x')>x
        skill=frame.locator('.tbtn-s1');skill.tap();assert frame.evaluate('__game.hero.cooldowns.skill1')>0
        frame.evaluate('__game.advance(.4)');mp.screenshot(path=str(OUT/'mobile-landscape.png'))
        # Long fighter labels and touch controls must fit their responsive panels.
        for selector in ['#player-name','.tbtn-attack','.dbtn-right','#pause-btn']:
            box=frame.locator(selector).bounding_box();assert box and box['x']>=0 and box['x']+box['width']<=845, selector+' outside viewport'
        mp.evaluate('async () => {if(document.fullscreenElement)await document.exitFullscreen();}')
        mp.set_viewport_size({'width':390,'height':844});mp.wait_for_timeout(200)
        assert mp.locator('html').get_attribute('data-rotated')=='true'
        mp.screenshot(path=str(OUT/'mobile-portrait.png'))
        report['mobile']='Android Chromium emulation: tap selection, touch movement/skill, landscape and portrait shell passed; physical device untested'
        mobile.close();context.close();browser.close()
    assert not report['errors'],report['errors']
    assert not report['failed_requests'],report['failed_requests']
    report['status']='passed'
    (OUT/'runtime.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in {'combat_results','cpu_matches'}},indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:5173');parser.add_argument('--baseline')
    args=parser.parse_args();checks(args.base,args.baseline)
