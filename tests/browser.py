"""Browser regressions. uv run --with playwright==1.56.0 python tests/browser.py"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os
from playwright.sync_api import sync_playwright
from browser_upgrades import checks as upgrade_checks
from browser_music_failure import checks as music_failure_checks

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = Path(os.environ.get('SUBHUNT_WEB_ROOT', ROOT)).resolve()
ARTIFACTS = ROOT / "build"

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

@contextmanager
def serve():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(WEB_ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()

def toolbar_checks(page):
    for control in ['sound', 'effects']:
        page.locator('#' + control).click()
        assert page.evaluate('document.activeElement.id') == control
        settings = page.evaluate('({sound:subhunt.snapshot().sound,effects:subhunt.snapshot().effects})')
        page.wait_for_function('subhunt.snapshot().state.player.cooldown === 0')
        shots = page.evaluate('subhunt.snapshot().state.stats.shots')
        page.keyboard.press('Space')
        page.wait_for_function(f'subhunt.snapshot().state.stats.shots > {shots}')
        assert page.evaluate('({sound:subhunt.snapshot().sound,effects:subhunt.snapshot().effects})') == settings
        page.locator('#' + control).click()  # Restore the preference for the rest of the suite.
    page.screenshot(path=str(ARTIFACTS / 'toolbar-space-fire.png'), full_page=True)


def handoff_checks(page):
    for identical_ids in [False, True]:
        page.reload()
        page.evaluate('''same => {
          const make=(id,index)=>({id,index,mapping:'',connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))});
          window.testPads=[make('USB SNES primary',0),make(same?'USB SNES primary':'USB SNES backup',1)];
          testPads[1].buttons[2].pressed=true;
          navigator.getGamepads=()=>testPads;
        }''', identical_ids)
        page.get_by_role('button', name='LAUNCH OPERATION').click()
        page.wait_for_function('subhunt.snapshot().state.tick > 60')
        page.evaluate('testPads[0].buttons[0].pressed=true')
        page.wait_for_function('subhunt.snapshot().state.stats.shots > 0')
        page.evaluate('testPads[0].buttons[0].pressed=false')
        page.keyboard.press('Escape')
        before = page.evaluate('subhunt.snapshot().state')
        page.evaluate('testPads[0].connected=false')
        page.wait_for_timeout(160)
        assert page.evaluate('subhunt.snapshot().paused'), 'held backup X must not restart'
        assert page.evaluate('subhunt.snapshot().state') == before, 'handoff must preserve the paused campaign'
        # Releasing the button alone is insufficient if its D-pad remains held.
        page.evaluate('testPads[1].buttons[2].pressed=false;testPads[1].axes[0]=1')
        page.wait_for_timeout(80)
        page.evaluate('testPads[1].buttons[0].pressed=true')
        page.wait_for_timeout(80)
        assert page.evaluate('subhunt.snapshot().paused')
        assert page.evaluate('subhunt.snapshot().state') == before
        page.evaluate('testPads[1].buttons[0].pressed=false;testPads[1].axes[0]=0')
        page.wait_for_timeout(80)
        page.evaluate('testPads[1].buttons[0].pressed=true')
        page.wait_for_function('!subhunt.snapshot().paused')
        page.evaluate('testPads[1].buttons[0].pressed=false')
        page.wait_for_function(f'subhunt.snapshot().state.tick > {before["tick"]}')
        # Also cover a direct switch while combat is active, with Start held.
        page.evaluate('testPads[0].connected=true;testPads[0].buttons[9].pressed=true')
        page.wait_for_function('subhunt.snapshot().paused')
        tick = page.evaluate('subhunt.snapshot().state.tick')
        page.wait_for_timeout(160)
        assert page.evaluate('subhunt.snapshot().state.tick') == tick
        assert page.evaluate('subhunt.snapshot().paused')
        page.evaluate('testPads[0].buttons[9].pressed=false')
        page.wait_for_timeout(80)
        page.evaluate('testPads[0].buttons[9].pressed=true')
        page.wait_for_function('!subhunt.snapshot().paused')
        page.evaluate('testPads[0].buttons[9].pressed=false')
    page.screenshot(path=str(ARTIFACTS / 'controller-handoff.png'), full_page=True)
    page.evaluate('navigator.getGamepads=()=>[]')


def controller_checks(page):
    # Generic Linux/Chrome USB layout: swapped face buttons and axes 2/3.
    page.evaluate("""() => {
      window.testPad = {id:'Generic USB SNES TEST',index:0,mapping:'',connected:true,axes:[0,0,-1,0],buttons:Array.from({length:16},()=>({pressed:false}))};
      navigator.getGamepads=()=>[testPad];
    }""")
    page.get_by_role("button", name="CONTROLLER SETUP", exact=True).click()
    # Opening setup with an unconfigured axis held must not make it the baseline.
    page.evaluate('testPad.axes[2]=0')
    page.wait_for_function("subhunt.snapshot().calibration && !subhunt.snapshot().calibration.waiting")
    bindings = [("button",3),("button",0),("button",7),("button",6),("button",1),("axis",2,-1),("axis",2,1),("axis",3,-1),("axis",3,1)]
    for i, binding in enumerate(bindings):
        if binding[0] == "button":
            page.evaluate("n=>testPad.buttons[n].pressed=true", binding[1])
        else:
            page.evaluate("b=>testPad.axes[b[1]]=b[2]", list(binding))
        page.wait_for_function(f"subhunt.snapshot().calibration.step === {i+1}")
        page.evaluate("testPad.buttons.forEach(b=>b.pressed=false);testPad.axes.fill(0)")
        if i < 8:
            page.wait_for_function("!subhunt.snapshot().calibration.waiting")
        else:
            page.wait_for_function("subhunt.snapshot().calibration === null")
    page.screenshot(path=str(ARTIFACTS / "controller-mapped.png"), full_page=True)
    assert page.evaluate("subhunt.snapshot().controllerProfile.buttons.fire") == 3
    assert page.evaluate("subhunt.snapshot().controllerProfile.directions.left.index") == 2
    saved = page.evaluate("localStorage.getItem('subhunt-controllers-v1')")
    # A partial or cancelled setup must preserve the previous saved profile.
    page.wait_for_timeout(80)
    # The controller-only entry path must also tolerate Select plus a held D-pad.
    page.evaluate('testPad.axes[2]=1;testPad.buttons[6].pressed=true')
    page.wait_for_function('subhunt.snapshot().calibration !== null')
    page.evaluate('testPad.axes[2]=0;testPad.buttons[6].pressed=false')
    page.wait_for_function("!subhunt.snapshot().calibration.waiting")
    page.evaluate("testPad.buttons[4].pressed=true")
    page.wait_for_function("subhunt.snapshot().calibration.step === 1")
    page.evaluate("testPad.buttons[4].pressed=false")
    page.keyboard.press("Escape")
    assert page.evaluate("localStorage.getItem('subhunt-controllers-v1')") == saved
    page.wait_for_timeout(80)

    def press(n):
        page.evaluate("n=>testPad.buttons[n].pressed=true", n)
        page.wait_for_timeout(65)
        page.evaluate("n=>testPad.buttons[n].pressed=false", n)
        page.wait_for_timeout(65)

    page.evaluate("testPad.axes[2]=1")
    page.wait_for_function("subhunt.snapshot().role === 'sub'")
    page.evaluate("testPad.axes[2]=0")
    press(3)
    page.wait_for_function("subhunt.snapshot().screen === 'playing'")
    x = page.evaluate("subhunt.snapshot().state.player.x")
    page.evaluate("testPad.axes[2]=1")
    page.wait_for_timeout(250)
    page.evaluate("testPad.axes[2]=0")
    assert page.evaluate("subhunt.snapshot().state.player.x") > x + 20
    page.get_by_role("button", name="CONTROLLER SETUP", exact=True).click()
    assert page.evaluate("subhunt.snapshot().paused && subhunt.snapshot().calibration !== null")
    assert not page.locator("#pause").is_enabled()
    tick = page.evaluate("subhunt.snapshot().state.tick")
    page.wait_for_timeout(100)
    assert page.evaluate("subhunt.snapshot().state.tick") == tick
    page.keyboard.press("Escape")
    page.wait_for_timeout(80)
    press(3)
    page.wait_for_function("!subhunt.snapshot().paused")
    press(0)
    assert page.evaluate("subhunt.snapshot().state.stats.pings") > 0
    press(7)
    page.wait_for_function("subhunt.snapshot().paused")
    page.screenshot(path=str(ARTIFACTS / "controller-pause.png"), full_page=True)
    press(3)
    page.wait_for_function("!subhunt.snapshot().paused")
    # Unplugging a pad that has driven the game pauses it, and held reconnect
    # inputs cannot dismiss that pause until the controller returns to neutral.
    page.evaluate("testPad.connected=false")
    page.wait_for_function("subhunt.snapshot().paused")
    tick = page.evaluate("subhunt.snapshot().state.tick")
    page.evaluate("testPad.connected=true;testPad.buttons[3].pressed=true")
    page.wait_for_timeout(150)
    assert page.evaluate("subhunt.snapshot().paused")
    assert page.evaluate("subhunt.snapshot().state.tick") == tick
    page.evaluate("testPad.buttons[3].pressed=false")
    page.wait_for_timeout(65)
    press(3)
    page.wait_for_function("!subhunt.snapshot().paused")
    press(7)
    press(1)  # X restarts from pause, according to the learned profile.
    assert not page.evaluate("subhunt.snapshot().paused")
    assert page.evaluate("subhunt.snapshot().state.player.hp") == 5
    press(7)
    press(0)  # B returns to vessel selection.
    page.wait_for_function("subhunt.snapshot().screen === 'menu'")
    press(6)  # Select opens setup without mouse or keyboard.
    page.wait_for_function("subhunt.snapshot().calibration !== null")
    page.screenshot(path=str(ARTIFACTS / "controller-setup.png"), full_page=True)
    page.keyboard.press("Escape")
    page.reload()
    page.wait_for_function("typeof subhunt !== 'undefined'")
    page.evaluate("""() => {
      window.testPad={id:'Generic USB SNES TEST',index:0,mapping:'',connected:true,axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false}))};
      navigator.getGamepads=()=>[testPad];
    }""")
    page.wait_for_function("subhunt.snapshot().controllerProfile.buttons.fire === 3")
    # A raw hat can have a nonzero neutral value; the first face-button press
    # confirms that released value rather than guessing that every axis is zero.
    page.evaluate('''() => {
      window.testPad={id:'USB hat baseline',index:0,mapping:'',connected:true,axes:[-1],buttons:Array.from({length:16},()=>({pressed:false}))};
    }''')
    page.get_by_role('button', name='CONTROLLER SETUP', exact=True).click()
    page.evaluate('testPad.axes[0]=3')
    page.wait_for_function('!subhunt.snapshot().calibration.waiting')
    page.evaluate('testPad.buttons[0].pressed=true')
    page.wait_for_function('subhunt.snapshot().calibration.step === 1')
    page.evaluate('testPad.buttons[0].pressed=false')
    page.wait_for_function('!subhunt.snapshot().calibration.waiting')
    page.screenshot(path=str(ARTIFACTS / 'calibration-released-baseline.png'), full_page=True)
    page.keyboard.press('Escape')
    page.evaluate("navigator.getGamepads=()=>[]")


def result_checks(browser, url):
    context = browser.new_context(viewport={"width":1440,"height":1100})
    # Test-only state fixtures expose the real simulation instance without adding
    # a production state mutator; combat and campaign behaviour are covered by sim.cjs.
    context.add_init_script("""(() => {
      let api;
      Object.defineProperty(window,'SubHunt',{configurable:true,get:()=>api,set:value=>{
        api={...value,create:(...args)=>{const s=value.create(...args);window.fixtureState=s;return s;}};
      }});
    })()""")
    page = context.new_page()
    page.goto(url)
    page.get_by_role("button",name="LAUNCH OPERATION").click()
    page.evaluate("fixtureState.enemies.forEach(e=>e.cooldown=.7)")
    page.wait_for_function("subhunt.snapshot().state.enemies.some(e=>e.warned)")
    page.screenshot(path=str(ARTIFACTS / "firing-warning.png"), full_page=True)
    page.evaluate("fixtureState.enemies=[];fixtureState.player.hp=3")
    page.wait_for_function("subhunt.snapshot().state.transition > 0")
    page.screenshot(path=str(ARTIFACTS / "sector-clear.png"), full_page=True)
    page.evaluate("fixtureState.transition=.01")
    page.wait_for_function("subhunt.snapshot().state.mission === 1")
    assert page.evaluate("subhunt.snapshot().state.player.hp") == 4
    page.evaluate("fixtureState.score=1234;fixtureState.kills=2;fixtureState.stats={shots:4,hits:2,pings:3,damageTaken:1,pickups:0,blocked:0,toys:0,rivalToys:0};fixtureState.timeLeft=.001")
    page.wait_for_function("subhunt.snapshot().screen === 'result'")
    assert page.get_by_text("The water ran cold.",exact=True).is_visible()
    assert page.locator("#report-accuracy").inner_text() == "50%"
    assert page.locator("#report-score").inner_text() == "1,234"
    assert page.locator("#report-pings").inner_text() == "3"
    assert page.evaluate("localStorage.getItem('subhunt-best-v1')") == "1234"
    page.screenshot(path=str(ARTIFACTS / "operation-report.png"), full_page=True)
    page.get_by_role("button",name="CHANGE VESSEL",exact=True).click()
    assert page.locator("#best-score").inner_text() == "001234"
    context.close()


def run():
    ARTIFACTS.mkdir(exist_ok=True)
    with serve() as url, sync_playwright() as pw:
        options = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
        browser = pw.chromium.launch(**options)
        context = browser.new_context(viewport={"width": 1440, "height": 1100})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url)
        page.wait_for_function("typeof window.subhunt !== 'undefined'")
        page.screenshot(path=str(ARTIFACTS / "desktop-menu.png"), full_page=True)
        page.get_by_role("button", name="LAUNCH OPERATION").focus()
        page.keyboard.press('Space')  # Menus retain native focused-button activation.
        page.wait_for_function("subhunt.snapshot().state.tick > 3")
        x = page.evaluate("subhunt.snapshot().state.player.x")
        page.keyboard.down("ArrowRight")
        page.wait_for_timeout(300)
        page.keyboard.up("ArrowRight")
        assert page.evaluate("subhunt.snapshot().state.player.x") > x + 20
        page.keyboard.down("Space")
        page.wait_for_timeout(100)
        page.keyboard.up("Space")
        assert page.evaluate("subhunt.snapshot().state.projectiles.some(q => q.friendly)")
        # Both edges in one task guarantee that no animation frame can see a held key.
        page.evaluate("""() => {
            window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyE'}));
            window.dispatchEvent(new KeyboardEvent('keyup', {code:'KeyE'}));
        }""")
        page.wait_for_function("subhunt.snapshot().state.player.sonar > 0")
        page.screenshot(path=str(ARTIFACTS / "desktop-battle.png"), full_page=True)
        toolbar_checks(page)
        page.keyboard.press("Escape")
        tick = page.evaluate("subhunt.snapshot().state.tick")
        page.wait_for_timeout(250)
        assert page.evaluate("subhunt.snapshot().state.tick") == tick
        page.get_by_role("button", name="RESUME OPERATION").focus()
        page.keyboard.press('Space')
        page.wait_for_function(f"subhunt.snapshot().state.tick > {tick}")
        page.keyboard.press("Escape")
        page.get_by_role("button", name="CHANGE VESSEL", exact=True).click()
        page.get_by_role("button", name="02 / SUBMERGED").click()
        page.get_by_role("button", name="LAUNCH OPERATION").click()
        y = page.evaluate("subhunt.snapshot().state.player.y")
        page.keyboard.down("ArrowUp")
        page.wait_for_timeout(300)
        page.keyboard.up("ArrowUp")
        assert page.evaluate("subhunt.snapshot().state.player.y") < y - 20
        page.get_by_role("button", name="Enable sound").click()
        assert page.get_by_role("button", name="Mute sound").get_attribute("aria-pressed") == "true"
        page.keyboard.press("Space")
        page.screenshot(path=str(ARTIFACTS / "submarine-battle.png"), full_page=True)
        # Headless Chromium keeps background tabs focused; explicitly exercise its blur handler.
        page.keyboard.down("ArrowRight")
        page.evaluate("window.dispatchEvent(new Event('blur'))")
        page.keyboard.up("ArrowRight")
        page.wait_for_function("subhunt.snapshot().paused")
        tick = page.evaluate("subhunt.snapshot().state.tick")
        page.wait_for_timeout(100)
        assert page.evaluate("subhunt.snapshot().state.tick") == tick
        page.get_by_role("button", name="CHANGE VESSEL", exact=True).click()
        # Synthetic standard-layout gamepad: no physical USB device claimed.
        page.evaluate("""() => {
          window.testPad = {connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))};
          navigator.getGamepads = () => [window.testPad];
          window.testPad.buttons[0].pressed=true;
        }""")
        page.wait_for_function("subhunt.snapshot().screen === 'playing'")
        page.evaluate("testPad.buttons[0].pressed=false; testPad.axes[0]=1")
        page.wait_for_timeout(250)
        assert page.evaluate("subhunt.snapshot().state.player.x") > 520
        page.evaluate("testPad.axes[0]=0; testPad.buttons[9].pressed=true")
        page.wait_for_function("subhunt.snapshot().paused")
        page.evaluate("testPad.buttons[9].pressed=false")
        page.wait_for_timeout(50)
        page.evaluate("testPad.buttons[9].pressed=true")
        page.wait_for_function("!subhunt.snapshot().paused")
        page.evaluate("navigator.getGamepads=()=>[]")
        page.wait_for_function("subhunt.snapshot().paused")
        page.get_by_role("button", name="CHANGE VESSEL", exact=True).click()
        controller_checks(page)
        handoff_checks(page)
        # Cache install, then offline navigation under the same origin.
        page.evaluate("navigator.serviceWorker.ready")
        page.reload()
        page.wait_for_function("navigator.serviceWorker.controller !== null")
        context.set_offline(True)
        page.reload()
        page.get_by_role("button", name="LAUNCH OPERATION").click()
        page.wait_for_function("subhunt.snapshot().state.tick > 3")
        context.set_offline(False)
        # Preferences persist and calm effects retain normal movement and weapon simulation.
        page.get_by_role("button", name="Reduce visual effects").click()
        assert page.evaluate("!subhunt.snapshot().effects")
        page.reload()
        assert page.get_by_role("button", name="Enable visual effects").get_attribute("aria-pressed") == "false"
        page.get_by_role("button", name="Enable visual effects").click()
        # Very narrow, mobile and tablet layouts retain all controls without overflow.
        for width, height in [(320, 850), (390, 844), (768, 1024), (1024, 768)]:
            page.set_viewport_size({"width": width, "height": height})
            page.reload()
            page.wait_for_function("typeof subhunt !== 'undefined'")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"overflow at {width}"
            assert page.get_by_role("button", name="LAUNCH OPERATION").is_visible()
            page.screenshot(path=str(ARTIFACTS / f"menu-{width}.png"), full_page=True)
            card = page.locator("#start-card").bounding_box()
            frame = page.locator(".console").bounding_box()
            assert card["x"] >= frame["x"], f"menu left edge at {width}px"
            assert card["x"] + card["width"] <= frame["x"] + frame["width"], f"menu right edge at {width}px"
            viewport = page.locator("#viewport").bounding_box()
            assert card["y"] >= viewport["y"], f"menu top edge at {width}px"
            assert card["y"] + card["height"] <= viewport["y"] + viewport["height"], f"menu bottom edge at {width}px"
            page.get_by_role("button", name="LAUNCH OPERATION").click()
            # Both the battle and its controls must fit together without scrolling past instructions.
            page.evaluate("window.scrollTo(0, 0)")
            bounds = page.locator(".touch-controls").bounding_box()
            battle = page.locator("#viewport").bounding_box()
            assert bounds["y"] - (battle["y"] + battle["height"]) < 140
            if width <= 768:
                assert bounds["y"] + bounds["height"] <= height
                assert battle["y"] >= 0
            else:
                page.get_by_role("button", name="Move right", exact=True).scroll_into_view_if_needed()
            bounds = page.get_by_role("button", name="Move right", exact=True).bounding_box()
            page.mouse.move(bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2)
            page.mouse.down()
            page.wait_for_timeout(250)
            page.mouse.up()
            assert page.evaluate("subhunt.snapshot().state.player.x") > 520, f"touch movement at {width}px"
            page.screenshot(path=str(ARTIFACTS / f"battle-{width}.png"), full_page=True)
        # Direct file launch works without module fetching or a web server.
        page.goto((WEB_ROOT / "index.html").as_uri())
        page.get_by_role("button", name="LAUNCH OPERATION").click()
        page.wait_for_function("subhunt.snapshot().state.tick > 3")
        result_checks(browser, url)
        upgrade_checks(browser, url, ARTIFACTS)
        music_failure_checks(browser, url, ARTIFACTS)
        reduced = browser.new_context(reduced_motion="reduce")
        calm = reduced.new_page()
        calm.goto(url)
        assert calm.get_by_role("button", name="Enable visual effects").get_attribute("aria-pressed") == "false"
        calm.get_by_role("button", name="LAUNCH OPERATION").click()
        calm.keyboard.press("Space")
        calm.wait_for_function("subhunt.snapshot().state.stats.shots > 0")
        calm.screenshot(path=str(ARTIFACTS / "reduced-effects.png"), full_page=True)
        calm.get_by_role("button", name="Enable sound").click()
        # Changing sound alone must not override the system's effects preference.
        calm.reload()
        calm.wait_for_function("typeof subhunt !== 'undefined'")
        assert calm.get_by_role("button", name="Mute sound").get_attribute("aria-pressed") == "true"
        calm.emulate_media(reduced_motion="no-preference")
        calm.wait_for_function("subhunt.snapshot().effects")
        reduced.close()
        assert not errors, errors
        print("PASS: both roles, keyboard/touch, quick taps, pause, preferences, default/custom USB pads, nine-step calibration/cancel/persistence, reconnect, reports, Pond Panic, powers, difficulty, music pause/mute/failure recovery, WAV hashes, reduced motion, offline and file://; web root: " + str(WEB_ROOT))
        browser.close()

if __name__ == "__main__":
    run()
