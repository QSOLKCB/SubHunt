"""Browser evidence for living toys, powers, difficulty, and integer PCM music."""
import hashlib


def checks(browser, url, artifacts):
    context = browser.new_context(viewport={"width": 1440, "height": 1100})
    context.add_init_script("""(() => {
      let api;
      Object.defineProperty(window,'SubHunt',{configurable:true,get:()=>api,set:value=>{
        api={...value,create:(...args)=>{const s=value.create(...args);window.fixtureState=s;return s;}};
      }});
    })()""")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    page.locator('#mode-pond').click()
    page.locator('#difficulty-admiral').click()
    page.reload()
    assert page.locator('#mode-pond').get_attribute('aria-pressed') == 'true'
    assert page.locator('#difficulty-admiral').get_attribute('aria-pressed') == 'true'
    page.locator('#difficulty-cadet').click()
    page.screenshot(path=str(artifacts / 'pond-menu-desktop.png'), full_page=True)
    page.locator('#launch').click()
    page.wait_for_function('subhunt.snapshot().state.tick > 3')
    assert page.evaluate('subhunt.snapshot().state.difficulty') == 'cadet'
    assert page.evaluate('subhunt.snapshot().state.targets.length') == 11
    page.locator('#sound').click()
    page.wait_for_function('subhunt.snapshot().soundtrack?.active')
    page.evaluate('fixtureState.enemies.forEach(e=>e.cooldown=1000)')
    page.wait_for_function('subhunt.snapshot().soundtrack.started >= 2')
    assert page.evaluate('subhunt.snapshot().soundtrack.voices') <= 2
    # Real pickups at the player fixture position exercise the simulation, HUD and art.
    page.evaluate("""() => {
      fixtureState.player.hp=3;
      fixtureState.pickups=['repair','shield','rapid','volley'].map((kind,id)=>({id:900+id,kind,x:fixtureState.player.x,y:fixtureState.player.y,remaining:720}));
    }""")
    page.wait_for_function('subhunt.snapshot().state.stats.pickups === 4')
    assert page.evaluate('subhunt.snapshot().state.player.hp') == 4
    assert 'BUBBLE SHIELD' in page.locator('#power-status').inner_text()
    page.keyboard.press('Space')
    page.wait_for_function('subhunt.snapshot().state.stats.shots >= 3')
    page.screenshot(path=str(artifacts / 'pond-powers-desktop.png'), full_page=True)
    page.keyboard.press('Escape')
    before = page.evaluate('subhunt.snapshot().state')
    assert not page.evaluate('subhunt.snapshot().soundtrack.active')
    page.wait_for_timeout(180)
    assert page.evaluate('subhunt.snapshot().state') == before
    page.locator('#resume').click()
    page.wait_for_function('subhunt.snapshot().soundtrack.active')
    page.locator('#music').click()
    page.wait_for_function('!subhunt.snapshot().soundtrack.active')
    assert page.evaluate('subhunt.snapshot().sound')
    page.locator('#music').click()
    page.wait_for_function('subhunt.snapshot().soundtrack.active')
    # Space while a music toolbar button has focus remains a combat command.
    shots = page.evaluate('subhunt.snapshot().state.stats.shots')
    page.keyboard.press('Space')
    page.wait_for_function(f'subhunt.snapshot().state.stats.shots > {shots}')
    assert page.evaluate('subhunt.snapshot().music')
    page.locator('#sound').click()
    page.wait_for_function('!subhunt.snapshot().soundtrack.active')
    page.locator('#sound').click()
    page.wait_for_function('subhunt.snapshot().soundtrack.active')
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    assert page.evaluate('subhunt.snapshot().paused')
    assert not page.evaluate('subhunt.snapshot().soundtrack.active')
    # Hash actual browser downloads against the same frozen bytes as Node.
    hashes = ['c764fe7f498ac40bb6dbb2856cbb906f021817736db4798bb7ecb2cad6834a3a',
              '0f001c0ebe874adc3960d41867c177db62f1816eb41f5ff4753d70b7a90d080d',
              'c5437b0634a46f90d3d4b4cd7e85a7951796310621b146df59e408b3f3c2c042']
    for mission, expected in enumerate(hashes):
        page.evaluate('(m)=>fixtureState.mission=m', mission)
        with page.expect_download() as info:
            page.locator('#download-track').click()
        path = artifacts / f'sector-{mission+1}.wav'
        info.value.save_as(path)
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
    # Keep mode and difficulty records separate; the old Captain fleet record survives.
    page.evaluate("localStorage.setItem('subhunt-best-v1','9999')")
    page.locator('#pause-menu').click()
    assert page.locator('#best-score').inner_text() == '000000'
    page.locator('#launch').click()
    page.evaluate('fixtureState.race.ai=6;fixtureState.score=123')
    page.wait_for_function("subhunt.snapshot().screen === 'result'")
    assert page.locator('#result-title').inner_text() == 'The toys got away.'
    assert not page.evaluate('subhunt.snapshot().soundtrack.active')
    assert page.evaluate("localStorage.getItem('subhunt-best-pond-cadet-v1')") == '123'
    assert page.evaluate("localStorage.getItem('subhunt-best-v1')") == '9999'
    page.screenshot(path=str(artifacts / 'pond-rival-wins.png'), full_page=True)
    page.locator('#change-role').click()
    page.locator('#mode-campaign').click()
    page.locator('#difficulty-standard').click()
    assert page.locator('#best-score').inner_text() == '009999'
    # Gamepad mode/difficulty changes use action edges, not held-button repeats.
    page.evaluate("""() => {
      window.testPad={id:'Upgrade test',index:0,mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))};
      navigator.getGamepads=()=>[testPad];
    }""")
    page.wait_for_timeout(80)
    page.evaluate('testPad.buttons[1].pressed=true;testPad.axes[1]=1')
    page.wait_for_function("subhunt.snapshot().mode === 'pond' && subhunt.snapshot().difficulty === 'admiral'")
    page.wait_for_timeout(150)
    assert page.evaluate('subhunt.snapshot().difficulty') == 'admiral'
    page.evaluate('navigator.getGamepads=()=>[]')
    for width in [320, 390, 768]:
        page.set_viewport_size({'width': width, 'height': 900})
        page.locator('#difficulty-cadet').click()
        page.locator('#role-sub').click()
        page.screenshot(path=str(artifacts / f'pond-menu-{width}.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        card, viewport = page.locator('#start-card').bounding_box(), page.locator('#viewport').bounding_box()
        assert card['y'] >= viewport['y'] and card['y']+card['height'] <= viewport['y']+viewport['height']
        page.locator('#launch').click()
        page.wait_for_function('subhunt.snapshot().state.tick > 3')
        page.evaluate('fixtureState.enemies.forEach(e=>e.cooldown=1000)')
        page.keyboard.press('Space')
        page.screenshot(path=str(artifacts / f'pond-sub-{width}.png'), full_page=True)
        assert page.locator('#race-readout').is_visible()
        page.keyboard.press('Escape')
        page.locator('#pause-menu').click()
    page.set_viewport_size({'width':320,'height':900})
    page.locator('#launch').click()
    page.evaluate('fixtureState.race.ai=6')
    page.wait_for_function("subhunt.snapshot().screen === 'result'")
    page.screenshot(path=str(artifacts / 'pond-result-320.png'), full_page=True)
    card, viewport=page.locator('#result-card').bounding_box(),page.locator('#viewport').bounding_box()
    assert card['y']>=viewport['y'] and card['y']+card['height']<=viewport['y']+viewport['height']
    # Offline reload must carry the vendored renderer and score generator too.
    page.evaluate('navigator.serviceWorker.ready')
    page.reload()
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    context.set_offline(True)
    page.reload()
    page.locator('#launch').click()
    page.wait_for_function('subhunt.snapshot().soundtrack?.active')
    assert page.evaluate('SubHuntMusic.wav(0).length') > 44
    context.set_offline(False)
    assert not errors, errors
    context.close()
