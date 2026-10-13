"""Real local-EVM browser flows; injected simulated wallets, no human/device claim."""
from pathlib import Path
import json,os,urllib.request,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
FIXTURE=json.loads(Path(os.environ['CHOG_BROWSER_FIXTURE']).read_text())
BASE=FIXTURE['base'];OUT=Path(os.environ.get('CHOG_PAID_OUTPUT',str(ROOT/'validation/final/paid-browser')));OUT.mkdir(parents=True,exist_ok=True)
local=FIXTURE['chainId']==31337;unit='MOCK' if local else 'AUSD'
report={'status':'RUNNING','evidenceType':'Automated Chromium with '+('localhost Anvil' if local else 'actual Monad testnet and public Vercel/Railway')+' escrow and injected simulated player wallets; no physical device or humans','chainId':FIXTURE['chainId'],'baseUrl':BASE,'checks':{},'viewports':[],'errors':[]}
started=time.monotonic();report['timeline']=[]
def mark(label):
 report['timeline'].append({'seconds':round(time.monotonic()-started,2),'label':label})
 if 'a' in globals():report['currentUrl']=a.url
 (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
 if 'contexts' in globals():
  recovery={'contexts':[c.storage_state() for c in contexts],'urls':[page.url for page in [a,b]]}
  fd=os.open('/tmp/chog-paid-browser-recovery.json',os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
  with os.fdopen(fd,'w') as f:json.dump(recovery,f)
def bridge(player,request):
 req=urllib.request.Request(FIXTURE['bridge']+'/wallet/'+str(player),data=json.dumps(request).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=30) as r:result=json.load(r)
 if 'error' in result:raise RuntimeError(result['error'])
 return result['result']
def stats():
 with urllib.request.urlopen(FIXTURE['bridge']+'/stats') as r:return json.load(r)
def setup(context,player):
 context.expose_binding('fixtureWallet',lambda source,r:bridge(player,r))
 context.add_init_script('window.ethereum={request:args=>window.fixtureWallet(args)};')
def ready(page):page.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000)
def enabled(page,selector,timeout=40000):
 page.wait_for_selector(selector,timeout=timeout)
 page.wait_for_function('(selector)=>{const e=document.querySelector(selector);return !!e&&!e.disabled;}',arg=selector,timeout=timeout)
def online(page):
 page.goto(BASE+'/play.html?online=friend&touch=0');ready(page)
 enabled(page,'[data-action=create-room]')
def wait(page,condition,timeout=40000):
 page.wait_for_function('async()=>{const d=(await import("./online/client.mjs")).onlineDiagnostics();return d&&('+condition+');}',timeout=timeout)
def fit(page):
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'horizontal overflow'
 for selector in ['#online-root button','#online-root input','#online-root a']:
  for e in page.locator(selector).all():
   if not e.is_visible():continue
   e.scroll_into_view_if_needed();b=e.bounding_box();assert b['x']>=-1 and b['x']+b['width']<=page.viewport_size['width']+1,(selector,b)
   assert b['height']>=44 and b['width']>=44,(selector,'small target',b)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 contexts=[browser.new_context(viewport={'width':1280,'height':720},service_workers='block',**({'record_video_dir':str(OUT/'raw-video'),'record_video_size':{'width':1280,'height':720}} if os.environ.get('CHOG_RECORD_VIDEO')=='1' else {})) for _ in range(2)]
 for i,c in enumerate(contexts):setup(c,i)
 started=time.monotonic();a,b=[c.new_page() for c in contexts]
 for page in [a,b]:page.on('pageerror',lambda e:report['errors'].append(str(e)))
 for page in [a,b]:online(page)
 a.click('[data-action=quick-match]');a.wait_for_selector('[data-action=cancel-queue]');a.click('[data-action=cancel-queue]');a.wait_for_selector('[data-action=quick-match]');report['checks']['cancelFreeSearch']=True
 mark('Free Quick Match');b.click('[data-chog=mamio]');a.click('[data-action=quick-match]');b.click('[data-action=quick-match]')
 for page in [a,b]:wait(page,'d.view==="lobby"&&d.authority?.slots.every(s=>s.connected)');page.click('[data-action=ready]')
 wait(a,'d.view==="match"&&d.authority.sim.rules.phase==="fight"');a.keyboard.down('d');b.keyboard.down('a');a.wait_for_timeout(900);a.keyboard.up('d');b.keyboard.up('a');a.keyboard.press('Space');b.keyboard.press('p');a.wait_for_timeout(1500);a.keyboard.press('i');a.wait_for_timeout(1600);b.click('[data-action=surrender]');wait(a,'d.authority.persisted');report['checks']['freeQuickMatchCombatAndResult']=True
 for page in [a,b]:page.locator('[data-action=exit]').first.click();page.click('[data-cmd=online]');page.click('[data-action=paid-create]')
 for width,height in [(1440,900),(1280,720),(1024,768),(768,1024),(844,390),(740,360),(390,844)]:
  a.set_viewport_size({'width':width,'height':height});fit(a);a.screenshot(path=str(OUT/f'paid-create-{width}x{height}.png'));report['viewports'].append({'width':width,'height':height,'horizontalFit':True,'targetsAtLeast44':True})
 mark('Paid invitation and two equal entries');a.set_viewport_size({'width':1280,'height':720});a.click('[data-action=wallet]');a.click('[data-action=create-paid]');a.wait_for_selector('input[aria-label="Paid duel invite link"]');invite=a.locator('input[aria-label="Paid duel invite link"]').input_value()
 b.goto(invite);ready(b);b.wait_for_selector('[data-action=join-paid]');b.click('[data-chog=toad]');b.click('[data-action=join-paid]');b.wait_for_selector('[data-action=fund-duel]');a.wait_for_selector('[data-action=fund-duel]')
 for page in [a,b]:enabled(page,'[data-action=fund-duel]')
 assert ('local mock' if local else 'monad testnet') in a.locator('.online-cup-heading').inner_text().lower();assert '1 + 1 '+unit in a.locator('.online-pool').inner_text();report['checks']['fixtureNetworkLabelIsExplicit']=True
 # Lose the confirmation request after a real, mined deposit. Reload must recover
 # its saved hash without asking the wallet to send the deposit again.
 a.route('**/confirm-funding',lambda route:route.abort());before=len(stats()['transactions']);a.click('[data-action=fund-duel]');a.wait_for_function('document.querySelector(".online-participants").innerText.includes("ENTRY CONFIRMED")',timeout=30000)
 a.unroute('**/confirm-funding');a.reload();ready(a);a.wait_for_function('document.querySelector(".online-participants")?.innerText.includes("ENTRY CONFIRMED")',timeout=30000);assert len(stats()['transactions'])==before+2;report['checks']['minedEntryReloadNeverResends']=True
 for width,height in [(844,390),(390,844)]:a.set_viewport_size({'width':width,'height':height});fit(a);a.screenshot(path=str(OUT/f'paid-funded-{width}x{height}.png'))
 mark('Reload recovers the confirmed first entry');a.set_viewport_size({'width':1280,'height':720});b.click('[data-action=fund-duel]')
 for page in [a,b]:page.wait_for_selector('[data-action=open-paid-match]',timeout=30000);page.click('[data-action=open-paid-match]')
 for page in [a,b]:enabled(page,'[data-action=ready]');page.click('[data-action=ready]')
 mark('Paid match; automated opponent surrenders');wait(a,'d.view==="match"&&d.authority.sim.rules.phase==="fight"');a.keyboard.down('d');b.keyboard.down('a');a.wait_for_timeout(800);a.keyboard.up('d');b.keyboard.up('a');a.keyboard.press('Space');b.keyboard.press('p');a.wait_for_timeout(2000);b.click('[data-action=surrender]');wait(a,'d.authority.persisted');a.screenshot(path=str(OUT/'paid-match-result.png'))
 a.click('[data-action=duel-back]');a.wait_for_function('document.querySelector(".online-state").innerText==="Complete"',timeout=30000);a.wait_for_function('[...document.querySelectorAll(".online-tx")].filter(e=>e.innerText.includes("withdraw · paid")).length===2',timeout=30000)
 mark('Verified winner 1.90 and platform 0.10 transfers');assert '1.90 '+unit in a.locator('.online-report').inner_text();assert '0.10 '+unit in a.locator('.online-report').inner_text();a.screenshot(path=str(OUT/'paid-ledger.png'));report['checks']['twoEntriesWinnerFeeVerifiedLedger']=True
 mark('Paid queue and full cancellation refund')
 for page in [a,b]:page.locator('[data-action=exit]').first.click();page.click('[data-cmd=online]');page.click('[data-action=paid-create]');page.click('[data-action=paid-queue]')
 for page in [a,b]:page.wait_for_selector('[data-action=fund-duel]',timeout=30000)
 enabled(a,'[data-action=fund-duel]');a.click('[data-action=fund-duel]');a.wait_for_function('document.querySelector(".online-participants")?.innerText.includes("ENTRY CONFIRMED")');b.click('[data-action=cancel-duel]');a.wait_for_function('document.querySelector(".online-state")?.innerText==="Cancelled"',timeout=30000);a.wait_for_function('document.querySelector(".online-report")?.innerText.includes("withdraw · paid")',timeout=30000);report['checks']['paidQueueCancellationRefundLedger']=True
 for width,height in [(844,390),(740,360),(390,844)]:a.set_viewport_size({'width':width,'height':height});fit(a);a.screenshot(path=str(OUT/f'paid-refund-{width}x{height}.png'))
 # Mobile shell must retain queue and duel URLs when the embedded app navigates.
 mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block');setup(mobile,2);mp=mobile.new_page();mp.goto(BASE+'/mobile.html?online=friend');frame=mp.frame_locator('#game');frame.locator('[data-action=quick-match]').wait_for(timeout=60000);frame.locator('[data-action=quick-match]').tap();mp.wait_for_url('**/mobile.html?queue=casual');mp.reload();frame=mp.frame_locator('#game');frame.locator('[data-action=cancel-queue]').wait_for(timeout=60000);frame.locator('[data-action=cancel-queue]').tap();frame.locator('[data-action=paid-create]').tap();frame.locator('[data-action=wallet]').tap();frame.locator('[data-action=create-paid]').tap();mp.wait_for_url('**/mobile.html?duel=*');mp.reload();mp.frame_locator('#game').locator('input[aria-label="Paid duel invite link"]').wait_for(timeout=60000);report['checks']['mobileQueueAndDuelReloadRetainContext']=True
 report['walletTransactions']=stats()['transactions'];assert not report['errors'],report['errors'];report['status']='PASS'
 if a.video:report['videoPath']=str(a.video.path())
 (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));browser.close()
