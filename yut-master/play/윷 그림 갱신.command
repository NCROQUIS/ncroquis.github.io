#!/bin/bash
# 윷 그림을 고친 뒤 두 번 눌러 실행: 파일로 바로 연 화면에서도 새 윷 그림이 보이게 해요
cd "$(dirname "$0")" && python3 tools/make_yut_tex.py
echo; read -n 1 -s -r -p "아무 키나 누르면 닫혀요"
