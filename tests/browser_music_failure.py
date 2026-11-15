"""A missing soundtrack asset must not freeze combat or the animation loop."""


def checks(browser, url, artifacts):
    for mode in ['campaign', 'pond']:
        for role in ['boat', 'sub']:
            for remembered_sound in [False, True]:
                # Block SW interception so a cached renderer cannot hide the fault.
                context = browser.new_context(service_workers='block', viewport={'width': 1440, 'height': 1100})
                context.route('**/vendor/vanillajs/audio2d.js', lambda route: route.abort())
                if remembered_sound:
                    context.add_init_script("localStorage.setItem('subhunt-preferences-v1', JSON.stringify({sound:true,music:true}))")
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(url)
                page.locator('#mode-' + mode).click()
                page.locator('#role-' + role).click()
                page.locator('#launch').click()
                if not remembered_sound:
                    page.wait_for_function('subhunt.snapshot().state.tick > 3')
                    page.locator('#sound').click()
                page.wait_for_function('subhunt.snapshot().sound && !subhunt.snapshot().music')
                assert 'Soundtrack unavailable' in page.locator('#toast').inner_text()
                # A temporary load failure must not overwrite the saved preference.
                assert page.evaluate("JSON.parse(localStorage.getItem('subhunt-preferences-v1')).music")
                before = page.evaluate('subhunt.snapshot().state')
                page.keyboard.down('ArrowRight')
                page.keyboard.down('Space')
                page.wait_for_function(f'subhunt.snapshot().state.tick > {before["tick"] + 12}')
                page.keyboard.up('Space')
                page.keyboard.up('ArrowRight')
                after = page.evaluate('subhunt.snapshot().state')
                assert after['player']['x'] > before['player']['x']
                assert after['stats']['shots'] > before['stats']['shots']
                assert after['timeLeft'] < before['timeLeft']
                if mode == 'pond':
                    assert after['targets'][0]['x'] != before['targets'][0]['x']
                page.keyboard.press('Escape')
                frozen = page.evaluate('subhunt.snapshot().state')
                page.wait_for_timeout(120)
                assert page.evaluate('subhunt.snapshot().state') == frozen
                page.locator('#resume').click()
                page.wait_for_function(f'subhunt.snapshot().state.tick > {frozen["tick"] + 3}')
                # A second failed attempt and WAV export must also leave combat live.
                page.locator('#music').click()
                page.wait_for_function('!subhunt.snapshot().music')
                page.locator('#download-track').click()
                tick = page.evaluate('subhunt.snapshot().state.tick')
                page.wait_for_function(f'subhunt.snapshot().state.tick > {tick + 3}')
                if remembered_sound:
                    page.screenshot(path=str(artifacts / f'{mode}-{role}-missing-music.png'), full_page=True)
                # Recover the asset without restarting combat, then retry music.
                context.unroute('**/vendor/vanillajs/audio2d.js')
                page.add_script_tag(url=url + '/vendor/vanillajs/audio2d.js')
                page.locator('#music').click()
                page.wait_for_function('subhunt.snapshot().soundtrack?.active')
                assert page.evaluate('subhunt.snapshot().state.tick') > tick
                assert not errors, (mode, role, remembered_sound, errors)
                context.close()
