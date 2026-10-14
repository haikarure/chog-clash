"""Exercise the real faucet UI with an explicit simulated EIP-1193 provider."""
from pathlib import Path
import json,os,re,socket,subprocess,time,urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
OUT=Path(os.environ.get('CHOG_FAUCET_TEST_OUTPUT',str(ROOT/'validation/final/faucet-browser')));OUT.mkdir(parents=True,exist_ok=True)
WALLET='0x'+'11'*20;TOKEN='0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC';FAUCET='0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C'
HASH='0x'+'aa'*32;TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
BUILD=re.search(r'0x[0-9a-f]{64}',(ROOT/'online/build.mjs').read_text()).group(0)
state={'verified':False,'chain':'0x1','balance':0,'native':10**18,'mode':'reject','pending':False,'sent':[],'calls':[]}
report={'status':'RUNNING','evidenceType':'Automated Chromium, simulated wallet/API and receipts. This UI test does not broadcast testnet transactions or prove physical-device behavior.','checks':{},'viewports':[],'errors':[]}
def provider(source,args):
 method=args['method'];params=args.get('params',[]);state['calls'].append(method)
 if method in ['eth_accounts','eth_requestAccounts']:return {'result':[WALLET]}
 if method=='eth_chainId':return {'result':state['chain']}
 if method=='wallet_switchEthereumChain':state['chain']=params[0]['chainId'];return {'result':None}
 if method=='personal_sign':return {'result':'0x'+'ab'*65}
 if method=='eth_call':
  if params[0]['to'].lower()==TOKEN.lower():return {'result':'0x'+format(state['balance'],'064x')}
  if state['mode']=='cooldown':return {'error':{'message':'execution reverted','data':'0x20e5bc67'}}
  return {'result':'0x'}
 if method=='eth_getBalance':return {'result':hex(state['native'])}
 if method=='eth_estimateGas':return {'result':hex(113465)}
 if method=='eth_gasPrice':return {'result':hex(102000000000)}
 if method=='eth_sendTransaction':
  if state['mode']=='reject':return {'error':{'message':'User rejected request','code':4001}}
  state['sent'].append(params[0]);return {'result':HASH}
 if method=='eth_getTransactionReceipt':
  if state['pending']:return {'result':None}
  return {'result':{'status':'0x1','transactionHash':HASH,'to':FAUCET,'logs':[{'address':TOKEN,'topics':[TRANSFER,'0x'+FAUCET[2:].lower().rjust(64,'0'),'0x'+WALLET[2:].rjust(64,'0')],'data':'0x'+format(10**10,'064x')}]}}
 raise RuntimeError('Unexpected wallet method '+method)
