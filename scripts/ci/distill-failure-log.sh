#!/usr/bin/env bash
# CI 실패 로그를 에이전트가 읽을 크기로 줄인다.
#
# oncall.yml 은 `gh run view --log-failed` 의 꼬리 4000줄을 그대로 넘겼다. 그 로그는
# 줄마다 `<job>\t<step>\t2026-08-18T03:02:33.1234567Z ` 프리픽스가 붙어 있어 내용과
# 무관한 문자가 30~40% 를 차지하고, 4000줄이면 첫 Read 한 번에 60~100k 토큰이 꽂힌다.
# 원인 파악에 실제로 쓰이는 것은 실패한 명령과 그 오류 줄이다.
#
# 그래서 (1) 프리픽스를 떼고 (2) 진행률·설치 잡음을 버리고 (3) 오류 시그니처 줄과
# 로그 꼬리만 남긴다. 잘라낸 사실은 본문에 명시한다 — 조용히 자르면 에이전트가
# "로그에 없으니 없는 일"로 오진한다.
#
# stdin : gh run view --log-failed 의 출력
# env   : KEEP_TAIL   꼬리 보존 줄 수 (기본 600)
#         KEEP_SIGNAL 앞쪽에서 건져낼 오류 줄 최대 수 (기본 200)
# stdout: 축약된 로그
#
# 검증: distill-failure-log.spec.sh
set -euo pipefail

KEEP_TAIL="${KEEP_TAIL:-600}"
KEEP_SIGNAL="${KEEP_SIGNAL:-200}"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# grep -v 는 남는 줄이 없으면 exit 1 이라 pipefail 과 함께면 빈 로그에서 스크립트가 죽는다.
# 실패 로그를 못 받아온 경우가 바로 그 입력이므로 이 파이프에서만 끈다.
set +o pipefail

# (1) 프리픽스 제거 + (2) 잡음 제거.
# 탭으로 구분된 job/step 필드와 그 뒤의 ISO 타임스탬프를 뗀다. gh 는 형식을 조금씩
# 바꿔 왔으므로 타임스탬프는 탭 유무와 무관하게 줄 앞에서 한 번 더 지운다.
sed -e 's/^[^\t]*\t[^\t]*\t//' \
    -e 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}T[0-9:.]*Z //' \
  | grep -v -e '^##\[group\]' -e '^##\[endgroup\]' \
             -e '^npm warn ' -e '^npm notice' \
             -e '^added [0-9]* packages' -e '^[0-9]* packages are looking for funding' \
             -e '^Downloading ' -e '^Extracting ' \
             -e '^[[:space:]]*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏][[:space:]]' \
  | cat -s > "$TMP/clean.log"
set -o pipefail

TOTAL=$(wc -l < "$TMP/clean.log" | tr -d ' ')

if [ "$TOTAL" -le "$((KEEP_TAIL + KEEP_SIGNAL))" ]; then
  printf '(실패 로그 전문 — %s줄, 타임스탬프·설치 잡음 제거)\n\n' "$TOTAL"
  cat "$TMP/clean.log"
  exit 0
fi

HEAD_END=$((TOTAL - KEEP_TAIL))

# 꼬리 밖에 있는 오류 시그니처 줄을 원래 순서대로 건져낸다 —
# tsc 오류가 앞에서 나고 뒤가 다른 잡의 출력으로 채워지는 경우를 놓치지 않기 위해서다.
awk -v end="$HEAD_END" 'NR <= end' "$TMP/clean.log" \
  | grep -n -E 'error TS[0-9]+|npm error|ERR!|^Error:|[[:space:]]Error:|AssertionError|FAIL |✗|×|✘|Expected:|Received:|error  |exit code [1-9]' \
  | head -n "$KEEP_SIGNAL" \
  | sed 's/^[0-9]*://' > "$TMP/signal.log" || true

SIGNAL=$(wc -l < "$TMP/signal.log" | tr -d ' ')

printf '(실패 로그 축약 — 정리 후 %s줄 중 오류 %s줄 + 꼬리 %s줄. 전문은 런 페이지에서 볼 것)\n\n' \
  "$TOTAL" "$SIGNAL" "$KEEP_TAIL"

if [ "$SIGNAL" -gt 0 ]; then
  printf -- '--- 앞부분에서 건져낸 오류 줄 ---\n'
  cat "$TMP/signal.log"
  printf -- '\n--- (중략 %s줄) ---\n\n' "$((HEAD_END - SIGNAL))"
fi

printf -- '--- 마지막 %s줄 ---\n' "$KEEP_TAIL"
tail -n "$KEEP_TAIL" "$TMP/clean.log"
