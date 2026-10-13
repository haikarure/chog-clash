"""Capture public read-only pages for the demo video; close context to finalize WebM."""
from pathlib import Path
import json,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'validation/final/submission';OUT.mkdir(parents=True,exist_ok=True)
paid=json.loads((ROOT/'validation/final/public-paid/transfers.json').read_text())
cup=json.loads((ROOT/'validation/final/public-cup.json').read_text())
report={'evidenceType':'Read-only capture of deployed public site and verified onchain reports; earlier live fight/payment capture uses automated clients','segments':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1280,'height':720},service_workers='block',record_video_dir=str(OUT/'raw-video'),record_video_size={'width':1280,'height':720})
 page=context.new_page();started=time.monotonic()
 def mark(name):report['segments'].append({'name':name,'seconds':round(time.monotonic()-started,3)})
 page.goto('https://chog-clash-two.vercel.app',wait_until='networkidle');mark('landing');page.wait_for_timeout(7000);page.evaluate('scrollTo({top:650,behavior:"smooth"})');page.wait_for_timeout(3500);page.screenshot(path=str(OUT/'landing.png'))
 page.goto('https://chog-clash-two.vercel.app/play.html?duel='+paid['duelId']);page.wait_for_selector('.online-state',timeout=60000);assert page.locator('.online-state').inner_text()=='Complete';mark('paid-terms');page.wait_for_timeout(5000)
 page.locator('.online-report').scroll_into_view_if_needed();mark('paid-transfers');page.wait_for_timeout(10000);page.screenshot(path=str(OUT/'paid-transfer-ledger.png'))
 page.goto('https://chog-clash-two.vercel.app/play.html?cup='+cup['cupId']);page.wait_for_selector('.online-bracket',timeout=60000);page.locator('.online-bracket').scroll_into_view_if_needed();mark('cup-bracket');page.wait_for_timeout(8000);page.screenshot(path=str(OUT/'cup-bracket.png'))
 page.locator('.online-report').scroll_into_view_if_needed();mark('cup-transfers');page.wait_for_timeout(8000);page.screenshot(path=str(OUT/'cup-transfer-ledger.png'))
 report['videoPath']=str(page.video.path());context.close();browser.close()
(OUT/'capture.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
