"""Actual local-EVM wallet login, navigation, logout, and cross-tab browser checks."""
from pathlib import Path
import os,json,urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
FIXTURE=json.loads(Path(os.environ['CHOG_BROWSER_FIXTURE']).read_text())
OUT=ROOT/'validation/final/landing-wallet-local';OUT.mkdir(parents=True,exist_ok=True)
BASE=FIXTURE['base'];errors=[]
report={'status':'RUNNING','baseUrl':BASE,'evidenceType':'Actual backend SIWE and local Anvil test-wallet signatures; automated Chromium, no human/device or public-chain transaction claim.','checks':{},'viewports':[]}
def rpc(player,request):
    req=urllib.request.Request(FIXTURE['bridge']+'/wallet/'+str(player),data=json.dumps(request).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=30) as r: result=json.load(r)
    assert 'error' not in result,result
    return result['result']
def stats():
    with urllib.request.urlopen(FIXTURE['bridge']+'/stats') as r:return json.load(r)
def session(page):return page.evaluate('async()=> (await fetch("/api/session")).json()')
def button(page,action):return page.locator(f'[data-wallet-controls] button[data-wallet-action={action}]:visible').first
def ready(page):page.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000)
baseline=stats()['methods']
def signatures(player):return stats()['methods'].get(f'{player}:personal_sign',0)-baseline.get(f'{player}:personal_sign',0)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':800},service_workers='block')
    context.expose_binding('fixtureWallet',lambda source,value:rpc(value.pop('player'),value))
    context.add_init_script('''
      const listeners=new Map();
      window.ethereum={on:(e,f)=>listeners.set(e,f),removeListener:(e)=>listeners.delete(e),request:async args=>{
        if(args.method==='eth_accounts'&&!localStorage.getItem('fixture-wallet-permission'))return [];
        if(args.method==='eth_requestAccounts')localStorage.setItem('fixture-wallet-permission','1');
        return window.fixtureWallet({...args,player:Number(localStorage.getItem('fixture-wallet-player')||0)});
      }};
      window.changeFixtureAccount=async index=>{localStorage.setItem('fixture-wallet-player',String(index));listeners.get('accountsChanged')?.(await window.ethereum.request({method:'eth_accounts'}));};
    ''')
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/');button(page,'connect').wait_for()
    assert signatures(1)==0
    before=session(page)['token'];report['checks']['landingLoadsWithoutWalletPrompt']=True
    button(page,'connect').click();button(page,'disconnect').wait_for()
    assert session(page)['wallet'].lower()==FIXTURE['wallets'][0].lower()
    assert signatures(1)==1
    report['checks']['landingWalletLogin']=True
    page.screenshot(path=str(OUT/'landing-connected.png'))
    page.locator('.nav-play').click();page.wait_for_url('**/play.html');ready(page)
    button(page,'disconnect').wait_for();assert session(page)['token']==before
    assert signatures(1)==1
    page.click('[data-cmd=online]');page.wait_for_selector('[data-action=create-paid]')
    button(page,'disconnect').wait_for();page.click('[data-action=create-paid]')
    page.wait_for_selector('.online-duel-participants',timeout=40000)
    page.wait_for_function('document.querySelector(".online-state")?.textContent==="Draft"',timeout=40000)
    assert signatures(1)==1
    duel_url=page.url;report['checks']['landingToHubToPaidDuelReusesLogin']=True
    second=context.new_page();second.goto(BASE+'/');button(second,'disconnect').wait_for()
    button(page,'disconnect').click();button(page,'connect').wait_for();button(second,'connect').wait_for()
    assert session(page)['wallet'] is None;assert session(page)['token']==before
    page.reload();ready(page);button(page,'connect').wait_for()
    report['checks']['serverLogoutPersistsAcrossReloadAndTabs']=True
    button(page,'connect').click();button(page,'disconnect').wait_for()
    page.wait_for_function('document.querySelector(".online-duel-participants")?.textContent.includes("YOU")')
    assert page.url==duel_url;assert session(page)['token']==before
    assert signatures(1)==2
    report['checks']['reconnectKeepsPaidDuelParticipant']=True
    page.screenshot(path=str(OUT/'duel-reconnected.png'))
    page.evaluate('window.changeFixtureAccount(1)');button(page,'connect').wait_for();button(second,'connect').wait_for()
    assert session(page)['wallet'] is None;button(second,'connect').click();button(second,'disconnect').wait_for()
    assert session(second)['wallet'].lower()==FIXTURE['wallets'][1].lower()
    report['checks']['accountSwitchInvalidatesOldLogin']=True
    for width,height in [(1440,900),(1280,720),(1024,768),(768,1024),(844,390),(740,360),(390,844),(320,640)]:
        second.set_viewport_size({'width':width,'height':height})
        assert second.evaluate('document.documentElement.scrollWidth<=innerWidth')
        box=button(second,'disconnect').bounding_box();assert box['x']>=0 and box['x']+box['width']<=width+1 and box['height']>=44
        second.screenshot(path=str(OUT/f'landing-{width}x{height}.png'))
        report['viewports'].append({'width':width,'height':height,'landingWalletFits':True})
    # Wallet signing rejection can be retried, without a reload or false login.
    button(second,'disconnect').click();button(second,'connect').wait_for()
    second.evaluate("()=>{window.ethereum.request=async()=>{throw Object.assign(Error('Rejected'),{code:4001})}}")
    button(second,'connect').click();second.wait_for_selector('#wallet-login-status:not([hidden])')
    assert 'cancelled' in second.locator('#wallet-login-status').inner_text().lower()
    assert session(second)['wallet'] is None;report['checks']['walletRejectionStaysDisconnected']=True
    assert not errors,errors
    report['status']='PASS';report['errors']=errors
    report['signatureCounts']={'originalPlayer':signatures(1),'switchedPlayer':signatures(2)}
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2));context.close();browser.close()
