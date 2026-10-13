"""Aggregate current observed evidence without converting automation into humans."""
from pathlib import Path
from datetime import datetime,timezone
import json,re,hashlib
ROOT=Path(__file__).resolve().parent.parent
DOC=ROOT.parents[1]/'docs/chog-clash'
if not DOC.exists():DOC=ROOT/'docs'
def read(relative):
 p=ROOT/relative
 return json.loads(p.read_text()) if p.exists() else None
log=(ROOT/'validation/online/node-tests-final.log').read_text()
counts={name:int(re.search(r'ℹ '+name+r' (\d+)',log).group(1)) for name in ['tests','pass','fail','cancelled','skipped']}
assert counts['tests']==counts['pass'] and counts['fail']==counts['cancelled']==counts['skipped']==0
summary={'status':'PASS','recordedAt':datetime.now(timezone.utc).isoformat(),'counts':counts,'log':'node-tests-final.log','scope':'Shared combat, auth, real rooms/Cup, queue, real local-EVM paid settlement, retries and restart/refund recovery'}
(ROOT/'validation/online/test-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
contracts=read('validation/final/contracts.json');assert contracts['status']=='PASS'
for name,digest in contracts['sourceSha256'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest
cache=json.JSONDecoder().raw_decode((ROOT/'precache.js').read_text().split('=',1)[1].lstrip())[0]
for name,size,digest in cache['files']:assert (ROOT/name).stat().st_size==size and hashlib.sha1((ROOT/name).read_bytes()).hexdigest()[:12]==digest
landing=read('validation/audit/landing-baseline.json');assert all(hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest for name,digest in landing.items())
paths={'cupTestnet':'validation/testnet/acceptance.json','paidTestnet':'validation/testnet/paid-duel-acceptance.json','paidLocalBrowser':'validation/final/paid-browser/report.json','publicBrowser':'validation/final/public-online/report.json','publicMobile':'validation/final/public-mobile/mobile-shell.json','publicPaidBrowser':'validation/final/public-paid/report.json','publicCup':'validation/final/public-cup.json','network':'validation/final/network.json','publicSecurity':'validation/final/public-security.json'}
if not (ROOT/paths['publicMobile']).exists():paths['publicMobile']='validation/final/public-mobile/report.json'
evidence={key:read(p) for key,p in paths.items()}
pending=[key for key,value in evidence.items() if not value or value.get('status')!='PASS']
result={'status':'PASS_AUTOMATED_RELEASE' if not pending else 'IN_PROGRESS','recordedAt':datetime.now(timezone.utc).isoformat(),'product':'CHOG Clash','baselinePrdVersion':'2.0','extensions':['Quick Match','paid invitation and queue duel'],'combatBuildHash':re.search(r'0x[0-9a-f]{64}',(ROOT/'online/build.mjs').read_text()).group(0),'nodeTests':counts,'contractTests':contracts,'economy':{'environment':'Monad testnet AUSD, no monetary value','paidDuel':{'entryPerPlayer':'1','pool':'2','winner':'1.90','treasury':'0.10','feeBps':500,'refundFee':'0'},'houseCup':{'sponsorPool':'100','champion':'70','runnerUp':'30','playerEntry':'0','platformFee':'0'}},'evidence':evidence,'pendingAutomatedEvidence':pending,'integrity':{'runtimeFiles':len(cache['files']),'runtimeVersion':cache['version'],'landingHashesUnchanged':len(landing),'serverOrContractFilesInPrecache':any(n.startswith(('server/','contracts/')) for n,_,_ in cache['files'])},'trust':'The authoritative gameplay server/result signer is trusted. Escrow validates funds and signed-result terms; replay hashes are audit identifiers, not proof of honest gameplay.','notCompleted':['two physical devices and named-device client frame benchmark','one host plus four human Cup participants and feedback','human adoption/retention/sponsor ROI measurement'],'submission':{'formHandledByUser':True,'submittedByAgent':False},'sources':{key:'../../game/chog-clash/'+p for key,p in paths.items()}}
assert not result['integrity']['serverOrContractFilesInPrecache']
(DOC/'ONLINE_VALIDATION.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':result['status'],'nodeTests':counts,'contractTests':contracts['passed'],'pendingAutomatedEvidence':pending,'runtimeVersion':cache['version']}))
