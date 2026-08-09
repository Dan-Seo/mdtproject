#!/bin/bash
# Stop Verify Hook — 턴이 끝날 때 lint·typecheck·build·test로 검증한다.
#
# typecheck가 따로 필요한 이유: build는 테스트 파일을 타입체크하지 않고, eslint는
# 타입 인지 룰이 없으며, vitest는 esbuild 트랜스파일이라 타입을 보지 않는다. 셋 다
# 통과하는데 tsc는 실패하는 상태가 실제로 있었다. 규준 판정을 골든테스트에 맡기는
# 프로젝트에서 테스트 코드가 타입 검사 밖에 있으면 안 된다 (ADR-010).
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

# 스캐폴딩 도중에는 게이트를 걸지 않는다. 걸면 M0~M1 내내 매 턴이 막힌다.
#   - package.json이 아직 없다 → 검증 대상 자체가 없다
#   - package.json은 생겼지만 lint·build·test가 아직 다 정의되지 않았다
#     → `npm run`이 "Missing script"로 실패해 무의미한 차단이 된다
if [ ! -f "$ROOT/package.json" ]; then
  exit 0
fi

for SCRIPT in lint typecheck build test; do
  if [ -z "$(jq -r --arg s "$SCRIPT" '.scripts[$s] // empty' "$ROOT/package.json" 2>/dev/null)" ]; then
    exit 0
  fi
done

# next dev와 next build는 같은 .next를 쓴다. dev 서버를 켜둔 채 빌드하면
# webpack-runtime이 어긋나 "Cannot read properties of undefined (reading 'call')"로
# 프리렌더가 깨진다 — 코드와 무관한 실패라 원인 추적에 시간이 샌다. 미리 알려준다.
DEV_HINT=""
if command -v netstat >/dev/null 2>&1 &&
   netstat -ano 2>/dev/null | grep -qE 'LISTENING.*:(300[0-9]|30[1-9][0-9])\b'; then
  DEV_HINT="주의: dev 서버가 떠 있는 상태로 빌드했습니다. next dev와 next build는 .next를
공유하므로 프리렌더가 깨질 수 있습니다. 아래 실패가 프리렌더 오류라면 dev 서버를 내리고
다시 확인하세요.

"
fi

# 훅 자체의 회귀도 본다. tdd-guard는 조용히 무력화되는 실패 모드를 가진다.
GUARD_SPEC="$ROOT/scripts/hooks/tdd-guard.spec.sh"
GUARD_OUTPUT=""
GUARD_STATUS=0
if [ -f "$GUARD_SPEC" ]; then
  GUARD_OUTPUT=$(bash "$GUARD_SPEC" 2>&1)
  GUARD_STATUS=$?
fi

OUTPUT=$(cd "$ROOT" && npm run lint 2>&1 && npm run typecheck 2>&1 && npm run build 2>&1 && npm run test 2>&1)
STATUS=$?

if [ "$STATUS" -eq 0 ] && [ "$GUARD_STATUS" -ne 0 ]; then
  REASON="TDD 가드 훅이 자체 테스트에 실패했습니다. 가드가 무력화되면 아무 경고 없이
전부 통과하므로 먼저 고쳐야 합니다.

${GUARD_OUTPUT}"
  jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'
  exit 0
fi

if [ "$STATUS" -eq 0 ]; then
  exit 0
fi

# 컨텍스트를 아끼려고 꼬리만 넘긴다. jq -n으로 만들어 따옴표·개행을 정확히 이스케이프한다.
TAIL=$(echo "$OUTPUT" | tail -40)
REASON="${DEV_HINT}lint · typecheck · build · test가 실패했습니다 (exit ${STATUS}). 아래 출력을 보고 원인을 고친 뒤 다시 실행하세요.

${TAIL}"

jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'

exit 0
