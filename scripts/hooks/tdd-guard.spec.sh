#!/bin/bash
# tdd-guard.sh 자체 테스트.
#
# 이 가드의 실패 모드는 "조용한 무력화"다 — 경로 패턴이 어긋나면 아무 소리 없이
# 전부 통과시키고, 그 사실을 아무도 모른다. 실제로 Windows 백슬래시 경로가
# 슬래시 기준 case 패턴에 안 걸려 프레임워크 파일 면제가 통째로 죽어 있었다.
# 그래서 "차단해야 할 것을 차단하는가"와 "면제해야 할 것을 면제하는가"를 함께 본다.

GUARD="$(dirname "$0")/tdd-guard.sh"
FAILED=0

# 실제 존재하는 경로를 써야 한다 — 가드가 짝 테스트 파일의 존재를 파일시스템에서 확인한다.
check() {
  EXPECTED="$1"
  FILE_PATH="$2"
  DESC="$3"

  PAYLOAD=$(jq -n --arg p "$FILE_PATH" '{tool_input: {file_path: $p}}')
  OUT=$(printf '%s' "$PAYLOAD" | bash "$GUARD")

  if echo "$OUT" | grep -q '"deny"'; then
    ACTUAL="DENY"
  else
    ACTUAL="ALLOW"
  fi

  if [ "$ACTUAL" = "$EXPECTED" ]; then
    printf '  ok   %-5s %s\n' "$ACTUAL" "$DESC"
  else
    printf '  FAIL %-5s (expected %s) %s\n    path: %s\n' \
      "$ACTUAL" "$EXPECTED" "$DESC" "$FILE_PATH"
    FAILED=1
  fi
}

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
WIN_ROOT=$(printf '%s' "$ROOT" | sed 's|^/\([a-z]\)/|\1:/|' | tr '/' '\\')

echo "tdd-guard: POSIX 경로"
check DENY  "$ROOT/src/lib/brand-new-module.ts"  "테스트 없는 신규 모듈은 차단"
check ALLOW "$ROOT/src/lib/store.ts"             "짝 테스트가 있으면 허용"
check ALLOW "$ROOT/src/lib/store.test.ts"        "테스트 파일 자체는 허용"
check ALLOW "$ROOT/src/app/layout.tsx"           "Next.js 프레임워크 파일은 면제"
check ALLOW "$ROOT/src/app/page.tsx"             "page.tsx는 면제"
check ALLOW "$ROOT/src/domain/rules/types.ts"    "타입 전용 파일은 면제"
check ALLOW "$ROOT/src/locales/ko.json"          "설정·데이터 파일은 면제"
check ALLOW "$ROOT/tests/e2e/uc1-initial-load.js" "tests/ 아래는 면제"

# Claude(Windows)가 넘기는 형태. 정규화가 빠지면 아래 면제가 전부 DENY로 뒤집힌다.
echo "tdd-guard: Windows 백슬래시 경로"
check DENY  "$WIN_ROOT\\src\\lib\\brand-new-module.ts" "테스트 없는 신규 모듈은 차단"
check ALLOW "$WIN_ROOT\\src\\lib\\store.ts"            "짝 테스트가 있으면 허용"
check ALLOW "$WIN_ROOT\\src\\app\\layout.tsx"          "Next.js 프레임워크 파일은 면제"
# page.tsx는 짝 테스트가 없다 — 면제가 유일한 통과 근거라 정규화 회귀를 정확히 잡는다.
# (layout.tsx는 layout.test.tsx가 생겨서 더는 면제에만 의존하지 않는다.)
check ALLOW "$WIN_ROOT\\src\\app\\page.tsx"            "page.tsx는 면제 — 정규화 회귀 탐지용"
check ALLOW "$WIN_ROOT\\src\\domain\\rules\\types.ts"  "타입 전용 파일은 면제"

if [ "$FAILED" -ne 0 ]; then
  echo "tdd-guard.spec: 실패"
  exit 1
fi

echo "tdd-guard.spec: 통과"
