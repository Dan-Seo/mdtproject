#!/bin/bash
# review-verdict.sh 판정 계약 테스트 (CI 용).
#
# 판정 로직은 scripts/test_review_verdict.py 가 21 케이스로 덮지만, 그 pytest 를 도는
# 워크플로가 없다 — 자동 승인·머지를 좌우하는 코드가 CI 에서 한 번도 검증되지 않았다
# (PR #41 2차 리뷰의 major). 여기서는 bash 와 jq 만 써서 npm run test:ci-scripts 에
# 그대로 실리게 하고, 게이트 계약의 뼈대만 본다. 세부 실패 모드는 계속 pytest 담당이다.

V="$(dirname "$0")/review-verdict.sh"
FAILED=0
SHA=abc1234def5678
BOT='github-actions[bot]'

# $1..$5 = critical major minor nit failed, $6 = 추가 필드(예: ,"reviewed":false)
marker() {
  printf '<!-- review-code-gate: {"critical":%s,"major":%s,"minor":%s,"nit":%s,"failed_dimensions":%s%s} -->' \
    "$1" "$2" "$3" "$4" "$5" "$6"
}

# $1 = 설명, $2 = 기대 decision, $3 = 리뷰 본문
expect() {
  body=$3
  got=$(jq -n --arg sha "$SHA" --arg bot "$BOT" --arg body "$body" \
          '[{commit_id: $sha, body: $body, user: {login: $bot}}]' \
        | HEAD_SHA="$SHA" bash "$V" | sed -n 's/^decision=//p')
  if [ "$got" != "$2" ]; then
    printf '  FAIL %s — %s 여야 하는데 %s\n' "$1" "$2" "${got:-?}"; FAILED=1
  else
    printf '  ok   %-8s %s\n' "$2" "$1"
  fi
}

echo "review-verdict.spec: 심각도 사다리"
expect "지적 0건"              merge   "$(marker 0 0 0 0 0 '')"
expect "nit 만"                merge   "$(marker 0 0 0 3 0 '')"
expect "minor 가 있음"         approve "$(marker 0 0 1 0 0 '')"
expect "major 가 있음"         hold    "$(marker 0 1 0 0 0 '')"
expect "critical 이 있음"      hold    "$(marker 1 0 0 0 0 '')"
expect "차원 실패"             hold    "$(marker 0 0 0 0 1 '')"

echo "review-verdict.spec: 리뷰를 돌리지 않은 마커"
# 리뷰 대상 0개면 review-carryforward.sh 가 지적 0건 마커를 게시한다. 그것이 「리뷰 결과
# 깨끗함」과 같은 판정을 받으면, 리뷰 대상 밖 파일만 고친 PR 이 무리뷰로 자동 머지된다.
expect "reviewed:false"        approve "$(marker 0 0 0 0 0 ',"reviewed":false')"
expect "reviewed:true"         merge   "$(marker 0 0 0 0 0 ',"reviewed":true')"

echo "review-verdict.spec: 마커가 없거나 깨짐"
expect "마커 없는 본문"        hold    "리뷰는 했는데 마커가 없다"
expect "필드가 빠진 마커"      hold    '<!-- review-code-gate: {"critical":0} -->'

if [ "$FAILED" -ne 0 ]; then
  echo "review-verdict.spec: 실패"
  exit 1
fi
echo "review-verdict.spec: 통과"
