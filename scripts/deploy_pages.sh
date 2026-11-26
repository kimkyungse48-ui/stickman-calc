#!/usr/bin/env bash
# 스틱맨 계산기 → GitHub Pages 배포
#   GitHub Pages가 이 저장소의 gh-pages 브랜치 루트를 배포 소스로 쓰고 있어서,
#   main 브랜치 내용을 그대로 gh-pages로 밀어 넣으면 1~2분 뒤 사이트가 새로 빌드됩니다.
set -euo pipefail
cd "$(dirname "$0")/.."

git push origin main
git push --force origin main:gh-pages

echo "✅ gh-pages 갱신 완료 → https://kimkyungse48-ui.github.io/stickman-calc/"
echo "   (GitHub Pages 빌드에 1~2분 걸립니다. 폰에서 옛 화면이 보이면 새로고침 두 번)"
