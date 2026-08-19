#!/usr/bin/env bash
# 리뷰 대상 판정 하나. review-scope.sh 와 review-carryforward.sh 가 이것만 쓴다.
#
# 두 스크립트가 각자 규칙을 들고 있으면 언젠가 갈라지고, 갈라지는 방향이 위험하다 —
# scope 는 "리뷰 대상"이라 하고 carryforward 는 "무시해도 되는 것"이라 하면 그 파일은
# 리뷰 없이 자동 머지된다. 실제로 `evals/**/*.md` 12개가 그렇게 새어 나갔다
# (PR #41 5차 리뷰의 major). 그래서 정의를 한 벌만 둔다.
#
# 사용: . "$(dirname "${BASH_SOURCE[0]}")/review-filter.sh"
#
# 검증: review-scope.spec.sh · review-carryforward.spec.sh

# 대상 판정. 제외를 먼저 본다 — src/ 안이어도 자산 파일은 제외다.
is_target() {
  case "$1" in
    .claude/*|docs/*|phases/*|CLAUDE.md|package-lock.json) return 1 ;;
    *.png|*.jpg|*.jpeg|*.gif|*.svg|*.ico|*.webp|*.pdf|*.xlsx|*.woff|*.woff2|*.ttf) return 1 ;;
  esac
  case "$1" in
    src/*|tests/*|evals/*|scripts/*|.github/workflows/*) return 0 ;;
    package.json|lighthouserc.*|tsconfig*.json) return 0 ;;
    *.config.js|*.config.cjs|*.config.mjs|*.config.ts) return 0 ;;
    *.yaml|*.yml) return 0 ;;
  esac

  # 루트 파일은 위 디렉터리 규칙 어디에도 안 걸린다. vitest.ui.setup.test.ts 처럼
  # 하위 디렉터리에 없는 소스가 조용히 대상에서 빠졌다 (PR #41 리뷰의 major).
  # 루트로 한정하는 이유는 design/ 의 반입 번들 같은 것을 끌어오지 않기 위해서다.
  case "$1" in
    */*) ;;
    *.ts|*.tsx|*.js|*.mjs|*.cjs) return 0 ;;
  esac
  return 1
}
