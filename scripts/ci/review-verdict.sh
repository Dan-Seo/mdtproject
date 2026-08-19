#!/usr/bin/env bash
# /review-code 가 PR 리뷰 본문에 남긴 게이트 마커를 읽어 승인·머지 여부를 판정한다.
# 판정만 한다 — 실제 승인·머지는 .github/workflows/review.yml 의 gate 잡이 수행한다.
#
# stdin : gh api repos/{owner}/{repo}/pulls/{n}/reviews 의 JSON 배열
# env   : HEAD_SHA — 판정 대상 커밋. 이 커밋에 달린 리뷰만 인정한다
#         BOT_LOGIN — 마커를 신뢰할 리뷰 작성자 (기본 github-actions[bot])
# stdout: GITHUB_OUTPUT 형식 두 줄 — decision=merge|approve|hold, reason=<한 줄>
#
# 마커의 reviewed 가 false 면 "리뷰를 돌리지 않았다"는 뜻이라 지적 0건이어도 머지하지 않는다.
#
# 판정 근거가 조금이라도 불확실하면 hold 다 — 이 스크립트는 fail-closed.
# 리뷰 실패·마커 누락·커밋 불일치·작성자 불일치는 전부 "승인·머지 안 함"으로 수렴한다.
set -euo pipefail

emit() {
  printf 'decision=%s\nreason=%s\n' "$1" "$2"
  exit 0
}

# head 커밋에 달린 봇 리뷰의 마커만 모으고 마지막 것을 쓴다 (재실행 시 최신 판정 우선).
marker=$(jq -r \
  --arg sha "${HEAD_SHA:-}" \
  --arg bot "${BOT_LOGIN:-github-actions[bot]}" '
  [ .[]
    | select(.commit_id == $sha)
    | select(.user.login == $bot)
    | (.body // "")
    | scan("<!-- review-code-gate: (\\{[^}]*\\}) -->")
    | .[0]
  ] | last // ""
' 2>/dev/null || true)

if [ -z "$marker" ]; then
  emit hold "게이트 마커 없음 — 이 커밋(${HEAD_SHA:-미지정})에 대한 /review-code 리뷰가 게시되지 않았다"
fi

# 5개 필드가 전부 숫자일 때만 값을 뽑는다. 하나라도 빠지거나 타입이 다르면 빈 문자열.
counts=$(printf '%s' "$marker" | jq -r '
  if ([.critical, .major, .minor, .nit, .failed_dimensions]
      | map(type == "number") | all)
  then "\(.critical|floor) \(.major|floor) \(.minor|floor) \(.nit|floor) \(.failed_dimensions|floor)"
  else empty end
' 2>/dev/null || true)

if [ -z "$counts" ]; then
  emit hold "게이트 마커 해석 실패 — 심각도 집계를 읽을 수 없다: ${marker}"
fi

# shellcheck disable=SC2086 # 숫자 5개로 검증된 문자열만 분해한다
set -- $counts
critical=$1 major=$2 minor=$3 nit=$4 failed=$5
tally="🔴 ${critical} · 🟠 ${major} · 🟡 ${minor} · ⚪ ${nit}"

# "리뷰를 실제로 돌렸는가". 필드가 없으면 참으로 본다 — 기존 마커와 호환된다.
reviewed=$(printf '%s' "$marker" | jq -r 'if .reviewed == false then "false" else "true" end' 2>/dev/null || printf 'true')

if [ "$failed" -gt 0 ]; then
  emit hold "${tally} — 리뷰 차원 ${failed}개 실패로 판정이 불완전하다"
fi

if [ "$critical" -gt 0 ] || [ "$major" -gt 0 ]; then
  emit hold "${tally} — critical·major가 있어 승인·머지를 모두 금지한다"
fi

# 리뷰 대상이 0개라 에이전트를 띄우지 않은 경우다 (review-carryforward.sh). 지적이 없는 것과
# 리뷰를 안 한 것은 다르다 — 후자를 머지까지 태우면 리뷰 대상 밖 파일만 고친 PR 이
# 무리뷰로 main 에 들어간다. 게이트가 굳지 않게 승인은 하되 머지는 사람에게 남긴다.
if [ "$reviewed" = "false" ]; then
  emit approve "${tally} — 리뷰 대상이 없어 리뷰를 돌리지 않았다. 머지는 사람이 판단한다"
fi

if [ "$minor" -gt 0 ]; then
  emit approve "${tally} — minor 이하만 있어 승인한다. 머지는 사람이 판단한다"
fi

emit merge "${tally} — nit 이하만 있어 승인 후 머지한다"
