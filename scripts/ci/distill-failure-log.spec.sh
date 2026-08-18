#!/bin/bash
# distill-failure-log.sh 자체 테스트.
#
# 실패 모드는 두 방향이다.
# 1) 덜 줄임 — 4000줄이 그대로 에이전트 첫 Read 에 꽂혀 60~100k 토큰이 날아간다.
# 2) 과하게 줄임 — 원인 줄이 잘려 나가 에이전트가 "로그에 없다"로 오진한다.
#    이쪽이 더 나쁘다. oncall 이 엉뚱한 수정 PR 을 올리는 경로다.
# 그래서 "잡음이 사라지는가"와 "오류 줄이 살아남는가"를 함께 본다.

D="$(dirname "$0")/distill-failure-log.sh"
FAILED=0

# gh run view --log-failed 형식: <job>\t<step>\t<ISO 타임스탬프> <내용>
line() { printf 'verify\tRun npm test\t2026-08-18T03:02:33.1234567Z %s\n' "$1"; }

echo "distill-failure-log.spec: 프리픽스·잡음 제거"

OUT=$(line 'src/domain/a.ts(12,5): error TS2345: 인자 형식이 안 맞는다' | bash "$D")
if printf '%s' "$OUT" | grep -q '^src/domain/a.ts(12,5): error TS2345'; then
  printf '  ok   job·step·타임스탬프 프리픽스를 뗀다\n'
else
  printf '  FAIL 프리픽스가 남았다: %s\n' "$(printf '%s' "$OUT" | tail -n1)"; FAILED=1
fi

OUT=$({ line 'npm warn deprecated foo@1.0.0'; line 'added 412 packages in 9s'; line 'error TS2345: 진짜 오류'; } | bash "$D")
if printf '%s' "$OUT" | grep -q 'npm warn\|added 412 packages'; then
  printf '  FAIL 설치 잡음이 남았다\n'; FAILED=1
elif printf '%s' "$OUT" | grep -q 'error TS2345: 진짜 오류'; then
  printf '  ok   설치 잡음은 버리고 오류는 남긴다\n'
else
  printf '  FAIL 오류 줄까지 사라졌다\n'; FAILED=1
fi

echo "distill-failure-log.spec: 대용량 축약"

# 앞쪽에 오류, 그 뒤로 무의미한 줄 3000개 — 축약해도 앞의 오류가 살아야 한다
BIG=$( { line 'src/domain/quantity/index.ts(155,3): error TS2554: 인자 개수가 맞지 않는다'
         for i in $(seq 1 3000); do line "무의미한 진행 출력 $i"; done
         line 'Process completed with exit code 1'; } )

OUT=$(printf '%s\n' "$BIG" | bash "$D")
IN_LINES=$(printf '%s\n' "$BIG" | wc -l | tr -d ' ')
OUT_LINES=$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')

if [ "$OUT_LINES" -lt "$IN_LINES" ] && [ "$OUT_LINES" -le 900 ]; then
  printf '  ok   %s줄 → %s줄로 줄인다\n' "$IN_LINES" "$OUT_LINES"
else
  printf '  FAIL 축약이 안 됐다: %s줄 → %s줄\n' "$IN_LINES" "$OUT_LINES"; FAILED=1
fi

if printf '%s' "$OUT" | grep -q 'error TS2554'; then
  printf '  ok   꼬리 밖으로 밀려난 앞쪽 오류 줄을 건져낸다\n'
else
  printf '  FAIL 앞쪽 오류가 잘려 나갔다 — 오진의 원인이 된다\n'; FAILED=1
fi

if printf '%s' "$OUT" | grep -q 'Process completed with exit code 1'; then
  printf '  ok   마지막 줄이 남는다\n'
else
  printf '  FAIL 로그 꼬리가 없다\n'; FAILED=1
fi

if printf '%s' "$OUT" | grep -q '중략'; then
  printf '  ok   잘라냈다는 사실을 본문에 밝힌다\n'
else
  printf '  FAIL 조용히 잘랐다 — 에이전트가 전문으로 오해한다\n'; FAILED=1
fi

echo "distill-failure-log.spec: 빈 입력"
# oncall.yml 은 산출물이 비었는지로 "실패 로그를 못 가져왔다"를 판정한다. 머리말만이라도
# 찍으면 그 폴백이 영원히 죽고, 에이전트는 "전문 0줄"을 사실로 읽는다 — PR #41 리뷰의 major.
OUT=$(printf '' | bash "$D")
if [ -z "$OUT" ]; then
  printf '  ok   빈 입력이면 아무것도 내지 않는다 (oncall 폴백이 산다)\n'
else
  printf '  FAIL 빈 입력인데 출력이 있다 — oncall 폴백이 죽는다: %s\n' "$OUT"; FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  echo "distill-failure-log.spec: 실패"
  exit 1
fi
echo "distill-failure-log.spec: 통과"
