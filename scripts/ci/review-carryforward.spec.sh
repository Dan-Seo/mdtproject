#!/bin/bash
# review-carryforward.sh 자체 테스트.
#
# 이 스크립트의 실패 모드는 두 방향이고, 한쪽이 훨씬 위험하다.
# 1) 과하게 생략 — 코드가 바뀌었는데 리뷰를 건너뛰고 직전 승인 마커를 새 커밋에 붙인다.
#    자동 머지 게이트가 그 마커를 읽으므로 **무리뷰 머지**가 된다. 절대 일어나면 안 된다.
# 2) 덜 생략 — 리뷰할 게 없는데 에이전트를 띄운다. $4~8 이 낭비될 뿐 안전은 안 깨진다.
# 그래서 애매한 입력은 전부 skip=false 로 수렴하는지를 중점적으로 본다.
#
# gh 는 스텁으로 갈음하고 git 은 진짜 임시 저장소를 만들어 쓴다 — 승계 판정의 핵심이
# `git diff <직전> <현재>` 라서 가짜로 대신하면 정작 봐야 할 것을 안 보게 된다.

SPEC_DIR="$(cd "$(dirname "$0")" && pwd)"
CF="$SPEC_DIR/review-carryforward.sh"
FAILED=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

NL=$'\n'
MARKER_CLEAN='<!-- review-code-gate: {"critical":0,"major":0,"minor":0,"nit":0,"failed_dimensions":0} -->'
# 리뷰를 아예 하지 않은 경우의 마커. 지적 0건이지만 "reviewed":false 라서 verdict 가
# 머지까지 가지 않는다 — 이게 없으면 대상 0개 PR 이 무리뷰 자동 머지된다.
MARKER_NOREVIEW='<!-- review-code-gate: {"critical":0,"major":0,"minor":0,"nit":0,"failed_dimensions":0,"reviewed":false} -->'
MARKER_MINOR='<!-- review-code-gate: {"critical":0,"major":0,"minor":2,"nit":1,"failed_dimensions":0} -->'
BOT='github-actions[bot]'

# gh 스텁: 픽스처 파일을 그대로 돌려준다
mkdir -p "$TMP/bin"
printf '#!/bin/bash\ncat "$GH_STUB_REVIEWS"\n' > "$TMP/bin/gh"
chmod +x "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH"

# 커밋 두 개짜리 임시 저장소. $1 = 두 번째 커밋에서 바꿀 파일
make_repo() {
  rm -rf "$TMP/repo"
  mkdir -p "$TMP/repo/src/domain" "$TMP/repo/docs" "$TMP/repo/.claude/workflows" "$TMP/repo/.claude/skills/s"
  cd "$TMP/repo" || exit 1
  git init -q .
  git config user.email t@t
  git config user.name t
  git config core.autocrlf false
  echo base > src/domain/a.ts
  echo base > docs/D.md
  # 리뷰 대상 밖이지만 실행되는 것들 — 승계 판정의 기준선이 "리뷰 대상"이 아니라
  # "실행되는가" 임을 여기서 못 박는다
  echo base > .claude/workflows/g.js
  echo base > package-lock.json
  # 문서처럼 보이지만 에이전트가 읽고 따르는 지시문이다
  echo base > .claude/skills/s/SKILL.md
  echo base > CLAUDE.md
  git add -A; git commit -qm base
  BASE_SHA=$(git rev-parse HEAD)
  echo changed >> "$1"
  git add -A; git commit -qm next
  HEAD_SHA=$(git rev-parse HEAD)
}

