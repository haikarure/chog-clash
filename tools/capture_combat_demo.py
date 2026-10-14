"""Record real public free-PvP combat for the demo; automated desktop/touch clients."""
from pathlib import Path
import json,time
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'validation/final/submission'
BASE='https://chog-clash-two.vercel.app'
def ready(page):page.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000)
def wait(page,condition):page.wait_for_function('async()=>{const d=(await import("./online/client.mjs")).onlineDiagnostics();return d&&('+condition+');}',timeout=30000)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 ca=browser.new_context(viewport={'width':1280,'height':720},service_workers='block',record_video_dir=str(OUT/'combat-video'),record_video_size={'width':1280,'height':720})
 cb=browser.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,service_workers='block');a=ca.new_page();b=cb.new_page();start=time.monotonic()
 a.goto(BASE+'/play.html?online=casual&touch=0');ready(a);a.click('[data-chog=mamio]');a.click('[data-action=create-room]');a.wait_for_selector('input[aria-label="Room invite link"]');invite=a.locator('input[aria-label="Room invite link"]').input_value()
 u=urlsplit(invite);query=dict(parse_qsl(u.query));query.update(touch='1',embed='1');b.goto(urlunsplit((u.scheme,u.netloc,u.path,urlencode(query),u.fragment)));ready(b);b.locator('[data-chog=toad]').tap();wait(a,'d.authority.slots[1].chog==="toad"')
 for page in [a,b]:page.click('[data-action=ready]')
 wait(a,'d.authority?.sim?.rules?.phase==="fight"');wait(b,'d.view==="match"');b.locator('.dbtn-left').wait_for(state='visible');fight=time.monotonic()-start
 left=b.locator('.dbtn-left').bounding_box();cdp=cb.new_cdp_session(b);a.keyboard.down('d');cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':left['x']+left['width']/2,'y':left['y']+left['height']/2}]});a.wait_for_timeout(650);a.keyboard.up('d');cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 a.keyboard.press('p');wait(a,'d.authority.sim.actors[0].form==="wolf"');b.locator('.tbtn-s2').tap();a.wait_for_timeout(1200);a.keyboard.press('i');a.wait_for_timeout(1000);b.locator('.tbtn-ult').tap();a.wait_for_timeout(1400);wait(a,'d.authority.sim.actors.some(p=>p.hp<200)')
 for i in range(4):
  a.keyboard.press('Space');b.locator('.tbtn-attack').tap();a.wait_for_timeout(900);a.keyboard.press('o');a.wait_for_timeout(600)
 a.wait_for_timeout(2500);state=a.evaluate('async()=> (await import("./online/client.mjs")).onlineDiagnostics()');report={'scope':'Actual public free invite PvP, automated Mamio desktop versus Toad touch emulation','fightStartSeconds':fight,'hp':[actor['hp'] for actor in state['authority']['sim']['actors']],'videoPath':str(a.video.path())}
 ca.close();cb.close();browser.close()
(OUT/'combat-capture.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
