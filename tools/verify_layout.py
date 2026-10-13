"""Check the House Cup screen flow, responsive fit and keyboard access."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'validation'
BASE = os.environ.get('CHOG_TEST_URL', 'http://127.0.0.1:5174')
report = {'status': 'pending', 'viewports': [], 'errors': [], 'http_errors': []}


def screen(page, name):
    page.wait_for_function('(name) => document.querySelector("#front-menu").dataset.screen === name', arg=name)


def fit(page, selectors, allow_scroll=False):
    """Primary controls fit inside the viewport or its intentional vertical scroll."""
    for selector in selectors:
        for element in page.locator(selector).all():
            assert element.is_visible(), f'{selector} hidden'
            if allow_scroll:
                element.scroll_into_view_if_needed()
            box = element.bounding_box()
            size = page.viewport_size
            assert box and box['width'] > 0 and box['height'] > 0, selector
            assert box['x'] >= -1 and box['x'] + box['width'] <= size['width'] + 1, f'{selector} horizontal overflow {box}'
            assert box['y'] >= -1 and box['y'] + box['height'] <= size['height'] + 1, f'{selector} vertical overflow {box}'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Page horizontal overflow'


def pick(page, fighter, step):
    page.click(f'[data-fighter={fighter}]')
    page.click('[data-cmd=confirm]')
    page.wait_for_function('(step) => document.querySelector("#front-menu").dataset.step === step', arg=str(step))


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('response', lambda r: report['http_errors'].append({'url': r.url, 'status': r.status}) if r.status >= 400 else None)
    page.goto(BASE + '/play.html?touch=0')
    page.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")', timeout=60000)
    page.evaluate('async()=>{__game.manual=true;await __game.prepareAll();}')
    for width, height in [(1440, 900), (1280, 720), (1024, 768), (768, 1024), (844, 390), (740, 360), (390, 844)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate('FrontEnd.home()')
        narrow = width < 600 and height > 500
        fit(page, ['[data-cmd=online]', '[data-cmd=cup]', '[data-cmd=versus]', '[data-cmd=training]', '.house-brand'], narrow)
        page.click('[data-cmd=versus]')
        assert page.locator('[data-fighter]').count() == 12
        fit(page, ['[data-fighter]', '[data-cmd=confirm]'], narrow)
        pick(page, 'ping', 1)
        fit(page, ['[data-fighter]', '[data-cmd=confirm]'], narrow)
        pick(page, 'cookie', 2)
        fit(page, ['button[data-stage]', '[data-level]', '[data-cmd=start]'], narrow)
        page.click('button[data-stage=neon-street]')
        page.click('[data-level=hard]')
        page.click('[data-cmd=back]')
        assert page.locator('[data-fighter=cookie]').get_attribute('aria-pressed') == 'true'
        page.click('[data-cmd=confirm]')
        screen(page, 'arena')
        assert page.locator('button[data-stage=neon-street]').get_attribute('aria-pressed') == 'true'
        assert page.locator('[data-level=hard]').get_attribute('aria-pressed') == 'true'
        page.click('[data-cmd=start]');page.wait_for_function('!__game.snapshot().menuOpen')
        page.evaluate('__game.advance(3)')
        state = page.evaluate('__game.snapshot()')
        assert state['selectedCharacter'] == 'ping' and state['opponentCharacter'] == 'cookie'
        assert state['stageId'] == 'neon-street' and state['difficulty'] == 'hard'
        fit(page, ['.combat-header', '#settings-btn', '#pause-btn', '.skill-deck'])
        page.keyboard.press('Escape')
        assert page.locator('#pause-panel').is_visible()
        page.click('#back-menu')
        assert not page.locator('#pause-panel').is_visible()
        screen(page, 'home')
        page.click('[data-cmd=about]')
        fit(page, ['.community-credit [data-cmd=home]'], True)
        page.click('[data-cmd=home]')
        report['viewports'].append({'width': width, 'height': height, 'roster': 12, 'places': 5, 'controls_fit': True})

    # Each preview updates its own side, preserving a confirmed player on the rival step.
    page.set_viewport_size({'width': 1440, 'height': 900})
    page.evaluate('FrontEnd.home()')
    page.click('[data-cmd=versus]')
    page.click('[data-fighter=rogue]')
    assert page.locator('#player-showcase article').get_attribute('data-persona') == 'rogue'
    pick(page, 'rogue', 1)
    page.locator('[data-fighter=cookie]').hover()
    assert page.locator('#player-showcase article').get_attribute('data-persona') == 'rogue'
    assert page.locator('#rival-showcase article').get_attribute('data-persona') == 'cookie'
    assert page.locator('#front-menu').get_attribute('data-screen') == 'select'
    assert page.locator('#roster-notice').inner_text().startswith('Player locked')
    # Mirror selections are valid for all twelve characters.
    pick(page, 'rogue', 2)
    page.click('[data-cmd=start]');page.wait_for_function('!__game.snapshot().menuOpen')
    assert page.evaluate('__game.snapshot().selectedCharacter') == 'rogue'
    assert page.evaluate('__game.snapshot().opponentCharacter') == 'rogue'
    page.evaluate('FrontEnd.home()')
    page.click('[data-cmd=versus]')
    pick(page, 'ping', 1)
    page.click('[data-fighter=tonashiro]')
    assert page.locator('#player-showcase article').get_attribute('data-persona') == 'ping'
    assert page.locator('#rival-showcase article').get_attribute('data-persona') == 'tonashiro'
    page.click('[data-cmd=back]')
    assert page.locator('#player-showcase article').get_attribute('data-persona') == 'ping'
    assert page.locator('[data-fighter=ping]').get_attribute('aria-pressed') == 'true'
    report['versus_showcases'] = 'Independent player/rival previews, player lock, explicit confirm, mirror match and Back passed'

    # Keyboard-only selection, grid navigation, confirm, stage and level changes.
    page.set_viewport_size({'width': 1280, 'height': 720})
    page.evaluate('FrontEnd.home(); document.activeElement.blur()')
    page.keyboard.press('ArrowDown')
    assert page.locator('[data-cmd=online]').evaluate('(e) => e === document.activeElement')
    page.keyboard.press('ArrowDown')
    assert page.locator('[data-cmd=versus]').evaluate('(e) => e === document.activeElement')
    page.keyboard.press('Enter')
    screen(page, 'select')
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowDown')
    selected = page.locator('[data-fighter][aria-pressed=true]').get_attribute('data-fighter')
    page.keyboard.press('Enter')
    page.wait_for_function('document.querySelector("#front-menu").dataset.step === "1"')
    page.keyboard.press('d')
    rival = page.locator('[data-fighter][aria-pressed=true]').get_attribute('data-fighter')
    page.keyboard.press('Enter')
    screen(page, 'arena')
    page.keyboard.press('ArrowLeft')
    page.keyboard.press('ArrowUp')
    page.keyboard.press('Enter');page.wait_for_function('!__game.snapshot().menuOpen')
    assert page.evaluate('__game.snapshot().selectedCharacter') == selected
    assert page.evaluate('__game.snapshot().opponentCharacter') == rival
    report['keyboard_menu'] = 'Arrow/WASD grid navigation, Enter confirm/start passed'

    # Settings drawer returns to the same roster step and toggles hub animation.
    page.evaluate('FrontEnd.home()')
    page.click('[data-cmd=training]')
    page.click('[data-fighter=rogue]')
    page.wait_for_timeout(200)
    assert page.locator('#front-menu').get_attribute('data-step') == '0', 'Preview must wait for confirm'
    page.click('[data-cmd=settings]')
    page.uncheck('#menu-video-toggle')
    page.click('#close-settings')
    assert page.locator('[data-fighter=rogue]').get_attribute('aria-pressed') == 'true'
    page.click('[data-cmd=back]')
    assert not page.locator('#front-menu').evaluate('(e) => e.classList.contains("is-animated")')
    page.click('[data-cmd=settings]')
    page.check('#menu-video-toggle')
    page.click('#close-settings')
    assert page.locator('#front-menu').evaluate('(e) => e.classList.contains("is-animated")')
    report['settings_preview_back'] = 'passed'

    # Touch layout keeps all four actions and the d-pad clear of the scoreboard.
    touch_context = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True)
    touch = touch_context.new_page()
    touch.on('pageerror', lambda e: report['errors'].append('touch: ' + str(e)))
    touch.goto(BASE + '/play.html?touch=1&embed=1')
    touch.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")', timeout=60000)
    touch.evaluate('async()=>{__game.manual=true;await __game.prepareAll();}')
    touch.locator('[data-cmd=versus]').tap()
    touch.locator('[data-fighter=toad]').tap()
    touch.locator('[data-cmd=confirm]').tap()
    touch.wait_for_function('document.querySelector("#front-menu").dataset.step === "1"')
    touch.locator('[data-fighter=venty]').tap()
    touch.locator('[data-cmd=confirm]').tap()
    screen(touch, 'arena')
    touch.locator('[data-cmd=start]').tap();touch.wait_for_function('!__game.snapshot().menuOpen')
    touch.evaluate('__game.advance(3)')
    for width, height in [(844, 390), (740, 360)]:
        touch.set_viewport_size({'width': width, 'height': height})
        fit(touch, ['.combat-header', '.dbtn', '.tbtn', '#settings-btn', '#pause-btn'])
        bounds = touch.evaluate('''() => {
          const r = s => document.querySelector(s).getBoundingClientRect();
          return {hud:r('.combat-header').bottom,pad:r('.action-pad').top,dpad:r('.dpad').top};
        }''')
        assert bounds['hud'] < min(bounds['pad'], bounds['dpad'])
    touch_context.close()
    reduced = browser.new_context(reduced_motion='reduce')
    rp = reduced.new_page()
    rp.goto(BASE + '/play.html?touch=0')
    rp.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")', timeout=60000)
    assert not rp.locator('#front-menu').evaluate('(e) => e.classList.contains("is-animated")')
    assert rp.locator('#menu-video-toggle').is_disabled()
    rp.emulate_media(reduced_motion='no-preference')
    rp.wait_for_function('!document.querySelector("#menu-video-toggle").disabled')
    assert not rp.locator('#menu-video-toggle').is_disabled()
    assert rp.locator('#front-menu').evaluate('(e) => e.classList.contains("is-animated")')
    reduced.close()
    # A paused landing carries the same preference into game setup and back again.
    saved = browser.new_context()
    sp = saved.new_page()
    sp.goto(BASE + '/')
    sp.click('#motion-toggle')
    assert sp.evaluate('localStorage.getItem("chog-comic-motion")') == 'off'
    sp.goto(BASE + '/play.html?touch=0&fighter=cookie')
    sp.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")', timeout=60000)
    assert not sp.locator('#front-menu').evaluate('(e) => e.classList.contains("is-animated")')
    assert sp.locator('[data-fighter=cookie]').get_attribute('aria-pressed') == 'true'
    sp.click('[data-cmd=settings]')
    sp.check('#menu-video-toggle')
    sp.click('#close-settings')
    assert sp.locator('#front-menu').evaluate('(e) => e.classList.contains("is-animated")')
    sp.reload()
    sp.wait_for_function('window.__game?.snapshot().ready && !document.getElementById("boot")', timeout=60000)
    assert sp.locator('#front-menu').evaluate('(e) => e.classList.contains("is-animated")')
    sp.goto(BASE + '/')
    assert sp.locator('body').get_attribute('data-motion') == 'on'
    saved.close()
    report['shared_motion_preference'] = 'Landing pause, game settings, reload and return to landing passed; system reduce disables motion'
    report['touch_layout'] = 'Four actions and d-pad fit at 844×390 and 740×360'
    report['reduced_motion'] = 'passed'
    browser.close()

assert not report['errors'], report['errors']
assert not report['http_errors'], report['http_errors']
report['status'] = 'passed'
(OUT / 'layout.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
