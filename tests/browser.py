"""Browser regressions. uv run --with playwright==1.56.0 python tests/browser.py"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "build"

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

@contextmanager
def serve():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()

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
        page.get_by_role("button", name="LAUNCH OPERATION").click()
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
        page.keyboard.press("e")
        assert page.evaluate("subhunt.snapshot().state.player.sonar") > 0
        page.screenshot(path=str(ARTIFACTS / "desktop-battle.png"), full_page=True)
        page.keyboard.press("Escape")
        tick = page.evaluate("subhunt.snapshot().state.tick")
        page.wait_for_timeout(250)
        assert page.evaluate("subhunt.snapshot().state.tick") == tick
        page.get_by_role("button", name="RESUME OPERATION").click()
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
        # Losing browser focus freezes the operation rather than keeping stale keys held.
        other = context.new_page()
        other.goto("about:blank")
        page.wait_for_timeout(100)
        assert page.evaluate("subhunt.snapshot().paused")
        other.close()
        page.bring_to_front()
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
        # Cache install, then offline navigation under the same origin.
        page.evaluate("navigator.serviceWorker.ready")
        page.reload()
        page.wait_for_function("navigator.serviceWorker.controller !== null")
        context.set_offline(True)
        page.reload()
        page.get_by_role("button", name="LAUNCH OPERATION").click()
        page.wait_for_function("subhunt.snapshot().state.tick > 3")
        context.set_offline(False)
        # Very narrow, mobile and tablet layouts retain all controls without overflow.
        for width, height in [(320, 850), (390, 844), (768, 1024), (1024, 768)]:
            page.set_viewport_size({"width": width, "height": height})
            page.reload()
            page.wait_for_function("typeof subhunt !== 'undefined'")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"overflow at {width}"
            assert page.get_by_role("button", name="LAUNCH OPERATION").is_visible()
            page.screenshot(path=str(ARTIFACTS / f"menu-{width}.png"), full_page=True)
            page.get_by_role("button", name="LAUNCH OPERATION").click()
            bounds = page.get_by_role("button", name="Move right", exact=True).bounding_box()
            page.mouse.move(bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2)
            page.mouse.down()
            page.wait_for_timeout(250)
            page.mouse.up()
            assert page.evaluate("subhunt.snapshot().state.player.x") > 520
        # Direct file launch works without module fetching or a web server.
        page.goto((ROOT / "index.html").as_uri())
        page.get_by_role("button", name="LAUNCH OPERATION").click()
        page.wait_for_function("subhunt.snapshot().state.tick > 3")
        assert not errors, errors
        print("PASS: keyboard, both roles, pause, sound, focus, gamepad, offline, four viewports, file://; no page errors")
        browser.close()

if __name__ == "__main__":
    run()
