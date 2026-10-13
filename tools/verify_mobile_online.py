"""Check room navigation/reload inside the actual landscape mobile shell."""
from pathlib import Path
import json,os
from urllib.parse import urlsplit
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
BASE=os.environ.get('CHOG_TEST_URL','http://localhost:5174')
OUT=Path(os.environ.get('CHOG_TEST_OUTPUT',str(ROOT/'validation/online')));OUT.mkdir(parents=True,exist_ok=True)
errors=[];socket_origins=set()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox']);context=b.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,service_workers='block');page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('websocket',lambda socket:socket_origins.add(urlsplit(socket.url).scheme+'://'+urlsplit(socket.url).netloc))
 page.goto(BASE+'/mobile.html?touch=1');frame=page.frames[1]
 frame.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000);frame.locator('[data-cmd=online]').tap();frame.wait_for_selector('[data-action=create-room]');frame.locator('[data-action=create-room]').tap();page.wait_for_function('new URLSearchParams(location.search).has("room")');room=page.evaluate('new URLSearchParams(location.search).get("room")');page.wait_for_timeout(1100)
 page.reload();frame=page.frames[1];frame.wait_for_function('window.__game?.snapshot().ready&&!document.querySelector("#boot")',timeout=60000);frame.evaluate('async()=>{window.readOnline=(await import("./online/client.mjs")).onlineDiagnostics;}');frame.wait_for_function('window.readOnline()?.authority?.slots.some(s=>s.connected)');state=frame.evaluate('window.readOnline()');assert state['authority']['roomId']==room;assert state['seat']==0;assert state['authority']['sim'] is None
 frame.locator('[data-action=exit]').first.tap();page.wait_for_function('!new URLSearchParams(location.search).has("room")');page.screenshot(path=str(OUT/'mobile-shell.png'));b.close()
assert not errors,errors
expected=os.environ.get('CHOG_TEST_WS_ORIGIN')
if expected:assert socket_origins=={expected},socket_origins
report={'status':'PASS','verifiedAt':datetime.now(timezone.utc).isoformat(),'baseUrl':BASE,'socketOrigins':sorted(socket_origins),'evidenceType':'Chromium mobile emulation with landscape iframe','roomQuerySyncedToParent':True,'reloadKeepsHostSeat':True,'exitClearsParentRoomQuery':True,'errors':errors};(OUT/'mobile-shell.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
