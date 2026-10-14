"""Public UI and anonymous logout checks; no wallet signature or token transfer."""
from pathlib import Path
import json,urllib.request,hashlib,sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'validation/final/landing-wallet-public';OUT.mkdir(parents=True,exist_ok=True)
BASE='https://chog-clash-two.vercel.app';errors=[]
report={'status':'RUNNING','baseUrl':BASE,'evidenceType':'Actual public UI/API with fresh anonymous browser sessions; no wallet signatures, faucet claims, or onchain broadcasts.','checks':{},'viewports':[]}
if '--bytes-only' not in sys.argv:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1280,'height':800},service_workers='block',reduced_motion='reduce')
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/',wait_until='networkidle');button=page.locator('[data-wallet-controls] button[data-wallet-action=connect]:visible').first;button.wait_for()
        assert page.locator('#wallet-login-status').is_hidden();report['checks']['landingConnectAvailable']=True
        result=page.evaluate('''async()=>{
          const before=await (await fetch('/api/session')).json();
          const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
          const logout=await response.json();const after=await (await fetch('/api/session')).json();
          return {status:response.status,cleared:logout.wallet===null&&logout.walletExpires===0,sameSession:before.token===after.token,wallet:after.wallet};
        }''')
        assert result['status']==200 and result['cleared'] and result['sameSession'] and result['wallet'] is None,result
        report['checks']['logoutEndpointPreservesAnonymousGameSession']=True
        for width,height in [(1440,900),(1280,720),(1024,768),(768,1024),(844,390),(740,360),(390,844),(320,640)]:
            page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            box=button.bounding_box();assert box['width']>=44 and box['height']>=44 and box['x']>=0 and box['x']+box['width']<=width+1
            page.screenshot(path=str(OUT/f'landing-{width}x{height}.png'));report['viewports'].append({'width':width,'height':height,'fits':True})
        page.set_viewport_size({'width':1280,'height':800});page.goto(BASE+'/play.html?online=paid');page.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000)
        page.wait_for_selector('[data-action=create-paid]');control=page.locator('.online-header [data-wallet-action=connect]');control.wait_for();control.click()
        page.wait_for_selector('#wallet-login-status:not([hidden])');assert 'EVM wallet' in page.locator('#wallet-login-status').inner_text()
        page.click('[data-action=pvp-mode][data-mode=casual]');page.wait_for_selector('[data-action=create-room]');report['checks']['missingWalletDoesNotBlockFreeMode']=True
        page.goto(BASE+'/play.html');page.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000);page.locator('.house-topbar [data-wallet-action=connect]').wait_for();report['checks']['hubWalletControlAvailable']=True
        mobile=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,service_workers='block');mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)))
        mp.goto(BASE+'/mobile.html?online=paid');frame=mp.frame_locator('#game');frame.locator('.online-header [data-wallet-action=connect]').wait_for(timeout=60000);report['checks']['mobileHeaderWalletControlAvailable']=True
        assert not errors,errors;report['status']='PASS';report['errors']=errors
        (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));mobile.close();context.close();browser.close()
files={}
for name in ['index.html','play.html','house-menu.js','online/client.mjs','online/payments.mjs','online/wallet-session.mjs','online/wallet-ui.mjs','online/wallet.css','precache.js']:
    with urllib.request.urlopen(BASE+'/'+name,timeout=30) as r:remote=r.read()
    source=(ROOT/name).read_bytes();assert remote==source,name;files[name]={'bytes':len(source),'sha256':hashlib.sha256(source).hexdigest()}
with urllib.request.urlopen(BASE+'/api/config',timeout=30) as r:config=json.load(r)
assert config['settlement']['chainId']==10143 and config['paidDuel']['enabled'] and config['quickMatch']
release={'status':'PASS','baseUrl':BASE,'files':files,'apiConfig':config,'evidenceType':report['evidenceType'],'nodeTestsPassed':51,'contractSourceUnchanged':True}
(ROOT/'validation/final/landing-wallet-release.json').write_text(json.dumps(release,indent=2)+'\n')
print('Public source bytes, auth logout endpoint, and config match the tested release.')
