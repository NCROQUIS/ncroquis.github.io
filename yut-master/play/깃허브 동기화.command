#!/bin/bash
# 윷놀이 마스터: 이 파일이 들어 있는 폴더(레포)를 GitHub(NCROQUIS/yut-master)와 맞춰요.
# 폴더를 어디로 옮기거나 이름을 바꿔도(예: 바탕화면/Yut) 그대로 쓸 수 있어요. 더블클릭하면 터미널이 열려요.
# 1) GitHub 최신 내용을 받고(git pull --rebase)  2) 내 PC에서 만든 커밋이 있으면 올려요(git push)
cd "$(dirname "$0")" || exit 1
if [ ! -d .git ]; then
  echo "✗ 이 폴더에 git 기록(.git)이 없어요. 숨김 폴더 .git까지 함께 복사됐는지 확인해 주세요."
  read -p "엔터를 누르면 닫혀요"; exit 1
fi
echo "▶ 폴더: $(pwd)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "▶ 커밋하지 않은 수정이 있어요. 잠시 치워 두고 받을게요(끝나면 되돌려요)."
  git stash push -q -m "sync-auto" && STASHED=1
fi
echo "▶ 최신 내용 받는 중..."
if git pull --rebase origin main; then echo "✓ 최신 내용을 받았어요"; else echo "✗ 받지 못했어요. 위 메시지를 확인해 주세요."; fi
if [ -n "$(git log origin/main..HEAD --oneline 2>/dev/null)" ]; then
  echo "▶ 내 PC에서 만든 커밋을 GitHub에 올리는 중..."
  git push origin HEAD:main && echo "✓ 올렸어요! https://github.com/NCROQUIS/yut-master" || echo "✗ 올리지 못했어요. 위 오류 메시지를 확인해 주세요."
else
  echo "✓ 올릴 커밋이 없어요"
fi
[ -n "$STASHED" ] && { git stash pop -q && echo "✓ 치워 둔 수정을 되돌렸어요" || echo "✗ 치워 둔 수정을 되돌리다 겹쳤어요. git stash list로 확인해 주세요."; }
git log --oneline -3
read -p "엔터를 누르면 닫혀요"
