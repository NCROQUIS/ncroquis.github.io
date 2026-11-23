#!/bin/bash
# 윷 그림(assets/yut/*.png)을 바꾼 뒤 더블클릭하면, 파일로 바로 연 게임 화면에도 새 그림이 보이게 사본을 다시 만들어요.
cd "$(dirname "$0")/.." || exit 1
python3 tools/update_yut_textures.py
echo "브라우저에서 게임 화면을 새로고침하면 바뀐 그림이 보여요."
read -p "엔터를 누르면 닫혀요"