def api(route):
 path=route.request.url.split('/api/',1)[1]
 if path=='config':value={'online':True,'buildHash':BUILD,'quickMatch':True,'settlement':{'enabled':True,'chainId':10143,'contract':'0xeEe983581d5f747eC31Cda37C2645F65af31CB5E','token':TOKEN,'label':'Monad testnet · AUSD test token','mode':'testnet'},'paidDuel':{'enabled':True,'chainId':10143,'token':TOKEN,'contract':'0xB15097FcB9DE04A2CEb844f1a9C88929E3d8cAd7','feeBps':500,'winnerAward':'1900000','label':'Monad testnet · AUSD test token'}}
 elif path=='session':value={'token':'ui-test-session','wallet':WALLET if state['verified'] else None,'walletExpires':int(time.time()*1000)+3600000 if state['verified'] else 0}
 elif path=='auth/challenge':value={'message':'Simulated UI-only wallet proof'}
 elif path=='auth/verify':state['verified']=True;value={'wallet':WALLET}
 elif path=='duels/fixture/funding-status':value={'phase':'approval-ready','canFund':True,'approvalNeeded':True}
 elif path=='duels/fixture':value={'id':'fixture','state':'Funding','moneyLabel':'Monad testnet · AUSD test token','participants':[{'isYou':True,'wallet':WALLET,'seat':0,'chog':'mamio','nickname':'UI fixture','funded':False},{'isYou':False,'wallet':'0x'+'22'*20,'seat':1,'chog':'toad','nickname':'UI rival','funded':False}],'transactions':[]}
 else:raise RuntimeError('Unexpected API request '+path)
 route.fulfill(status=200,content_type='application/json',body=json.dumps(value))
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
local=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
base=os.environ.get('CHOG_FAUCET_TEST_URL',f'http://127.0.0.1:{port}')
try:
 for _ in range(100):
  try:urllib.request.urlopen(f'http://127.0.0.1:{port}/play.html',timeout=1).close();break
  except Exception:time.sleep(.05)
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1280,'height':800},service_workers='block')
  context.route('**/api/**',api);context.expose_binding('fixtureFaucetProvider',provider)
  context.add_init_script("window.ethereum={request:async(args)=>{const r=await window.fixtureFaucetProvider(args);if(r.error)throw Object.assign(new Error(r.error.message),r.error);return r.result;}};")
  page=context.new_page();page.on('pageerror',lambda error:report['errors'].append(str(error)))
  def open_page(path):
   page.goto(base+path);page.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000);page.wait_for_selector('[data-action=claim-faucet]');page.wait_for_function('!document.querySelector("[data-action=claim-faucet]").disabled')
  open_page('/play.html?online=paid&touch=0');page.click('[data-chog=mamio]')
  button=page.locator('[data-action=claim-faucet]');assert 'CONNECT & CLAIM' in button.inner_text();button.click()
  page.wait_for_function('document.querySelector(".online-faucet-status").textContent.includes("cancelled")');assert state['chain']=='0x279f';assert not state['sent'];report['checks']['connectSwitchAndRejection']=True
  state['mode']='success';state['pending']=True;button.click();page.wait_for_function('document.querySelector(".online-faucet-status").textContent.includes("submitted")');assert len(state['sent'])==1
  assert page.locator('[data-action=claim-faucet]').is_disabled();tx=state['sent'][0];assert tx['from']==WALLET and tx['to']==FAUCET and tx['data']=='0x544c7cf9'+WALLET[2:].rjust(64,'0') and int(tx['gas'],16)==124812
  # The pending journal must survive a fresh page without re-opening a send.
  open_page('/play.html?online=paid&touch=0');assert page.locator('[data-action=claim-faucet]').inner_text()=='CHECK CLAIM STATUS';assert len(state['sent'])==1
  state['pending']=False;state['balance']=10**10;page.click('[data-action=claim-faucet]');page.wait_for_function('document.querySelector(".online-faucet-status").textContent.includes("10,000 AUSD received")');assert len(state['sent'])==1;assert '10,000 AUSD' in page.locator('.online-faucet-heading').inner_text();assert page.locator('.online-faucet a').get_attribute('href').endswith(HASH)
  report['checks']['pendingReloadNoResendAndVerifiedCredit']=True
  for width,height in [(1440,900),(1280,720),(1024,768),(768,1024),(844,390),(740,360),(390,844)]:
   page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   for selector in ['.online-faucet button','.online-faucet a']:
    for element in page.locator(selector).all():
     element.scroll_into_view_if_needed();box=element.bounding_box();assert box['x']>=-1 and box['x']+box['width']<=width+1;assert box['height']>=44
   page.locator('.online-faucet').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'faucet-{width}x{height}.png'));report['viewports'].append({'width':width,'height':height,'fits':True,'targetsAtLeast44':True})
  state['mode']='cooldown';page.click('[data-action=claim-faucet]');page.wait_for_function('document.querySelector(".online-faucet-status").textContent.includes("cooling down")');assert len(state['sent'])==1;report['checks']['cooldownDoesNotSend']=True
  state['mode']='success';state['native']=0;page.click('[data-action=claim-faucet]');page.wait_for_function('document.querySelector(".online-faucet-status").textContent.includes("need MON testnet")');assert len(state['sent'])==1;report['checks']['missingGasDoesNotSend']=True
  state['native']=10**18;open_page('/play.html?duel=fixture&touch=0');assert page.locator('[data-action=fund-duel]').count()==1;assert page.locator('.online-faucet').count()==1;report['checks']['faucetAlsoAvailableBeforeEntryFunding']=True
  assert page.locator('#duel-reuse-approval').is_checked();page.locator('#duel-reuse-approval').uncheck();assert 'ALLOW 1 & DEPOSIT 1 AUSD' in page.locator('[data-action=fund-duel]').inner_text();page.locator('#duel-reuse-approval').check();assert 'ALLOW 10 & DEPOSIT 1 AUSD' in page.locator('[data-action=fund-duel]').inner_text()
  for width,height in [(1280,720),(844,390),(390,844)]:
   page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.locator('.online-approval-choice').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'approval-choice-{width}x{height}.png'))
  report['checks']['boundedApprovalChoicesVisibleAndResponsive']=True
  assert not report['errors'];report['status']='PASS';report['baseUrl']=base;report['walletTransactions']=len(state['sent']);report['calldataAndGasVerified']=True
  (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));context.close();browser.close()
finally:local.terminate();local.wait(timeout=10)
