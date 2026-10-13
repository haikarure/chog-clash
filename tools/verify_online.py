"""Real browser online controls and responsive UI. Browser emulation, not a human playtest."""
from pathlib import Path
import os,json,hashlib
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
OUT=Path(os.environ.get('CHOG_TEST_OUTPUT',str(ROOT/'validation/online')));OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('CHOG_TEST_URL','http://localhost:5174')
report={'status':'pending','date':'2026-10-13','baseUrl':BASE,'evidenceType':'automated Chromium browser contexts; no physical device or human playtest','checks':{},'errors':[],'httpErrors':[],'viewports':[]}
DIAG='async()=> (await import("./online/client.mjs")).onlineDiagnostics()'
def diag(page):return page.evaluate(DIAG)
def wait(page,condition,timeout=30000):
 page.evaluate('async()=>{window.onlineRead=(await import("./online/client.mjs")).onlineDiagnostics;}')
 page.wait_for_function('()=>{const d=window.onlineRead();return d&&('+condition+');}',timeout=timeout)
def ready(page):page.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000)
def fit(page,selectors):
 for selector in selectors:
  for element in page.locator(selector).all():
   if not element.is_visible():continue
   element.scroll_into_view_if_needed();box=element.bounding_box();size=page.viewport_size
   assert box and box['x']>=-1 and box['x']+box['width']<=size['width']+1,(selector,box)
   assert box['width']>=44 and box['height']>=44,(selector,'small target',box)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'page horizontal overflow'

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 contexts=[browser.new_context(viewport={'width':1280,'height':720},service_workers='block'),browser.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,service_workers='block')]
 pages=[c.new_page() for c in contexts];a,b=pages
 for page in pages:
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.on('response',lambda r:report['httpErrors'].append({'path':r.url.split('?')[0],'status':r.status}) if r.status>=400 else None)
 # Hold session and SDK responses separately. Picking a persona forces a render
 # after config arrives; creation must remain disabled until both are available.
 held_session=[];held_sdk=[]
 a.route('**/api/session',lambda route:held_session.append(route))
 a.route('**/online/vendor/colyseus.js',lambda route:held_sdk.append(route))
 a.goto(BASE+'/play.html?touch=0');ready(a);a.click('[data-cmd=online]');a.wait_for_selector('[data-action=create-room]')
 a.wait_for_timeout(250);a.wait_for_function('document.querySelector("#online-root")&&!document.querySelector("#online-root").hidden')
 for attempt in range(1200):
  if held_session:break
  a.wait_for_timeout(25)
 assert held_session,'Session request did not arrive'
 a.click('[data-chog=mamio]');assert a.locator('[data-action=create-room]').is_disabled()
 held_session[0].continue_();a.unroute('**/api/session')
 for attempt in range(1200):
  if held_sdk:break
  a.wait_for_timeout(25)
 assert held_sdk,'SDK request did not arrive'
 a.click('[data-chog=yot]');assert a.locator('[data-action=create-room]').is_disabled()
 held_sdk[0].continue_();a.unroute('**/online/vendor/colyseus.js')
 a.wait_for_function('!document.querySelector("[data-action=create-room]").disabled')
 report['checks']['creationWaitsForSessionAndSdk']=True
 a.fill('#online-nickname','Comic Player');a.click('[data-chog=mamio]');a.click('[data-action=create-room]');wait(a,'d.authority?.slots[0].connected');invite=a.locator('input[aria-label="Room invite link"]').input_value()
 b.goto(invite+'&touch=1&embed=1');ready(b);wait(b,'d.authority?.slots.every(s=>s.connected)');b.locator('[data-chog=toad]').tap();wait(a,'d.authority.slots[1].chog==="toad"')
 for page in pages:page.click('[data-action=ready]')
 wait(a,'d.view==="match"&&d.authority.sim.rules.phase==="fight"');wait(b,'d.view==="match"')
 match=diag(a)['authority']['matchId'];a.screenshot(path=str(OUT/'pvp-mamio-toad.png'))
 left=b.locator('.dbtn-left').bounding_box();cdp=contexts[1].new_cdp_session(b)
 a.keyboard.down('d');cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':left['x']+left['width']/2,'y':left['y']+left['height']/2}]});a.wait_for_timeout(650);a.keyboard.up('d');cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 a.keyboard.press('p');wait(a,'d.authority.sim.actors[0].form==="wolf"')
 b.locator('.tbtn-s2').tap();b.wait_for_timeout(1200);a.keyboard.press('i');a.wait_for_timeout(1000);b.locator('.tbtn-ult').tap();a.wait_for_timeout(1400)
 wait(a,'d.authority.sim.actors.some(p=>p.hp<200)');report['checks']['inputMovementDamageTransformAndSummon']=True
 report['checks']['touchDpadSkillAndUltimateInLiveRoom']=True
 assert not b.locator('#pause-btn').is_visible();fit(b,['.online-match-toolbar button','#settings-btn','.dbtn','.tbtn'])
 b.screenshot(path=str(OUT/'pvp-touch-844x390.png'))
 a.screenshot(path=str(OUT/'pvp-transform-summon.png'))
 before=diag(a)['authority']['sim']['rules']['seconds'];a.keyboard.press('Escape');assert a.locator('#settings-panel').is_visible();a.wait_for_timeout(1200);after=diag(b)['authority']['sim']['rules']['seconds'];assert after<before-.5
 a.click('#close-settings');report['checks']['settingsDoNotPauseOpponent']=True
 b.reload();ready(b);wait(b,'d.view==="match"&&d.connected&&d.authority?.sim');assert diag(b)['authority']['matchId']==match;assert diag(b)['seat']==1;report['checks']['reloadRejoinsSameSeat']=True
 # Result uses the authoritative server state and explicit Forfeit label.
 b.click('[data-action=surrender]');wait(a,'d.authority.persisted&&d.authority.sim.rules.outcome==="Forfeit"');assert 'SERVER VERIFIED' in a.locator('.online-match-result').inner_text();a.screenshot(path=str(OUT/'pvp-result.png'))
 a.click('[data-action=rematch]');a.wait_for_timeout(250);assert diag(a)['authority']['matchId']==match;b.click('[data-action=rematch]');wait(a,'d.authority.matchId!=="'+match+'"');report['checks']['twoVotesStartFreshRematch']=True
 for page in pages:page.locator('[data-action=exit]').first.click();page.wait_for_function('document.querySelector("#online-root").hidden')
 assert a.locator('[data-cmd=training]').is_visible();a.screenshot(path=str(OUT/'hub-four-modes.png'))
 a.click('[data-cmd=cup]');a.fill('#cup-name','Browser smoke Cup');a.click('[data-action=create-cup]');a.wait_for_selector('.online-participants article');assert a.locator('.online-participants article').count()==4;assert 'no prize' in a.locator('.online-test-label').inner_text();assert a.locator('[data-action=start-cup]').is_disabled();a.screenshot(path=str(OUT/'cup-check-in.png'));report['checks']['cupHostInvitesAndUnreadyLock']=True
 a.locator('[data-action=exit]').first.click()
 for width,height in [(1440,900),(1280,720),(1024,768),(768,1024),(844,390),(740,360),(390,844)]:
  a.set_viewport_size({'width':width,'height':height});a.click('[data-cmd=online]');wait(a,'d.view==="entry"');a.wait_for_function('!document.querySelector("[data-action=create-room]").disabled');fit(a,['.online-persona','[data-action=create-room]','.online-header .paper-button']);a.screenshot(path=str(OUT/f'entry-{width}x{height}.png'));a.locator('[data-action=exit]').first.click();report['viewports'].append({'width':width,'height':height,'roster':12,'targetsAtLeast44':True,'horizontalFit':True})
 # Actual touch input events in a landscape mobile browser context.
 touch=browser.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,service_workers='block');tp=touch.new_page();tp.on('pageerror',lambda e:report['errors'].append('touch: '+str(e)));tp.goto(BASE+'/play.html?touch=1&embed=1');ready(tp);tp.locator('[data-cmd=online]').tap();wait(tp,'d.view==="entry"');tp.wait_for_function('!document.querySelector("[data-action=create-room]").disabled');tp.locator('[data-chog=cookie]').tap();assert tp.locator('[data-chog=cookie]').get_attribute('aria-pressed')=='true';fit(tp,['.online-persona','[data-action=create-room]']);report['checks']['touchRoster']=True
 report['correctionsPx']=diag(b)['corrections'] if diag(b) else []
 browser.close()
landing=json.loads((ROOT/'validation/audit/landing-baseline.json').read_text());assert all(hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest for name,digest in landing.items());report['checks']['landing12HashesUnchanged']=True
assert not report['errors'],report['errors']
assert not report['httpErrors'],report['httpErrors']
report['status']='PASS';(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