# 리뷰 목록 픽스처. 마커에 따옴표가 들어 있어 문자열 보간으로 만들면 깨진 JSON 이 되고,
# 스크립트는 그걸 "이전 판정 없음"으로 읽어 **모든 케이스가 skip=false 로 통과해 버린다** —
# 위험한 쪽 검사가 통째로 무력화되므로 반드시 jq 로 만든다.
# 인자 없으면 리뷰 0건. $1=login $2=commit_id $3=body
reviews() {
  if [ $# -eq 0 ]; then printf '[]' > "$TMP/reviews.json"; return; fi
  jq -n --arg login "$1" --arg sha "$2" --arg body "$3" '[{user: {login: $login}, commit_id: $sha, body: $body}]' > "$TMP/reviews.json"
  jq -e . "$TMP/reviews.json" > /dev/null || { echo "  FATAL 픽스처 JSON 이 깨졌다"; exit 1; }
}

# $1=설명 $2=기대 skip
run_case() {
  DESC="$1"; EXPECT="$2"
  mkdir -p "$TMP/repo/.review"
  : > "$TMP/repo/.review/excluded.txt"
  rm -f "$TMP/repo/.review/skip-body.md"
  OUT=$(GH_STUB_REVIEWS="$TMP/reviews.json" REPO=o/r PR=1 \
        HEAD_SHA="$HEAD_SHA" TARGET="${TARGET:-3}" \
        BODY_OUT="$TMP/repo/.review/skip-body.md" bash "$CF" 2>&1)
  GOT=$(printf '%s' "$OUT" | sed -n 's/^skip=//p')
  if [ "$GOT" != "$EXPECT" ]; then
    printf '  FAIL %s — skip=%s 여야 하는데 %s\n    %s\n' "$DESC" "$EXPECT" "${GOT:-?}" "$(printf '%s' "$OUT" | tr '\n' ' ')"
    FAILED=1
    return 1
  fi
  printf '  ok   skip=%-5s %s\n' "$EXPECT" "$DESC"
  return 0
}

echo "review-carryforward.spec: 생략해야 하는 경우"

make_repo docs/D.md
reviews "$BOT" "$BASE_SHA" "판정${NL}${MARKER_MINOR}"
if run_case "직전 판정 이후 docs 만 바뀜 → 승계" true; then
  # 승계 마커는 **직전 것 그대로**여야 한다. 깨끗한 마커로 바꿔치면 minor 2건이 사라져
  # 사람이 머지해야 할 PR 이 자동 머지로 넘어간다.
  if grep -qF "$MARKER_MINOR" "$TMP/repo/.review/skip-body.md"; then
    printf '  ok   본문에 직전 마커가 그대로 실린다 (minor 2 유지)\n'
  else
    printf '  FAIL 승계 본문의 마커가 직전 것이 아니다: %s\n' "$(cat "$TMP/repo/.review/skip-body.md")"
    FAILED=1
  fi
fi

make_repo docs/D.md
reviews
TARGET=0 run_case "리뷰 대상 0개 → 에이전트 생략" true
if grep -qF "$MARKER_NOREVIEW" "$TMP/repo/.review/skip-body.md"; then
  printf '  ok   대상 0개 본문에 리뷰 안 함 마커(reviewed:false)가 실린다\n'
else
  printf '  FAIL 대상 0개 마커가 reviewed:false 가 아니다 — 무리뷰 자동 머지가 열린다\n'
  FAILED=1
fi

echo "review-carryforward.spec: 생략하면 안 되는 경우"

make_repo src/domain/a.ts
reviews "$BOT" "$BASE_SHA" "판정${NL}${MARKER_CLEAN}"
run_case "직전 판정 이후 src 가 바뀜 → 반드시 리뷰" false

make_repo docs/D.md
reviews
run_case "이전 판정 자체가 없음 → 리뷰" false

make_repo docs/D.md
reviews "$BOT" "$BASE_SHA" "마커 없는 리뷰 본문"
run_case "이전 리뷰에 게이트 마커가 없음 → 리뷰" false

make_repo docs/D.md
reviews "randomuser" "$BASE_SHA" "판정${NL}${MARKER_CLEAN}"
run_case "봇이 아닌 사람이 남긴 마커 → 신뢰하지 않는다" false

make_repo docs/D.md
reviews "$BOT" "0000000000000000000000000000000000000000" "판정${NL}${MARKER_CLEAN}"
run_case "직전 판정 커밋이 저장소에 없음 → 리뷰" false

make_repo docs/D.md
reviews "$BOT" "$HEAD_SHA" "판정${NL}${MARKER_CLEAN}"
run_case "이미 이 커밋에 판정이 있음 → 승계 대상 아님" false

# 리뷰 대상 밖이라는 이유로 승계하면, 게이트 마커를 만드는 워크플로 JS 를 고친 push 가
# 이전 clean 판정을 물려받아 무리뷰로 자동 머지된다 (PR #41 2차 리뷰의 major).
make_repo .claude/workflows/g.js
reviews "$BOT" "$BASE_SHA" "판정${NL}${MARKER_CLEAN}"
run_case ".claude/** 가 바뀜 → 실행되는 코드라 승계 금지" false

make_repo package-lock.json
reviews "$BOT" "$BASE_SHA" "판정${NL}${MARKER_CLEAN}"
run_case "package-lock.json 이 바뀜 → 의존성이 달라져 승계 금지" false

# 에이전트 지시문은 확장자만 보면 문서지만 실행된다 — 스킬·훅 지시가 바뀌면 다음 리뷰의
# 판단 자체가 달라진다 (PR #41 3차 리뷰의 major).
make_repo .claude/skills/s/SKILL.md
reviews "$BOT" "$BASE_SHA" "판정${NL}${MARKER_CLEAN}"
run_case ".claude/**/*.md 가 바뀜 → 지시문이라 승계 금지" false

make_repo CLAUDE.md
reviews "$BOT" "$BASE_SHA" "판정${NL}${MARKER_CLEAN}"
run_case "CLAUDE.md 가 바뀜 → 지시문이라 승계 금지" false

if [ "$FAILED" -ne 0 ]; then
  echo "review-carryforward.spec: 실패"
  exit 1
fi
echo "review-carryforward.spec: 통과"
