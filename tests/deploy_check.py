#!/usr/bin/env python3
"""배포된 GitHub Pages URL 검증 (실제 https 주소 대상)

실행: python3 tests/deploy_check.py
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = "https://kimkyungse48-ui.github.io/stickman-calc/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "screenshots", "deploy")
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (" — " + str(detail) if detail else ""))


def tap(page, keys):
    for k in keys:
        page.click(f'[data-key="{k}"]')
        page.wait_for_timeout(60)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page = context.new_page()
        logs = []
        page.on("console", lambda m: logs.append((m.type, m.text)))
        page.on("pageerror", lambda e: logs.append(("pageerror", str(e))))
        page.on("requestfailed", lambda r: logs.append(("requestfailed", r.url)))
        page.on("response", lambda r: logs.append(("http>=400", f"{r.status} {r.url}")) if r.status >= 400 else None)

        resp = page.goto(BASE)
        page.wait_for_timeout(1200)
        check("index 200", resp is not None and resp.status == 200, resp.status if resp else "no response")
        check("앱 로드(dataset.ready)", page.evaluate("document.documentElement.dataset.ready") == "true")
        check("제목", page.title() == "스틱맨 계산기", page.title())

        # ── 계산: 5,623 + 98 = 5,721
        tap(page, ["5", "6", "2", "3"])
        check("입력 콤마", page.inner_text("#value") == "5,623", page.inner_text("#value"))
        tap(page, ["+", "9", "8"])
        check("수식 줄", page.inner_text("#expr").replace("\u00a0", "") == "5,623 +", repr(page.inner_text("#expr")))
        tap(page, ["="])
        page.wait_for_timeout(250)
        check("결과 5,721", page.inner_text("#value") == "5,721", page.inner_text("#value"))
        check("만세 모션", page.evaluate("document.getElementById('calc').classList.contains('is-cheer')"))
        page.screenshot(path=os.path.join(SHOTS, "deploy-normal.png"))
        page.wait_for_timeout(1200)

        # ── 무거운 숫자 → 낑낑
        tap(page, ["AC", "1", "2", "3", "4", "5", "6", "7"])
        page.wait_for_timeout(350)
        check("7자리 heavy", page.evaluate("document.getElementById('calc').classList.contains('is-heavy')"))
        check("heavy 말풍선", "낑" in page.inner_text("#bubbleText"), page.inner_text("#bubbleText"))

        # ── 아주 큰 수 → 깔려서 엉엉
        tap(page, ["×", "9", "9", "9", "="])
        page.wait_for_timeout(500)
        check("큰 수 결과", page.inner_text("#value") == "1,233,332,433", page.inner_text("#value"))
        check("crushed 상태", page.evaluate("document.getElementById('calc').classList.contains('is-crushed')"))
        page.screenshot(path=os.path.join(SHOTS, "deploy-heavy.png"))

        # ── 0으로 나누기
        tap(page, ["AC", "1", "2", "÷", "0", "="])
        page.wait_for_timeout(300)
        check("0 나누기 오류", page.inner_text("#value") == "오류", page.inner_text("#value"))

        # ── 절미 모드
        page.click("#modeToggle")
        page.wait_for_timeout(400)
        check("절미 모드", page.evaluate("document.getElementById('calc').dataset.mode") == "jeolmi")
        check(
            "절미 캐릭터 렌더",
            page.evaluate(
                "document.querySelectorAll('#crew .figure--jeolmi-a, #crew .figure--jeolmi-b').length"
            )
            == 2,
        )
        page.screenshot(path=os.path.join(SHOTS, "deploy-jeolmi.png"))
        page.click("#modeToggle")
        page.wait_for_timeout(200)

        # ── 음성 읽기
        check("음성 토글 버튼 있음", page.locator("#speechToggle").count() == 1, page.locator("#speechToggle").count())
        check("음성 토글 기본 켜짐", page.get_attribute("#speechToggle", "aria-pressed") == "true")
        check(
            "한국어 수 읽기",
            page.evaluate("window.__stickman.numberToKorean(123456)") == "십이만 삼천사백오십육",
            page.evaluate("window.__stickman.numberToKorean(123456)"),
        )
        page.evaluate("window.__stickman.speechLog.length = 0")
        tap(page, ["AC", "5", "6", "2", "3", "+", "9", "8", "="])
        page.wait_for_timeout(400)
        log = page.evaluate("window.__stickman.speechLog.slice()")
        check(
            "음성 읽기 로그",
            log == ["초기화", "오", "육", "이", "삼", "더하기", "구", "팔", "이꼴 오천칠백이십일"],
            log,
        )
        page.screenshot(path=os.path.join(SHOTS, "deploy-speech.png"))

        # ── 매니페스트 / 아이콘
        man = page.evaluate(
            "async () => { const r = await fetch('manifest.webmanifest'); const j = await r.json();"
            " const icons = j.icons.map(i => i.sizes + ':' + i.src);"
            " const st = await Promise.all(j.icons.map(async i => (await fetch(i.src)).status));"
            " return {status: r.status, name: j.name, display: j.display, start: j.start_url, scope: j.scope,"
            " id: j.id, icons, iconStatus: st}; }"
        )
        check("manifest 200", man["status"] == 200, man["status"])
        check("manifest start_url/scope", man["start"] == "./" and man["scope"] == "./", (man["start"], man["scope"]))
        check("manifest display standalone", man["display"] == "standalone", man["display"])
        check("아이콘 3종 200", all(s == 200 for s in man["iconStatus"]), (man["icons"], man["iconStatus"]))

        # ── 서비스워커 + 오프라인
        page.wait_for_timeout(1500)
        sw = page.evaluate(
            "async () => { const r = await navigator.serviceWorker.getRegistration();"
            " return r ? {scope: r.scope, active: !!r.active} : null; }"
        )
        check("서비스워커 등록", sw and sw["active"], sw)
        check("SW scope 가 서브패스", sw and sw["scope"].endswith("/stickman-calc/"), sw and sw["scope"])
        cached = page.evaluate("async () => (await caches.keys())")
        check("캐시 생성 (v6)", "stickman-calc-v6" in cached, cached)
        context.set_offline(True)
        offline_ok = False
        try:
            page.reload()
            page.wait_for_timeout(900)
            offline_ok = page.evaluate("document.documentElement.dataset.ready") == "true"
        except Exception:
            offline_ok = False
        check("오프라인 재실행", offline_ok)
        context.set_offline(False)
        page.reload()
        page.wait_for_timeout(500)

        errors = [l for l in logs if l[0] in ("pageerror", "requestfailed", "error", "http>=400")]
        check("콘솔/네트워크 에러 0건", len(errors) == 0, errors[:5])

        browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    if failed:
        for name, _, detail in failed:
            print("FAILED:", name, detail)
        sys.exit(1)


if __name__ == "__main__":
    main()
