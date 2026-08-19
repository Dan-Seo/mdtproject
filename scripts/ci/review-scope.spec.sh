#!/bin/bash
# review-scope.sh 자체 테스트.
#
# 이 스크립트의 실패 모드는 두 방향이다.
# 1) 덜 거름 — 제외 대상(docs·package-lock·자산)이 scope.diff 에 남아 서브에이전트
#    3개의 컨텍스트에 각각 실린다. 토큰이 조용히 샌다.
# 2) 과하게 거름 — 리뷰해야 할 파일이 대상에서 빠지고도 "깨끗함"으로 보고된다.
#    이쪽이 훨씬 위험하다 — 무리뷰가 초록불로 위장된다 (PR #12 재현).
# 그래서 "빼야 할 것을 빼는가"와 "남겨야 할 것을 남기는가"를 함께 본다.

SCOPE="$(dirname "$0")/review-scope.sh"
TMP=$(mktemp -d)
FAILED=0
trap 'rm -rf "$TMP"' EXIT

# 한 파일짜리 diff 구획을 만든다
hunk() {
  printf 'diff --git a/%s b/%s\nindex 1111111..2222222 100644\n--- a/%s\n+++ b/%s\n@@ -1 +1 @@\n-old\n+new\n' "$1" "$1" "$1" "$1"
}

run() { printf '%s' "$1" | bash "$SCOPE" "$TMP/out" > "$TMP/stdout"; }

# 대상 목록에 있고 scope.diff 에도 남는지
kept() {
  run "$(hunk "$1")"
  if ! grep -qxF "$1" "$TMP/out/files.txt"; then
    printf '  FAIL 누락    %s (files.txt 에 없음)\n' "$1"; FAILED=1
  elif ! grep -qF "b/$1" "$TMP/out/scope.diff"; then
    printf '  FAIL 누락    %s (scope.diff 에 없음)\n' "$1"; FAILED=1
  else
    printf '  ok   target  %s\n' "$1"
  fi
}

# 제외 목록으로 가고 scope.diff 에서 사라지는지
dropped() {
  run "$(hunk "$1")"
  if ! grep -qxF "$1" "$TMP/out/excluded.txt"; then
    printf '  FAIL 미제외  %s (excluded.txt 에 없음)\n' "$1"; FAILED=1
  elif grep -qF "b/$1" "$TMP/out/scope.diff"; then
    printf '  FAIL 유출    %s (scope.diff 에 남음)\n' "$1"; FAILED=1
  else
    printf '  ok   exclude %s\n' "$1"
  fi
}

echo "review-scope.spec: 대상"
kept src/domain/quantity/index.ts
kept tests/golden/quantity.test.ts
kept evals/harness/run.ts
kept scripts/ci/scrub-secrets.sh
kept .github/workflows/review.yml
kept package.json
kept tsconfig.json
kept lighthouserc.cjs
kept vitest.config.ts
kept vitest.ui.setup.test.ts    # 루트 소스 파일 — 하위 디렉터리 규칙 어디에도 안 걸린다
kept src/rulepack/jp-mlit/splice.yaml

echo "review-scope.spec: 제외"
dropped docs/ADR.md
dropped CLAUDE.md
dropped package-lock.json
dropped .claude/commands/review-code.md
dropped phases/6-section-import/step1.md
dropped public/logo.png
dropped src/assets/icon.svg          # src/ 안이어도 자산은 제외다
dropped design/kijun-design-system/_ds_bundle.js  # 반입 번들 — 루트 규칙이 넓어져도 새지 않는다

echo "review-scope.spec: 혼합 diff"
# $(...) 는 끝 개행을 먹으므로 구획 사이에 개행을 직접 넣는다
run "$(hunk src/domain/rebar/girder.ts)
$(hunk package-lock.json)
$(hunk docs/ADR.md)
$(hunk tests/golden/quantity.test.ts)"
if [ "$(wc -l < "$TMP/out/files.txt")" -ne 2 ] || [ "$(wc -l < "$TMP/out/excluded.txt")" -ne 2 ]; then
  printf '  FAIL 분류    대상 2·제외 2 여야 하는데 대상 %s·제외 %s\n' \
    "$(wc -l < "$TMP/out/files.txt")" "$(wc -l < "$TMP/out/excluded.txt")"; FAILED=1
elif grep -qF 'b/package-lock.json' "$TMP/out/scope.diff" || grep -qF 'b/docs/ADR.md' "$TMP/out/scope.diff"; then
  printf '  FAIL 유출    scope.diff 에 제외 파일이 남았다\n'; FAILED=1
else
  printf '  ok   혼합 diff 4개 → 대상 2·제외 2, scope.diff 는 대상만\n'
fi

echo "review-scope.spec: ---/+++ 없는 구획"
# rename·binary 는 ---/+++ 를 만들지 않는다. 이 구획을 놓치면 이름만 바뀐 소스가
# 리뷰 없이 통과하고도 "제외됨" 목록에조차 안 나타난다 — 조용한 무리뷰다.
run "$(printf 'diff --git a/src/old.ts b/src/new.ts\nsimilarity index 100%%\nrename from src/old.ts\nrename to src/new.ts\n')"
if grep -qxF 'src/new.ts' "$TMP/out/files.txt"; then
  printf '  ok   rename  src/new.ts 를 대상으로 잡는다\n'
else
  printf '  FAIL rename  ---/+++ 없는 구획을 놓쳤다\n'; FAILED=1
fi

echo "review-scope.spec: --paths (신규 파일)"
# 신규 파일은 diff 에 안 잡히므로 경로 목록으로 따로 거른다. 필터가 두 벌이 되면
# 언젠가 어긋나므로 같은 is_target 을 탄다 — 그 사실을 여기서 못 박는다.
printf '%s
' src/domain/new-feature.ts docs/NOTES.md public/x.png tests/new.test.ts   | bash "$SCOPE" --paths "$TMP/out" > "$TMP/stdout"
if [ "$(cat "$TMP/out/untracked.txt" | tr '
' ' ')" = "src/domain/new-feature.ts tests/new.test.ts " ]; then
  printf '  ok   paths   대상 2건만 남는다
'
else
  printf '  FAIL paths   %s
' "$(cat "$TMP/out/untracked.txt" | tr '
' ' ')"; FAILED=1
fi

echo "review-scope.spec: 빈 입력"
run ""
if [ -s "$TMP/out/files.txt" ] || [ -s "$TMP/out/scope.diff" ]; then
  printf '  FAIL 빈입력  산출물이 비어야 한다\n'; FAILED=1
elif ! grep -qx 'target=0' "$TMP/stdout"; then
  printf '  FAIL 빈입력  target=0 을 내보내야 한다: %s\n' "$(cat "$TMP/stdout")"; FAILED=1
else
  printf '  ok   빈입력  target=0\n'
fi

if [ "$FAILED" -ne 0 ]; then
  echo "review-scope.spec: 실패"
  exit 1
fi
echo "review-scope.spec: 통과"
