#!/bin/bash
# TDD Guard Hook — PreToolUse
# 구현 코드를 작성하려 할 때, 해당 모듈의 테스트 파일이 먼저 존재하는지 체크.
# 테스트 없이 구현 코드를 작성하려 하면 차단.
#
# Claude(.claude/settings.json)와 Codex(.codex/hooks.json) 양쪽에서 공유한다.
# 훅 출력 와이어 포맷(hookSpecificOutput.permissionDecision)은 두 도구가 동일하고,
# 편집 대상을 표현하는 입력만 다르다:
#   - Claude Edit|Write                     → tool_input.file_path (한 개, 절대경로)
#   - Codex apply_patch / shell(apply_patch) → 패치 본문의
#                                             '*** Add|Update File: <path>' 헤더 (여러 개, 상대경로)

INPUT=$(cat)

# --- 편집 대상 경로 추출 ---

FILE_PATHS=$(echo "$INPUT" | jq -r '
  if (.tool_input | type) == "object" then (.tool_input.file_path // empty) else empty end
' 2>/dev/null)

if [ -z "$FILE_PATHS" ]; then
  # Codex: apply_patch는 freeform 문자열, shell은 command 배열 안에 패치가 실려 온다.
  # tool_input 어디에 있든 문자열을 전부 모아 패치 헤더를 찾는다.
  # Delete File은 대상이 사라지므로 테스트를 요구하지 않는다 — Add/Update만 본다.
  FILE_PATHS=$(echo "$INPUT" | jq -r '[.tool_input | .. | strings] | join("\n")' 2>/dev/null \
    | tr -d '\r' \
    | sed -nE 's/^\*\*\* (Add|Update) File: (.+)$/\2/p')
fi

if [ -z "$FILE_PATHS" ]; then
  exit 0
fi

# 프로젝트가 아직 스캐폴딩되지 않았으면(package.json 없음) TDD 가드를 건너뛴다.
# 테스트 프레임워크가 깔리기 전(MVP 부트스트랩)에는 강제할 대상이 없기 때문.
# package.json이 생기면 이후 모든 lib/소스 편집에 TDD가 적용된다.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ ! -f "$ROOT/package.json" ]; then
  exit 0
fi

# --- 경로 한 개 판정: 0 = 테스트 없이 편집 불가(차단), 1 = 허용 ---

needs_test() {
  FILE_PATH="$1"

  # 테스트 파일 자체를 수정하는 건 허용
  case "$FILE_PATH" in
    *test*|*spec*|*.test.*|*.spec.*|*__tests__*)
      return 1
      ;;
  esac

  # .claude/·.codex/ 인프라(설정·훅·슬래시 커맨드)와 workflows/ 오케스트레이션 스크립트는 TDD 비대상 — 허용.
  # 이유: 워크플로우 스크립트는 런타임이 주입하는 전역(agent/pipeline/log)에 의존하는 오케스트레이션
  #       정의로, lib/services 비즈니스 로직이 아니며 유닛 테스트를 붙일 수 없다.
  case "$FILE_PATH" in
    .claude/*|*/.claude/*|.codex/*|*/.codex/*|workflows/*|*/workflows/*)
      return 1
      ;;
  esac

  # 설정/타입/스타일 파일은 테스트 불필요 — 허용
  case "$FILE_PATH" in
    *.json|*.css|*.scss|*.md|*.yml|*.yaml|*.env*|*.config.*|*tailwind*|*postcss*|*next.config*|*tsconfig*)
      return 1
      ;;
  esac

  # types/ 폴더는 테스트 불필요 — 허용
  case "$FILE_PATH" in
    types/*|*/types/*|*/types.ts|types.ts|*/types.d.ts|types.d.ts)
      return 1
      ;;
  esac

  # Next.js 프레임워크 파일은 허용 (layout, page, loading, error, not-found, global styles)
  case "$FILE_PATH" in
    */layout.tsx|*/layout.ts|*/page.tsx|*/page.ts|*/loading.tsx|*/error.tsx|*/not-found.tsx|*/globals.css)
      return 1
      ;;
  esac

  # lib/ 또는 소스 파일이면 테스트 파일 존재 여부 확인
  case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx) ;;
    *) return 1 ;;
  esac

  DIR=$(dirname "$FILE_PATH")
  BASENAME=$(basename "$FILE_PATH" | sed -E 's/\.(ts|tsx|js|jsx)$//')

  # 같은 폴더에 .test 파일
  for EXT in ts tsx js jsx; do
    if [ -f "${DIR}/${BASENAME}.test.${EXT}" ] || [ -f "${DIR}/${BASENAME}.spec.${EXT}" ]; then
      return 1
    fi
  done

  # __tests__ 폴더
  PARENT=$(dirname "$DIR")
  for EXT in ts tsx js jsx; do
    if [ -f "${PARENT}/__tests__/${BASENAME}.test.${EXT}" ] || [ -f "${DIR}/__tests__/${BASENAME}.test.${EXT}" ]; then
      return 1
    fi
  done

  # src/__tests__/ 루트 테스트 폴더
  for EXT in ts tsx js jsx; do
    if [ -f "${ROOT}/src/__tests__/${BASENAME}.test.${EXT}" ]; then
      return 1
    fi
  done

  return 0
}

# --- 추출된 경로를 전부 검사 (파이프 대신 here-doc — 서브셸에서 결과가 유실되지 않게) ---

MISSING=""
while IFS= read -r FILE_PATH; do
  [ -z "$FILE_PATH" ] && continue
  if needs_test "$FILE_PATH"; then
    NAME=$(basename "$FILE_PATH" | sed -E 's/\.(ts|tsx|js|jsx)$//')
    MISSING="${MISSING}${MISSING:+, }${NAME}"
  fi
done <<EOF
$FILE_PATHS
EOF

if [ -n "$MISSING" ]; then
  FIRST=${MISSING%%,*}
  cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "TDD GUARD: '${MISSING}'에 대한 테스트 파일이 존재하지 않습니다. 구현 코드를 작성하기 전에 테스트를 먼저 작성하세요. (테스트 파일 예: ${FIRST}.test.ts)"
  }
}
EOF
fi

exit 0
