#!/usr/bin/env python3
"""스틱맨 계산기 화면 동작 테스트 + 대표 스크린샷

준비: pip install playwright && playwright install chromium
실행: python3 tests/ui_test.py
"""
import functools
import http.server
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "screenshots")
results = []


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd.server_address[1]


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (" — " + str(detail) if detail else ""))


def tap(page, keys):
    for k in keys:
        page.click(f'[data-key="{k}"]')
        page.wait_for_timeout(70)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    port = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page = context.new_page()
        logs = []
        page.on("console", lambda m: logs.append((m.type, m.text)))
        page.on("pageerror", lambda e: logs.append(("pageerror", str(e))))
        page.on("requestfailed", lambda r: logs.append(("requestfailed", r.url)))
        page.goto(f"http://127.0.0.1:{port}/index.html")
        page.wait_for_timeout(500)
        check("앱 로드", page.evaluate("document.documentElement.dataset.ready") == "true")

        # ── 기본 계산: 5,623 + 98 = 5,721
        tap(page, ["5", "6", "2", "3"])
        val = page.inner_text("#value")
        check("입력 콤마 표시", val == "5,623", val)
        tap(page, ["+", "9", "8"])
        expr = page.inner_text("#expr")
        check("수식 줄 표시", expr.replace("\u00a0", "") == "5,623 +", repr(expr))
        tap(page, ["="])
        page.wait_for_timeout(200)
        val = page.inner_text("#value")
        expr = page.inner_text("#expr")
        check("계산 결과 5,721", val == "5,721", val)
        check("완료 수식 표시", expr == "5,623 + 98 =", expr)
        check("만세 모션", page.evaluate("document.getElementById('calc').classList.contains('is-cheer')"))
        page.screenshot(path=os.path.join(SHOTS, "cheer.png"))
        page.wait_for_timeout(1300)
        page.screenshot(path=os.path.join(ROOT, "preview-normal.png"))

        # ── 무거운 숫자(7자리): 낑낑
        tap(page, ["AC", "1", "2", "3", "4", "5", "6", "7"])
        page.wait_for_timeout(350)
        check("7자리 heavy 상태", page.evaluate("document.getElementById('calc').classList.contains('is-heavy')"))
        check("heavy 말풍선", "낑" in page.inner_text("#bubbleText"), page.inner_text("#bubbleText"))
        page.screenshot(path=os.path.join(SHOTS, "heavy-7digits.png"))

        # ── 아주 큰 숫자: 깔려서 엉엉
        tap(page, ["×", "9", "9", "9", "="])
        page.wait_for_timeout(500)
        val = page.inner_text("#value")
        crushed = page.evaluate("document.getElementById('calc').classList.contains('is-crushed')")
        check("큰 수 결과", val == "1,233,332,433", val)
        check("crushed 상태", crushed)
        check("crushed 말풍선", "엉엉" in page.inner_text("#bubbleText"), page.inner_text("#bubbleText"))
        page.screenshot(path=os.path.join(ROOT, "preview-heavy.png"))

        # ── 0으로 나누기
        tap(page, ["AC", "1", "2", "÷", "0", "="])
        page.wait_for_timeout(350)
        check("0 나누기 오류 표시", page.inner_text("#value") == "오류", page.inner_text("#value"))
        check("0 나누기 crushed", page.evaluate("document.getElementById('calc').classList.contains('is-crushed')"))
        page.screenshot(path=os.path.join(SHOTS, "error-div0.png"))

        # ── 절미 모드
        page.click("#modeToggle")
        page.wait_for_timeout(400)
        check("절미 모드 전환", page.evaluate("document.getElementById('calc').dataset.mode") == "jeolmi")
        check("절미 캐릭터 렌더", page.evaluate("document.querySelectorAll('#crew .figure--jeolmi-a, #crew .figure--jeolmi-b').length") == 2)
        page.screenshot(path=os.path.join(SHOTS, "jeolmi-mode.png"))

        # 절미 모드 + 큰 수
        tap(page, ["AC", "9", "8", "7", "6", "5", "4", "3", "2", "1"])
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(SHOTS, "jeolmi-crushed.png"))
        page.click("#modeToggle")
        page.wait_for_timeout(200)

        # ── 효과음 토글
        page.click("#soundToggle")
        check("효과음 끄기", page.get_attribute("#soundToggle", "aria-pressed") == "false")
        page.click("#soundToggle")
        check("효과음 켜기", page.get_attribute("#soundToggle", "aria-pressed") == "true")

        # ── 음성 읽기 (말소리)
        check("음성 토글 기본 켜짐", page.get_attribute("#speechToggle", "aria-pressed") == "true")
        page.evaluate("window.__stickman.speechLog.length = 0")
        tap(page, ["5", "6", "2", "3"])
        log = page.evaluate("window.__stickman.speechLog.slice()")
        check("숫자 읽기 로그", log == ["오", "육", "이", "삼"], log)
        tap(page, ["+", "9", "8", "="])
        page.wait_for_timeout(320)
        log = page.evaluate("window.__stickman.speechLog.slice()")
        check(
            "기호·이꼴 읽기 로그",
            log == ["오", "육", "이", "삼", "더하기", "구", "팔", "이꼴 오천칠백이십일"],
            log,
        )
        page.screenshot(path=os.path.join(SHOTS, "speech-topbar.png"), clip={"x": 0, "y": 0, "width": 390, "height": 90})
        page.click("#speechToggle")
        check("음성 끄기", page.get_attribute("#speechToggle", "aria-pressed") == "false")
        page.evaluate("window.__stickman.speechLog.length = 0")
        tap(page, ["AC", "7"])
        check("음성 끄면 조용함", page.evaluate("window.__stickman.speechLog.length") == 0)
        page.click("#speechToggle")
        check("음성 켜기", page.get_attribute("#speechToggle", "aria-pressed") == "true")

        # ── 오프라인(PWA 캐시) 확인
        page.wait_for_timeout(1200)
        sw_state = page.evaluate(
            "async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? (r.active ? 'active' : 'waiting') : 'none'; }"
        )
        check("서비스워커 등록", sw_state in ("active", "waiting"), sw_state)
        context.set_offline(True)
        try:
            page.reload()
            page.wait_for_timeout(800)
            offline_ok = page.evaluate("document.documentElement.dataset.ready") == "true"
        except Exception as exc:
            offline_ok = False
            page.wait_for_timeout(0)
        check("오프라인 재실행", offline_ok)
        context.set_offline(False)

        errors = [l for l in logs if l[0] in ("pageerror", "requestfailed", "error")]
        check("콘솔 에러 0건", len(errors) == 0, errors)

        browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    if failed:
        for name, _, detail in failed:
            print("FAILED:", name, detail)
        sys.exit(1)


if __name__ == "__main__":
    main()
