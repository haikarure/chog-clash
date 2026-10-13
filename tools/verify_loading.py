"""Measure menu and selected-match readiness on a fresh simulated 4 Mbps link."""
from pathlib import Path
import json,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'validation/upgrades';OUT.mkdir(exist_ok=True)
def main():
 result={'profile':{'bitsPerSecond':4000000,'latencyMs':80,'serviceWorkers':'blocked'},'measurements':[]}
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True);c=b.new_context(viewport={'width':1280,'height':720},service_workers='block');page=c.new_page();cdp=c.new_cdp_session(page)
  cdp.send('Network.enable');cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':80,'downloadThroughput':500000,'uploadThroughput':500000,'connectionType':'cellular4g'})
  for label in ['cold','warm']:
   start=time.perf_counter();page.goto('http://localhost:5173/play.html?touch=0',wait_until='domcontentloaded');page.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=90000)
   elapsed=time.perf_counter()-start;resources=page.evaluate('performance.getEntriesByType("resource").map(r=>({url:r.name,bytes:r.transferSize}))');row={'cache':label,'menuReadySeconds':elapsed,'pageTargetTransferBytes':sum(r['bytes'] for r in resources),'atlasRequests':sum('sprite-sheet' in r['url'] for r in resources),'audioRequests':sum(r['url'].endswith('.mp3') for r in resources)}
   assert row['atlasRequests']==row['audioRequests']==0,row;result['measurements'].append(row)
  result['runtimeVersion']=page.evaluate('CHOG_PRECACHE.version');start=time.perf_counter()
  page.evaluate('async()=>{__game.manual=true;await __game.prepareMatch({player:"rogue",enemy:"tabsu",stage:"house-cup"});__game.startMatch({player:"rogue",enemy:"tabsu",stage:"house-cup",mode:"training"});__game.advance(.01)}')
  result['selectedMatch']={'pair':['rogue','tabsu'],'stage':'house-cup','readySeconds':time.perf_counter()-start,'spriteLoaded':page.evaluate('__game.snapshot().spriteLoaded')}
  c.close();b.close()
 result['status']='passed';(OUT/'network.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
