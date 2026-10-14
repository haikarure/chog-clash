"""Read-only browser checks for clear 1v1 stake selection and mobile navigation."""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
BASE=os.environ['CHOG_PVP_TEST_URL'];OUT=Path(os.environ.get('CHOG_PVP_TEST_OUTPUT',str(ROOT/'validation/final/pvp-entry')));OUT.mkdir(parents=True,exist_ok=True)
report={'status':'RUNNING','baseUrl':BASE,'evidenceType':'Automated browser against the actual frontend/backend, no wallet signing or transaction broadcast and no human/physical-device claim','checks':{},'viewports':[],'errors':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1280,'height':800},service_workers='block');page=context.new_page();posts=[]
 page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('request',lambda req:posts.append(req.url) if req.method=='POST' else None)
 def ready(target):target.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000)
 page.goto(BASE+'/play.html');ready(page);assert '1v1 DUEL' in page.locator('[data-cmd=online]').inner_text();page.click('[data-cmd=online]');page.wait_for_selector('[data-action=create-paid]');page.wait_for_function('!document.querySelector("[data-action=create-paid]").disabled')
 assert page.locator('[data-action=pvp-mode][data-mode=paid]').get_attribute('aria-pressed')=='true';assert page.locator('[data-action=create-room]').count()==0;assert '1.90' in page.locator('.online-pool').inner_text();report['checks']['mainMenuOpensStakeChoice']=True
 page.click('[data-action=pvp-mode][data-mode=casual]');page.wait_for_selector('[data-action=create-room]');assert 'FREE' in page.locator('[data-action=create-room]').inner_text();assert 'FREE' in page.locator('[data-action=quick-match]').inner_text();assert 'online=casual' in page.url;page.reload();ready(page);page.wait_for_selector('[data-action=create-room]');assert page.locator('[data-action=pvp-mode][data-mode=casual]').get_attribute('aria-pressed')=='true';report['checks']['explicitFreeChoiceSurvivesReload']=True
 page.click('[data-action=pvp-mode][data-mode=paid]');page.wait_for_selector('[data-action=create-paid]');assert 'INVITE FRIEND' in page.locator('[data-action=create-paid]').inner_text();assert 'QUICK MATCH' in page.locator('[data-action=paid-queue]').inner_text();page.reload();ready(page);page.wait_for_selector('[data-action=create-paid]');report['checks']['stakeInviteAndAutoMatchSurviveReload']=True
 page.click('[data-action=create-paid]');page.wait_for_function('document.querySelector("#online-message").textContent.includes("EVM wallet")');assert not any('/api/duels' in url or '/api/queue' in url for url in posts);report['checks']['stakeRequiresWalletBeforeCreatingMatch']=True
 for width,height in [(1440,900),(1280,720),(1024,768),(768,1024),(844,390),(740,360),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  for element in page.locator('#online-root button').all():
   if not element.is_visible():continue
   element.scroll_into_view_if_needed();box=element.bounding_box();assert box['x']>=-1 and box['x']+box['width']<=width+1;assert box['width']>=44 and box['height']>=44
  page.locator('.online-pvp-modes').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'pvp-{width}x{height}.png'));report['viewports'].append({'width':width,'height':height,'fits':True,'targetsAtLeast44':True})
 mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block');mp=mobile.new_page();mp.on('pageerror',lambda e:report['errors'].append(str(e)));mp.goto(BASE+'/mobile.html?online=casual');frame=mp.frame_locator('#game');frame.locator('[data-action=pvp-mode][data-mode=paid]').wait_for(timeout=60000);frame.locator('[data-action=pvp-mode][data-mode=paid]').tap();mp.wait_for_url('**/mobile.html?online=paid');mp.reload();frame=mp.frame_locator('#game');frame.locator('[data-action=create-paid]').wait_for(timeout=60000);assert frame.locator('[data-action=pvp-mode][data-mode=paid]').get_attribute('aria-pressed')=='true';frame.locator('[data-action=pvp-mode][data-mode=casual]').tap();mp.wait_for_url('**/mobile.html?online=casual');report['checks']['mobileStakeChoiceSurvivesReload']=True
 assert not report['errors'];report['status']='PASS';(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));mobile.close();context.close();browser.close()
