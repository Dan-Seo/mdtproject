#!/bin/bash
# Stop Verify Hook — 턴이 끝날 때 lint·build·test로 검증한다.
#
# Codex Stop 이벤트 계약:
#   - exit 0일 때 stdout은 JSON이어야 한다. plain text는 invalid로 처리된다.
#     따라서 npm 출력을 stdout으로 흘리면 안 된다 — 캡처해서 reason에 담는다.
#   - decision "block" + reason은 턴을 거부하는 게 아니라, reason을 새 프롬프트로 삼아
#     Codex가 이어서 작업하게 만든다. 검증 실패를 고치게 하는 용도로 맞다.
#   - 성공하면 아무것도 출력하지 않고 exit 0 한다.

INPUT=$(cat)

# 이미 Stop 훅이 한 번 이어붙인 턴이면 다시 이어붙이지 않는다 — 무한 루프 방지.
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
  exit 0
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# 프로젝트가 아직 스캐폴딩되지 않았으면(package.json 없음) 검증할 대상이 없다.
if [ ! -f "$ROOT/package.json" ]; then
  exit 0
fi

OUTPUT=$(cd "$ROOT" && npm run lint 2>&1 && npm run build 2>&1 && npm run test 2>&1)
STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  exit 0
fi

# 컨텍스트를 아끼려고 꼬리만 넘긴다. jq -n으로 만들어 따옴표·개행을 정확히 이스케이프한다.
TAIL=$(echo "$OUTPUT" | tail -40)
REASON="lint · build · test가 실패했습니다 (exit ${STATUS}). 아래 출력을 보고 원인을 고친 뒤 다시 실행하세요.

${TAIL}"

jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'

exit 0
