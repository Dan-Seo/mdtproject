#!/usr/bin/env bash
# 리뷰 대상 범위를 결정적으로 확정한다.
#
# /review-code 가 프롬프트로 시키던 파일 필터와 diff 취득을 코드로 옮긴 것이다. 이유는 둘이다.
# 1) 토큰 — 필터 규칙이 스킬 본문에 있으면 모든 턴에 상주하고, 에이전트가
#    `gh pr diff > 파일` 을 시도했다가 복합 명령 권한 거부에 걸리면 폴백으로
#    서브에이전트 3개가 각자 diff 를 다시 받는다 (PR #38 실측: 거부 7건, 툴 호출 87회).
# 2) 재현성 — 필터가 LLM 판단이면 같은 PR 에서도 대상이 흔들린다.
#
# stdin : unified diff (gh pr diff <n> · git diff <range> 의 출력)
# argv  : $1 = 출력 디렉터리 (기본 .review)
#         --paths <출력 디렉터리> 로 부르면 stdin 을 diff 가 아니라 경로 목록으로 읽어
#         같은 필터로 <out>/untracked.txt 를 쓴다 (로컬 모드의 신규 파일용)
# 출력  : <out>/scope.diff     대상 파일만 남긴 diff — 서브에이전트가 읽는 유일한 diff
#         <out>/files.txt      대상 파일 목록
#         <out>/excluded.txt   제외된 변경 파일 목록 (리뷰 본문에 밝힌다)
# stdout: target=<n> excluded=<n> bytes=<n>  (GITHUB_OUTPUT 에 그대로 붙는 형식)
#
# 경로 파싱은 `diff --git a/X b/X` 한 행만 본다 — git 은 생성·삭제·이름변경·바이너리에도
# 이 행을 항상 쓰므로 ---/+++ 가 없는 구획(순수 rename·binary)도 놓치지 않는다.
# 공백이 든 경로는 git 이 따옴표로 감싸 필드가 어긋난다 — 이 저장소에는 없고, 생기면
# 대상 밖으로 떨어져 excluded 에 남으므로 조용히 리뷰되는 일은 없다.
#
# 검증: review-scope.spec.sh
set -euo pipefail

. "$(dirname "${BASH_SOURCE[0]}")/review-filter.sh"

# --paths 모드: stdin 의 경로 목록을 같은 규칙으로 걸러 <out>/untracked.txt 에 쓴다.
# 로컬 모드의 신규 파일용이다 — untracked 는 diff 에 안 잡히는데 고위험 위반의 주 경로라
# 리뷰에서 빠지면 안 되고, 필터를 두 벌로 두면 언젠가 어긋난다.
if [ "${1:-}" = "--paths" ]; then
  OUT="${2:-.review}"
  mkdir -p "$OUT"
  : > "$OUT/untracked.txt"
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    is_target "$p" && printf '%s\n' "$p" >> "$OUT/untracked.txt"
  done
  printf 'untracked=%s\n' "$(wc -l < "$OUT/untracked.txt" | tr -d ' ')"
  exit 0
fi

OUT="${1:-.review}"
mkdir -p "$OUT"

RAW="$OUT/.raw.diff"
cat > "$RAW"

awk '/^diff --git /{ p=$4; sub(/^b\//,"",p); if (p != "") print p }' "$RAW" \
  | awk '!seen[$0]++' > "$OUT/.all.txt"

: > "$OUT/files.txt"
: > "$OUT/excluded.txt"
while IFS= read -r p; do
  [ -n "$p" ] || continue
  if is_target "$p"; then printf '%s\n' "$p" >> "$OUT/files.txt"
  else printf '%s\n' "$p" >> "$OUT/excluded.txt"; fi
done < "$OUT/.all.txt"

awk -v list="$OUT/files.txt" '
  BEGIN { while ((getline l < list) > 0) keep[l] = 1 }
  /^diff --git / { p = $4; sub(/^b\//, "", p); emit = (p in keep) }
  emit { print }
' "$RAW" > "$OUT/scope.diff"

rm -f "$RAW" "$OUT/.all.txt"

printf 'target=%s\nexcluded=%s\nbytes=%s\n' \
  "$(wc -l < "$OUT/files.txt" | tr -d ' ')" \
  "$(wc -l < "$OUT/excluded.txt" | tr -d ' ')" \
  "$(wc -c < "$OUT/scope.diff" | tr -d ' ')"
