#!/usr/bin/env bash
# 이번 push 에 LLM 리뷰를 돌릴 필요가 있는지 결정적으로 판정한다.
#
# 리뷰 1회가 $4~8 인데 브랜치당 4~10회 돈다(79회 실측). 그중 상당수는 리베이스거나
# CLAUDE.md·docs 만 고친 push 라 리뷰 대상 파일이 한 줄도 안 바뀐 회차다. 그걸
# 에이전트에게 물어보는 것 자체가 비싸므로 여기서 끊는다.
#
# 판정만 한다 — 게시는 .github/workflows/review.yml 의 scope 잡이 한다.
# review-verdict.sh 와 같은 역할 분리다.
#
# env   : PR        — PR 번호
#         HEAD_SHA  — 이번 커밋
#         REPO      — owner/name
#         TARGET    — review-scope.sh 가 낸 이번 PR 의 리뷰 대상 파일 수
#         BOT_LOGIN — 마커를 신뢰할 리뷰 작성자 (기본 github-actions[bot])
#         EXCLUDED  — 제외 파일 목록 경로 (기본 .review/excluded.txt)
#         BODY_OUT  — skip=true 일 때 게시할 본문을 쓸 경로 (기본 .review/skip-body.md)
# stdout: GITHUB_OUTPUT 형식 두 줄 — skip=true|false, reason=<한 줄>
#
# 생략은 확신이 있을 때만 한다. 직전 마커를 못 찾거나, 커밋 객체가 없거나, 대상이
# 한 줄이라도 바뀌었으면 전부 skip=false 로 수렴한다 — 애매하면 리뷰하는 쪽이다.
# 반대로 생략할 때는 **반드시 게이트 마커가 실린 본문**을 남긴다. 마커 없이 생략하면
# gate 가 "리뷰 안 돎" 보류로 굳어 PR 이 영원히 멈춘다.
#
# 검증: review-carryforward.spec.sh
set -euo pipefail

BOT_LOGIN="${BOT_LOGIN:-github-actions[bot]}"
EXCLUDED="${EXCLUDED:-.review/excluded.txt}"
BODY_OUT="${BODY_OUT:-.review/skip-body.md}"
# 지적 0건 마커에 "리뷰를 돌리지 않았다"를 함께 담는다. 이게 없으면 리뷰 결과 깨끗함과
# 구별되지 않아, 리뷰 대상 밖 파일(.claude/*·CLAUDE.md 등)만 고친 PR 이 아무 리뷰 없이
# 자동 머지된다 (PR #41 리뷰의 critical). review-verdict.sh 가 이 값을 보고 승인까지만 간다.
NIL_MARKER='<!-- review-code-gate: {"critical":0,"major":0,"minor":0,"nit":0,"failed_dimensions":0,"reviewed":false} -->'

emit() {
  printf 'skip=%s\nreason=%s\n' "$1" "$2"
  exit 0
}

# (1) 이 PR 에 리뷰 대상 파일이 아예 없다 — 문서·설정만 바뀐 PR.
# 예전에는 에이전트가 "리뷰할 변경 없음"을 보고하고 마커 없이 끝나 gate 가 굳었다.
if [ "${TARGET:-0}" -eq 0 ]; then
  excluded=$(paste -sd, - < "$EXCLUDED" 2>/dev/null || true)
  {
    printf '%s\n' '리뷰 대상 파일 0개 — 리뷰 에이전트를 실행하지 않았다.'
    printf '리뷰 제외: %s\n\n' "${excluded:-없음}"
    printf '%s\n' "$NIL_MARKER"
  } > "$BODY_OUT"
  emit true "리뷰 대상 파일 0개"
fi

# (2) 직전에 게이트 마커를 남긴 봇 리뷰 이후로 대상이 안 바뀌었다면 그 판정을 승계한다.
prev=$(gh api "repos/${REPO}/pulls/${PR}/reviews" --paginate \
  | jq -s --arg bot "$BOT_LOGIN" \
      'add // [] | map(select(.user.login == $bot and ((.body // "") | test("review-code-gate")))) | last // {}' \
  2>/dev/null || printf '{}')

PREV_SHA=$(printf '%s' "$prev" | jq -r '.commit_id // empty')
PREV_MARKER=$(printf '%s' "$prev" | jq -r '.body // ""' \
  | grep -o '<!-- review-code-gate: {[^}]*} -->' | tail -n1 || true)

[ -n "$PREV_SHA" ] || emit false "이 PR 에 승계할 이전 판정이 없다"
[ -n "$PREV_MARKER" ] || emit false "이전 리뷰에서 게이트 마커를 읽지 못했다"
[ "$PREV_SHA" != "$HEAD_SHA" ] || emit false "이미 이 커밋에 판정이 있다"
git cat-file -e "${PREV_SHA}^{commit}" 2>/dev/null || emit false "이전 판정 커밋 ${PREV_SHA} 을 찾을 수 없다"

# 두 점 diff 다 — main 을 머지해 들어온 코드 변경도 "바뀐 것"으로 잡아 승계를 막는다.
# 그 코드는 이미 main 에서 리뷰됐지만 이 브랜치와의 조합은 처음이므로 보수적으로 본다.
delta=$(git diff "$PREV_SHA" "$HEAD_SHA" | bash "$(dirname "$0")/review-scope.sh" .delta \
  | sed -n 's/^target=//p')
[ "${delta:-1}" -eq 0 ] || emit false "직전 판정 이후 리뷰 대상 ${delta}개가 바뀌었다"

changed=$(git diff --name-only "$PREV_SHA" "$HEAD_SHA" | paste -sd, - || true)
{
  printf '직전 리뷰(%s) 이후 리뷰 대상 파일이 바뀌지 않아 그 판정을 이 커밋으로 승계한다.\n' "$PREV_SHA"
  printf '변경분: %s — 전부 리뷰 대상 밖이다.\n\n' "${changed:-없음}"
  printf '%s\n' "$PREV_MARKER"
} > "$BODY_OUT"
emit true "대상 무변경 — ${PREV_SHA} 의 판정을 승계"
