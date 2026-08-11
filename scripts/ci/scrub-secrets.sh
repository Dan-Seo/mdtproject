#!/usr/bin/env bash
# 자격증명 형태 문자열을 [REDACTED]로 치환한다. stdin → stdout.
#
# 용도: oncall 워크플로가 CI 실패 로그를 에이전트에 넘기기 전, 그리고
# 에이전트가 쓴 PR 본문을 게시하기 전에 통과시키는 이중 방벽.
# GitHub Actions가 등록된 시크릿을 ***로 마스킹하지만, 등록되지 않은
# 토큰(에코된 환경변수, URL 속 자격증명 등)은 그대로 새므로 형태 기반으로 걸러낸다.
#
# 과하게 가리면 에이전트가 읽을 오류 내용이 지워진다 — 패턴은 자격증명임이
# 분명한 형태로 한정한다. 검증은 scrub-secrets.spec.sh.
set -euo pipefail

sed -E \
  -e '/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,/-----END [A-Z0-9 ]*PRIVATE KEY-----/ s#.*#[REDACTED]#' \
  -e 's#gh[opusr]_[A-Za-z0-9]{20,}#[REDACTED]#g' \
  -e 's#github_pat_[A-Za-z0-9_]{20,}#[REDACTED]#g' \
  -e 's#sk-[A-Za-z0-9_-]{20,}#[REDACTED]#g' \
  -e 's#npm_[A-Za-z0-9]{20,}#[REDACTED]#g' \
  -e 's#xox[abeprs]-[A-Za-z0-9-]{10,}#[REDACTED]#g' \
  -e 's#AKIA[0-9A-Z]{16}#[REDACTED]#g' \
  -e 's#eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+#[REDACTED]#g' \
  -e 's#(Authorization[[:space:]]*:[[:space:]]*(Bearer|Basic|token))[[:space:]]+[A-Za-z0-9._+/=-]{6,}#\1 [REDACTED]#Ig' \
  -e 's#(https?://[^/@[:space:]:]+):[^@/[:space:]]+@#\1:[REDACTED]@#g' \
  -e 's#((password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|auth)[A-Za-z0-9_]*[[:space:]]*[=:][[:space:]]*)[A-Za-z0-9._+/=-]{8,}([^A-Za-z0-9._+/=(-]|$)#\1[REDACTED]\3#Ig'
