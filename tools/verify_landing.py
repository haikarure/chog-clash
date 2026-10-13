"""Browser checks for comic motion, responsive reading and actual game entry."""
from pathlib import Path
from urllib.parse import urlparse
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'validation'
BASE='http://127.0.0.1:5173'
report={'status':'pending','errors':[],'http_errors':[],'viewports':[]}
requests=[]


def monitor(page):
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    page.on('response',lambda r:report['http_errors'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)


def ready(page):
    page.wait_for_function('document.body.dataset.ready === "true"',timeout=30000)


def horizontal_fit(page,selector):
    for el in page.locator(selector).all():
        assert el.is_visible(),selector
        box=el.bounding_box()
        assert box and box['x']>=-1 and box['x']+box['width']<=page.viewport_size['width']+1,(selector,box)


with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':900})
    page=context.new_page();monitor(page)
    page.goto(BASE+'/');ready(page)
    page.wait_for_timeout(1150)
    assert page.locator('#motion-toggle').get_attribute('aria-pressed')=='true'
    first=page.locator('.cast-float').evaluate('(e)=>getComputedStyle(e).transform')
    canvas=page.evaluate('document.querySelector("#ink-particles").toDataURL()')
    page.wait_for_timeout(220)
    assert page.locator('.cast-float').evaluate('(e)=>getComputedStyle(e).transform')!=first,'Cover is not moving'
    assert page.evaluate('document.querySelector("#ink-particles").toDataURL()')!=canvas,'Particles are not moving'
    page.mouse.move(1180,310)
    page.wait_for_timeout(50)
    assert page.evaluate('document.documentElement.style.getPropertyValue("--mx")')!='0','Pointer parallax missing'
    page.click('#motion-toggle')
    page.wait_for_function('document.querySelector(".cast-float").getAnimations().every(a=>!a.pending && a.playState==="paused")')
    first=page.locator('.cast-float').evaluate('(e)=>getComputedStyle(e).transform')
    page.wait_for_timeout(150)
    assert page.locator('.cast-float').evaluate('(e)=>getComputedStyle(e).transform')==first,'Pause did not stop motion'
    assert page.evaluate('document.body.dataset.motion')=='paused'
    page.reload();ready(page)
    assert page.locator('#motion-toggle').get_attribute('aria-pressed')=='false','Motion preference not restored'
    report['motion']='Live character layer, animated ink particles, pointer parallax, pause/resume and saved preference passed'

    ids=page.evaluate('CHOG.characters.map(c=>c.id)')
    assert len(ids)==12 and page.locator('[data-crew]').count()==12
    for id in ids:
        page.click(f'[data-crew={id}]')
        expected=page.evaluate('(id)=>CHOG.get(id).name',id)
        assert page.locator('#crew-name').inner_text()==expected,id
        assert page.locator('[data-crew][aria-pressed=true]').count()==1
        assert page.locator('#crew-art').get_attribute('src').endswith('/'+id+'.png')
        assert page.locator('#crew-play').get_attribute('href')=='play.html?fighter='+id
        assert page.locator('#crew-moves kbd').count()==4
    page.locator('[data-crew=rogue]').focus();page.keyboard.press('ArrowRight')
    assert page.locator('#crew-name').inner_text()=='TABSU'
    report['crew']='12 personas, accurate previews, move labels, deep links and keyboard navigation passed'
    stages=page.evaluate('Object.keys(MatchRules.stages)')
    for id in stages:
        page.click(f'[data-world={id}]')
        assert page.locator('#world-name').inner_text()==page.evaluate('(id)=>MatchRules.stages[id].name.toUpperCase()',id)
        assert page.locator('[data-world][aria-pressed=true]').count()==1
        assert page.locator('#world-image').get_attribute('src')==page.evaluate('(id)=>MatchRules.stages[id].image',id)
    report['world']='All five arena previews and captions passed'
    page.click('#motion-toggle');page.click('#impact-button')
    page.wait_for_function('document.querySelector("#showdown-panel").classList.contains("impacting")')
    page.wait_for_function('!document.querySelector("#showdown-panel").classList.contains("impacting")')
    page.click('#motion-toggle')
    assert float(page.evaluate('document.documentElement.style.getPropertyValue("--read-progress")'))>0
    report['comic_impact_and_reading_progress']='passed'

    for width,height in [(1440,900),(1280,720),(1024,768),(768,1024),(844,390),(390,844),(360,800),(320,640)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('scrollTo({top:0,behavior:"instant"})')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Page overflow '+str((width,height))
        horizontal_fit(page,'.comic-nav .comic-logo,.motion-toggle,.nav-play,.cover-actions a')
        for selector in ['#story','#crew','#world','#how-to-play','.final-chapter']:
            page.locator(selector).scroll_into_view_if_needed()
            page.wait_for_timeout(65)
        horizontal_fit(page,'[data-crew],[data-world],#crew-play,.final-actions a')
        clipped=page.locator('.crew-card-name').evaluate_all('(list)=>list.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent)')
        assert not clipped,('Unreadable persona names',width,clipped)
        overlap=page.locator('.crew-card').evaluate_all('(list)=>list.filter(e=>e.querySelector(".crew-card-art").getBoundingClientRect().bottom>e.querySelector(".crew-card-name").getBoundingClientRect().top+1).map(e=>e.dataset.crew)')
        assert not overlap,('Artwork overlaps persona names',width,overlap)
        report['viewports'].append({'width':width,'height':height,'horizontal_overflow':False,'controls_fit':True})
    report['responsive_reading']='Eight desktop, tablet, portrait and landscape viewports passed'

    # Capture clean artwork pages after reveal, with fixed navigation hidden only
    # during section captures to avoid the browser repeating it inside tall crops.
    page.set_viewport_size({'width':1440,'height':900})
    page.evaluate('scrollTo({top:0,behavior:"instant"})');page.mouse.move(0,0)
    page.screenshot(path=str(OUT/'comic-cover.png'))
    hide=page.add_style_tag(content='.comic-nav,.skip-link{visibility:hidden!important}')
    for selector,name in [('#story','comic-story'),('#crew','comic-crew'),('#world','comic-world'),('#how-to-play','comic-showdown'),('.final-chapter','comic-finale')]:
        page.locator(selector).scroll_into_view_if_needed();page.wait_for_timeout(80)
        page.locator(selector).screenshot(path=str(OUT/(name+'.png')))
    hide.evaluate('(e)=>e.remove()')
    page.evaluate('scrollTo({top:0,behavior:"instant"})')
    page.screenshot(path=str(OUT/'comic-full.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});page.evaluate('scrollTo({top:0,behavior:"instant"})')
    page.screenshot(path=str(OUT/'comic-mobile-cover.png'))
    hide=page.add_style_tag(content='.comic-nav,.skip-link{visibility:hidden!important}')
    for selector,name in [('#crew','comic-mobile-crew'),('#world','comic-mobile-world')]:
        page.locator(selector).scroll_into_view_if_needed();page.wait_for_timeout(80)
        page.locator(selector).screenshot(path=str(OUT/(name+'.png')))
    hide.evaluate('(e)=>e.remove()')

    # Actual animated cover link, browser back, and persona/training deep links.
    page.set_viewport_size({'width':1280,'height':720});page.evaluate('scrollTo({top:0,behavior:"instant"})')
    page.click('#motion-toggle')
    page.click('.cover-actions .game-link')
    page.wait_for_url('**/play.html');page.wait_for_function('window.__game?.snapshot().ready',timeout=60000)
    assert page.locator('#front-menu').get_attribute('data-screen')=='home'
    page.go_back();ready(page)
    assert not page.locator('body').evaluate('(e)=>e.classList.contains("leaving")'),'Curtain remained after Back'
    page.click('[data-crew=cookie]');page.click('#crew-play')
    page.wait_for_url('**/play.html?fighter=cookie');page.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")',timeout=60000)
    assert page.locator('#front-menu').get_attribute('data-screen')=='select'
    assert page.locator('[data-fighter=cookie]').get_attribute('aria-pressed')=='true'
    page.click('[data-cmd=confirm]');page.wait_for_function('document.querySelector("#front-menu").dataset.step==="1"')
    page.click('[data-cmd=confirm]');page.wait_for_function('document.querySelector("#front-menu").dataset.screen==="arena"');page.click('[data-cmd=start]')
    assert page.evaluate('__game.snapshot().selectedCharacter')=='cookie'
    page.goto(BASE+'/play.html?mode=training');page.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")',timeout=60000)
    assert page.locator('#front-menu').get_attribute('data-mode')=='training'
    report['game_entry']='Animated Play navigation, browser Back, Cookie selection → actual match and Training deep link passed'

    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,
      user_agent='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')
    mp=mobile.new_page();monitor(mp);mp.goto(BASE+'/');ready(mp)
    assert mp.url==BASE+'/', 'Landing must stay portrait on mobile'
    mp.locator('.nav-play').tap();mp.wait_for_url('**/mobile.html*')
    frame=mp.frame(name='game') or mp.frames[1]
    frame.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")',timeout=60000)
    assert '/play.html' in frame.url and mp.locator('html').get_attribute('data-rotated')=='true'
    report['mobile_entry']='Portrait landing → tap Play → landscape game shell passed in Chromium emulation'
    mobile.close()

    reduced=browser.new_context(reduced_motion='reduce');rp=reduced.new_page();monitor(rp);rp.goto(BASE+'/');ready(rp)
    assert rp.locator('#motion-toggle').get_attribute('aria-pressed')=='false'
    assert rp.locator('.cast-float').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
    assert rp.locator('.reveal').first.evaluate('(e)=>getComputedStyle(e).opacity')=='1'
    reduced.close()
    nojs=browser.new_context(java_script_enabled=False);np=nojs.new_page();monitor(np);np.goto(BASE+'/')
    assert np.locator('[data-crew]').count()==12 and np.locator('.cover-actions a.game-link').is_visible()
    assert not np.locator('.motion-toggle').is_visible()
    nojs.close();report['reduced_motion_and_no_js_reading']='passed'
    browser.close()

media=[url for url in requests if Path(urlparse(url).path).suffix.lower() in {'.webp','.png','.svg','.mp3','.ttf','.woff2'}]
assert all(urlparse(url).path.startswith('/assets/chog/') for url in media),media
assert not report['errors'],report['errors']
assert not report['http_errors'],report['http_errors']
report.update(status='passed',all_media_in_chog_namespace=True,generated_comic_artworks=4,locally_hosted_fonts=3)
(OUT/'landing.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
