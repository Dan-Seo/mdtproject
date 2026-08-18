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
  mkdir -p "$TMP/repo/src/domain" "$TMP/repo/docs"
  cd "$TMP/repo" || exit 1
  git init -q .
  git config user.email t@t
  git config user.name t
  git config core.autocrlf false
  echo base > src/domain/a.ts
  echo base > docs/D.md
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
if grep -qF "$MARKER_CLEAN" "$TMP/repo/.review/skip-body.md"; then
  printf '  ok   대상 0개 본문에 0건 마커가 실린다\n'
else
  printf '  FAIL 대상 0개인데 마커가 없다 — gate 가 영원히 보류된다\n'
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

if [ "$FAILED" -ne 0 ]; then
  echo "review-carryforward.spec: 실패"
  exit 1
fi
echo "review-carryforward.spec: 통과"
