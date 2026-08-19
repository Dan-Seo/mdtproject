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
  OUT=$(printf '%s' "$PAYLOAD" | bash "$GUARD" 2>&1)
  GUARD_EXIT=$?

  # tdd-guard.sh는 설계상 항상 exit 0이다(허용이든 차단이든 결정은 stdout JSON으로만
  # 알린다) — 0이 아니면 가드가 판정을 낸 게 아니라 죽은 것이다. 이걸 걸러내지
  # 않으면 스폰 실패로 $OUT이 비었을 때 grep이 못 찾아 조용히 ALLOW로 읽힌다 —
  # 가드가 우려하는 "조용한 무력화"가 이 스펙 자신에도 그대로 생긴다.
  if [ "$GUARD_EXIT" -ne 0 ]; then
    printf '  FAIL ERROR (guard exited %s, expected 0) %s\n    path: %s\n    output: %s\n' \
      "$GUARD_EXIT" "$DESC" "$FILE_PATH" "$OUT"
    FAILED=1
    return
  fi

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

# .claude/ 인프라 면제가 .claude/worktrees/ 아래 저장소 체크아웃까지 삼키면,
# 워크트리에서 작업하는 동안 가드가 통째로 죽는다. 기본 저장소에서 돌릴 때도
# 잡히도록 경로를 직접 만들어 확인한다.
# `*test*`·`*spec*` 처럼 넓은 패턴은 이름에 test/spec이 들어간 평범한 모듈까지
# 면제해 가드에 구멍을 낸다. 진짜 테스트 파일만 면제되는지 본다.
echo "tdd-guard: 이름만 test/spec인 모듈"
check DENY  "$ROOT/src/lib/latest-rules.ts"  "이름에 test가 들어간 모듈은 면제 아님"
check DENY  "$ROOT/src/lib/spec-builder.ts"  "이름에 spec이 들어간 모듈은 면제 아님"
check DENY  "$ROOT/src/domain/contest.ts"    "test로 끝나는 이름도 면제 아님"

echo "tdd-guard: 워크트리 경로"
check DENY  "$ROOT/.claude/worktrees/wt/src/lib/brand-new-module.ts" \
  "워크트리 안 신규 모듈도 차단"
check ALLOW "$ROOT/.claude/hooks/some-hook.ts" \
  ".claude/ 인프라 자체는 여전히 면제"
check DENY  "$WIN_ROOT\\.claude\\worktrees\\wt\\src\\lib\\brand-new-module.ts" \
  "백슬래시 워크트리 경로도 차단"

if [ "$FAILED" -ne 0 ]; then
  echo "tdd-guard.spec: 실패"
  exit 1
fi

echo "tdd-guard.spec: 통과"
