"""Funding UI reload/regression checks with explicitly stubbed API/wallet.

Serve the real game first. This proves browser behavior, not Monad settlement.
Actual contract/receipt recovery is exercised separately by server chain tests.
"""
from pathlib import Path
import json, os, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'validation/funding';OUT.mkdir(exist_ok=True)
BASE=os.environ.get('CHOG_TEST_URL','http://localhost:5174')
CONFIG=json.loads(urllib.request.urlopen(BASE+'/api/config').read())
WALLET='0x'+'11'*20;CONTRACT='0x'+'22'*20;TOKEN='0x'+'33'*20
CONFIG['settlement']={'enabled':True,'chainId':10143,'contract':CONTRACT,'token':TOKEN,'mode':'testnet','label':'Wallet/API fixture · no blockchain transaction','pool':'100','split':[70,30]}
REPORT={'status':'pending','evidenceType':'Automated Chromium with stubbed wallet/API; no blockchain transaction or human playtest','checks':{},'viewports':[],'pageErrors':[]}

class Fixture:
    def __init__(self,cup):
        self.cup=cup;self.approved=False;self.deposited=False;self.confirmed=False
        self.pending_deposit=False;self.hold_deposit_estimate=False;self.fail_estimate=False
        self.fail_confirmation=False;self.auto_confirm=True;self.sent=[];self.hashes={};self.hints={};self.held=[]
        self.cancelled=False;self.paid=False;self.pending_cancel=False;self.pending_claim=False
        self.cancel_mined=False;self.claim_mined=False;self.plan_requests={'cancel':0,'claim':0}
    def report(self):
        transactions=[{'kind':'withdraw','state':'paid' if self.paid else 'pending','recipient':WALLET,'amount':'100000000','tx_hash':self.hashes.get('claim') if self.paid else None,'error':None}] if self.cancelled else []
        return {'id':self.cup,'name':'Funding recovery check','mode':'testnet','state':'Cancelled' if self.cancelled else 'Funded' if self.confirmed else 'Draft','host':True,'created':0,'locked':None,'pool':'100000000','contract':CONTRACT,'chainId':'10143','fundingTx':self.hashes.get('deposit') if self.confirmed else None,'participants':[{'slot':i,'nickname':None,'chog':None,'checked':False,'accepted':False,'isYou':False,'invite':str(i)} for i in range(4)],'matches':[],'transactions':transactions,'counts':{'played':0,'forfeits':0,'void':0},'moneyLabel':'Wallet/API fixture · no blockchain transaction'}
    def status(self):
        if self.deposited and self.auto_confirm:self.confirmed=True
        return {'phase':'confirmed' if self.confirmed else 'recovering-confirmation' if self.deposited else 'deposit-pending' if 'deposit' in self.hashes else 'deposit-ready' if self.approved else 'approval-ready','approvalNeeded':not self.approved,'canFund':not self.deposited and 'deposit' not in self.hashes,'onchainFunded':self.deposited,'approvalTx':self.hints.get('approval'),'depositTx':self.hints.get('deposit'),'report':self.report() if self.confirmed else None}
    def reply(self,route,result,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(result))
    def api(self,route):
        path=route.request.url.split('/api',1)[1];body=route.request.post_data_json if route.request.method=='POST' else None
        if path=='/config':return self.reply(route,CONFIG)
        if path=='/session':return self.reply(route,{'token':'fixture-token','wallet':WALLET,'walletExpires':9999999999999})
        if path==f'/cups/{self.cup}':return self.reply(route,self.report())
        if path.endswith('/cancel-funding'):
            assert not self.cancelled;self.plan_requests['cancel']+=1;return self.reply(route,{'to':CONTRACT,'data':'0x03','value':'0x0'})
        if path.endswith('/confirm-cancellation'):
            assert self.cancel_mined and body['hash']==self.hashes['cancel'];self.cancelled=True;return self.reply(route,self.report())
        if path.endswith('/claim'):
            assert self.cancelled and not self.paid;self.plan_requests['claim']+=1;return self.reply(route,{'recipient':WALLET,'to':CONTRACT,'data':'0x04','value':'0x0','amount':'100000000','chainId':10143})
        if path.endswith('/confirm-claim'):
            assert self.claim_mined and body['hash']==self.hashes['claim'];self.paid=True;return self.reply(route,self.report())
        if path.endswith('/funding-status'):return self.reply(route,self.status())
        if path.endswith('/funding-progress'):
            self.hints[body['phase']]=body['hash'];return self.reply(route,{'saved':True})
        if path.endswith('/funding'):
            steps=([{'phase':'approval','transaction':{'to':TOKEN,'data':'0x01','value':'0x0'}}] if not self.approved else [])+[{'phase':'deposit','transaction':{'to':CONTRACT,'data':'0x02','value':'0x0'}}]
            return self.reply(route,{'steps':steps,'transactions':[step['transaction'] for step in steps]})
        if path.endswith('/confirm-funding'):
            if self.fail_confirmation:return self.reply(route,{'error':'Confirmation service temporarily unavailable'},503)
            assert self.deposited and body['hash']==self.hashes['deposit'];self.confirmed=True;return self.reply(route,self.report())
        raise AssertionError(('Unexpected API request',path))
    def rpc(self,route):
        call=route.request.post_data_json;method=call['method'];params=call.get('params',[])
        if method=='eth_chainId':return self.reply(route,{'result':'0x279f'})
        if method=='eth_accounts':return self.reply(route,{'result':[WALLET]})
        if method=='eth_gasPrice':return self.reply(route,{'result':hex(100000000000)})
        if method=='eth_estimateGas':
            if self.fail_estimate:return self.reply(route,{'error':{'message':'execution reverted','code':-32000}})
            if params[0]['to']==CONTRACT and self.hold_deposit_estimate:self.held.append(route);return
            return self.reply(route,{'result':hex(100001)})
        if method=='eth_sendTransaction':
            tx=params[0];assert int(tx['gas'],16)==110002;assert tx['from']==WALLET and tx['value']=='0x0'
            phase='approval' if tx['to']==TOKEN else 'cancel' if tx['data']=='0x03' else 'claim' if tx['data']=='0x04' else 'deposit';self.sent.append(tx);self.hashes[phase]='0x'+str(len(self.sent)).zfill(64)
            if phase=='approval':self.approved=True
            elif phase=='cancel':self.cancel_mined=not self.pending_cancel
            elif phase=='claim':self.claim_mined=not self.pending_claim
            elif not self.pending_deposit:self.deposited=True
            return self.reply(route,{'result':self.hashes[phase]})
        if method=='eth_getTransactionReceipt':
            phase=next((phase for phase,value in self.hashes.items() if value==params[0]),None)
            mined=self.approved if phase=='approval' else self.cancel_mined if phase=='cancel' else self.claim_mined if phase=='claim' else self.deposited
            return self.reply(route,{'result':{'status':'0x1','transactionHash':params[0]} if mined else None})
        raise AssertionError(('Unexpected wallet method',method))

