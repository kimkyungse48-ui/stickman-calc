#!/usr/bin/env python3
"""계산 엔진 테스트를 브라우저에서 실행한다 (node가 없는 환경용)

tests/test.html 이 케이스를 돌려 window.__TEST_RESULTS__ 에 결과를 남긴다.
실행: python3 tests/run_cases.py
"""
import functools
import http.server
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd.server_address[1]


def main():
    port = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{port}/tests/test.html")
        page.wait_for_function("() => window.__TEST_RESULTS__", timeout=20000)
        rows = page.evaluate(
            "() => [...document.querySelectorAll('#list li')].map(el => ({ok: el.classList.contains('ok'), text: el.innerText}))"
        )
        browser.close()

    for row in rows:
        print(("PASS  " if row["ok"] else "FAIL  ") + row["text"].replace("\n", " ").strip())
    passed = sum(1 for r in rows if r["ok"])
    total = len(rows)
    print(f"\n{passed}/{total} 통과")
    if errors:
        print("페이지 오류:", errors)
    if passed != total or errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
