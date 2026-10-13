"""Exercise the lesson, rival presets, movement/action recording and gamepad input."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'validation/upgrades';OUT.mkdir(exist_ok=True)
def main():
 result={};errors=[]
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True);page=b.new_page(viewport={'width':1280,'height':720});page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://localhost:5173/play.html?touch=0');page.wait_for_function('__game?.snapshot().ready&&!document.querySelector("#boot")');page.evaluate('async()=>{__game.manual=true;await __game.prepareAll()}')
  page.click('[data-cmd=lesson]');page.wait_for_function('!__game.snapshot().menuOpen&&!document.querySelector("#tutorial-card").hidden');page.evaluate('__game.advance(.01)');assert 'Move your CHOG' in page.locator('#tutorial-card').inner_text()
  page.evaluate('__game.press("d");__game.advance(.3);__game.release("d");__game.jump();__game.advance(.01)');assert 'Land a hit' in page.locator('#tutorial-card').inner_text();page.click('#tutorial-skip');assert page.locator('#tutorial-card').is_hidden();result['lesson']='Hub → movement/jump tasks → skip passed'
  def lab():
   page.locator('#settings-btn').click();details=page.locator('details',has=page.locator('#lab-record'))
   if not details.evaluate('e=>e.open'):details.locator('summary').click()
  lab();page.select_option('#dummy-preset','jump');page.click('#close-settings');page.evaluate('__game.advance(.05)');assert page.evaluate('__game.dummy.y<__game.config.groundY');result['rivalPreset']='Jump preset passed'
  page.evaluate('__game.startMatch({player:"yot",enemy:"mamio",mode:"training"})');lab();page.click('#lab-record');page.evaluate('__game.advance(4.8)')
  recorded=page.evaluate('__game.trainingState()');assert not recorded['recording'] and recorded['movementSamples']>50 and recorded['events']>0,recorded
  lab();page.click('#lab-replay');before=page.evaluate('__game.dummy.x');page.evaluate('__game.advance(2)');assert page.evaluate('__game.dummy.x')<before-30
  result['recordReplay']=dict(recorded,opponentMovedDuringReplay=True)
  page.evaluate('__game.startMatch({player:"rogue",enemy:"tabsu",mode:"training"});__game.setAI(false)')
  page.evaluate('''()=>{window.testPad={axes:[1,0],buttons:Array.from({length:16},()=>({pressed:false}))};navigator.getGamepads=()=>[window.testPad];}''');page.wait_for_timeout(50);before=page.evaluate('__game.hero.x');page.evaluate('__game.advance(.2)');assert page.evaluate('__game.hero.x')>before
  page.evaluate('window.testPad.axes[0]=0;window.testPad.buttons[9].pressed=true');page.wait_for_timeout(50);assert page.evaluate('__game.snapshot().paused')
  page.evaluate('window.testPad.buttons[9].pressed=false');page.wait_for_timeout(40);page.evaluate('window.testPad.buttons[9].pressed=true');page.wait_for_timeout(50);assert not page.evaluate('__game.snapshot().paused');page.evaluate('navigator.getGamepads=()=>[]');result['gamepad']='Emulated standard axes and Start pause/resume passed; physical device untested'
  page.set_viewport_size({'width':740,'height':360});page.evaluate('__game.draw()');page.screenshot(path=str(OUT/'training-mobile.png'));page.locator('#settings-btn').click();page.screenshot(path=str(OUT/'settings-mobile.png'));page.click('#close-settings');page.evaluate('FrontEnd.home()');page.screenshot(path=str(OUT/'hub-mobile.png'))
  result['mix']=page.evaluate('__game.audioMix()');assert all(result['mix'][key] for key in ['voiceRoute','musicRoute','ambienceRoute']);assert not errors,errors;result['errors']=errors;result['status']='passed';b.close()
 (OUT/'training.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