INIT="""window.ethereum={request:async payload=>{const response=await fetch('/__fixture-wallet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const body=await response.json();if(body.error)throw Object.assign(new Error(body.error.message),{code:body.error.code});return body.result;}};"""
def open_fixture(browser,fixture,viewport=None):
    context=browser.new_context(viewport=viewport or {'width':1280,'height':720},service_workers='block')
    context.route('**/api/**',fixture.api);context.route('**/__fixture-wallet',fixture.rpc);context.add_init_script(INIT)
    page=context.new_page();page.on('pageerror',lambda error:REPORT['pageErrors'].append(str(error)))
    page.goto(BASE+f'/play.html?cup={fixture.cup}&touch=0');page.wait_for_selector('.online-funding')
    return context,page
def wait(page,predicate,timeout=15000):
    end=time.monotonic()+timeout/1000
    while time.monotonic()<end:
        if predicate():return
        page.wait_for_timeout(50)
    raise AssertionError('Funding fixture did not reach the expected state')
def funded(page):page.wait_for_selector('.online-funding h2:text-is("PRIZE POOL CONFIRMED")',timeout=15000)
def fit(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    for item in page.locator('.online-funding button,.online-funding input').all():
        if item.is_visible():
            item.scroll_into_view_if_needed();box=item.bounding_box();assert box and box['width']>=44 and box['height']>=44
            assert box['x']>=-1 and box['x']+box['width']<=page.viewport_size['width']+1

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    fixture=Fixture('approval-reload');fixture.hold_deposit_estimate=True
    context,page=open_fixture(browser,fixture);page.locator('[data-action=fund]').wait_for(state='visible')
    page.wait_for_function('!document.querySelector("[data-action=fund]").disabled');page.click('[data-action=fund]')
    wait(page,lambda:len(fixture.held)>0);assert len(fixture.sent)==1
    fixture.hold_deposit_estimate=False;page.reload()
    for route in fixture.held:
        try:route.abort()
        except Exception:pass  # The reload may already have cancelled this request.
    fixture.held.clear();page.wait_for_function('!document.querySelector("[data-action=fund]")?.disabled')
    assert 'DEPOSIT 100' in page.locator('[data-action=fund]').inner_text();page.click('[data-action=fund]');funded(page)
    assert [tx['to'] for tx in fixture.sent]==[TOKEN,CONTRACT];page.locator('.online-funding').screenshot(path=str(OUT/'approval-reload.png'))
    REPORT['checks']['approvalReloadSendsDepositOnly']=True;context.close();print('PASS: approval reload resumes with one deposit',flush=True)

    fixture=Fixture('pending-reload');fixture.pending_deposit=True
    context,page=open_fixture(browser,fixture);page.wait_for_function('!document.querySelector("[data-action=fund]").disabled');page.click('[data-action=fund]');wait(page,lambda:len(fixture.sent)==2)
    page.reload();page.wait_for_selector('.online-funding');page.wait_for_function('document.querySelector(".online-funding-status").textContent.includes("Deposit submitted")')
    assert page.locator('[data-action=fund]').is_disabled();assert len(fixture.sent)==2
    fit(page);page.locator('.online-funding').screenshot(path=str(OUT/'pending-reload.png'))
    fixture.deposited=True;funded(page);assert len(fixture.sent)==2
    REPORT['checks']['pendingDepositReloadCannotSendAgain']=True;REPORT['checks']['pendingDepositAutoConfirms']=True
    context.close();print('PASS: pending deposit survives reload and auto-confirms',flush=True)

    fixture=Fixture('confirmation-reload');fixture.fail_confirmation=True;fixture.auto_confirm=False
    context,page=open_fixture(browser,fixture);page.wait_for_function('!document.querySelector("[data-action=fund]").disabled');page.click('[data-action=fund]')
    page.wait_for_function('document.querySelector(".online-funding-status").textContent.includes("temporarily unavailable")');assert len(fixture.sent)==2;assert page.locator('[data-action=fund]').is_disabled()
    fixture.fail_confirmation=False;fixture.auto_confirm=True;page.reload();funded(page);assert len(fixture.sent)==2
    REPORT['checks']['minedDepositReloadRecoversBackendConfirmation']=True
    context.close();print('PASS: mined deposit survives confirmation outage and reload',flush=True)

    fixture=Fixture('gas-failure');fixture.fail_estimate=True
    context,page=open_fixture(browser,fixture);page.wait_for_function('!document.querySelector("[data-action=fund]").disabled');page.click('[data-action=fund]')
    page.wait_for_function('document.querySelector(".online-funding-status").textContent.includes("Could not estimate")');assert not fixture.sent
    fixture.fail_estimate=False;page.click('[data-action=fund]');funded(page);assert len(fixture.sent)==2
    REPORT['checks']['gasFailureNeverSendsAndRetryWorks']=True;REPORT['checks']['allWalletTransactionsUseExplicitEstimatedGas']=True
    context.close();print('PASS: estimation failure blocks sending and permits retry',flush=True)

    fixture=Fixture('cancel-claim-reload');fixture.approved=fixture.deposited=fixture.confirmed=True;fixture.pending_cancel=fixture.pending_claim=True
    context,page=open_fixture(browser,fixture);page.click('[data-action=cancel-funding]');wait(page,lambda:'cancel' in fixture.hashes)
    page.reload();page.wait_for_selector('[data-action=cancel-funding]');fixture.cancel_mined=True;page.click('[data-action=cancel-funding]');page.wait_for_selector('[data-action=claim]')
    assert fixture.plan_requests['cancel']==1 and len(fixture.sent)==1
    page.click('[data-action=claim]');wait(page,lambda:'claim' in fixture.hashes);page.reload();page.wait_for_selector('[data-action=claim]');fixture.claim_mined=True;page.click('[data-action=claim]')
    page.wait_for_function('document.querySelector(".online-transactions").textContent.includes("PAID")')
    assert fixture.plan_requests['claim']==1 and len(fixture.sent)==2
    REPORT['checks']['cancellationAndClaimReloadReuseHashesWithoutResending']=True
    context.close();print('PASS: cancellation and wallet claim resume after reload',flush=True)

    for width,height in [(1280,720),(844,390),(390,844)]:
        fixture=Fixture(f'layout-{width}');context,page=open_fixture(browser,fixture,{'width':width,'height':height});page.wait_for_function('!document.querySelector("[data-action=fund]").disabled');fit(page)
        page.locator('.online-funding').screenshot(path=str(OUT/f'funding-{width}x{height}.png'))
        REPORT['viewports'].append({'width':width,'height':height,'horizontalFit':True,'controlsAtLeast44':True});context.close()
    browser.close()
assert not REPORT['pageErrors'],REPORT['pageErrors']
REPORT['status']='PASS';(OUT/'browser.json').write_text(json.dumps(REPORT,indent=2)+'\n');print(json.dumps(REPORT,indent=2))
