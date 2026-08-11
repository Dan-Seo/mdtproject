#!/bin/bash
# scrub-secrets.sh 자체 테스트.
#
# 이 스크립트의 실패 모드는 두 방향이다.
# 1) 덜 가림 — CI 로그의 자격증명이 oncall PR 본문에 그대로 실린다 (유출).
# 2) 과하게 가림 — 에이전트가 읽을 실패 로그에서 진짜 오류 내용이 지워진다 (오진).
# 그래서 "가려야 할 것을 가리는가"와 "남겨야 할 것을 남기는가"를 함께 본다.

SCRUB="$(dirname "$0")/scrub-secrets.sh"
FAILED=0

# 입력에 든 비밀 문자열이 출력에서 사라지고 [REDACTED] 마커가 남는지 본다.
masked() {
  INPUT="$1"
  SECRET="$2"
  DESC="$3"

  OUT=$(printf '%s\n' "$INPUT" | bash "$SCRUB")

  if printf '%s' "$OUT" | grep -qF "$SECRET"; then
    printf '  FAIL 유출  %s\n    out: %s\n' "$DESC" "$OUT"
    FAILED=1
  elif ! printf '%s' "$OUT" | grep -qF '[REDACTED]'; then
    printf '  FAIL 마커없음  %s\n    out: %s\n' "$DESC" "$OUT"
    FAILED=1
  else
    printf '  ok   masked %s\n' "$DESC"
  fi
}

# 평범한 로그 줄이 한 글자도 안 바뀌고 통과하는지 본다.
intact() {
  INPUT="$1"
  DESC="$2"

  OUT=$(printf '%s\n' "$INPUT" | bash "$SCRUB")

  if [ "$OUT" = "$INPUT" ]; then
    printf '  ok   intact %s\n' "$DESC"
  else
    printf '  FAIL 변형됨  %s\n    in : %s\n    out: %s\n' "$DESC" "$INPUT" "$OUT"
    FAILED=1
  fi
}

# 가짜 토큰 픽스처는 접두사와 본문을 이어붙여 만든다 — 커밋된 소스에 연속된 토큰
# 형태가 남으면 pre-commit 시크릿 가드·push protection이 (정당하게) 차단하기 때문이다.
# 스크립트가 stdin으로 받는 최종 문자열은 실제 토큰 형태 그대로다.
PAD36="AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"
GHP="ghp_${PAD36}"
GHS="ghs_${PAD36}"
GPAT="github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz"
SKA="sk-ant-${PAD36}"
NPMT="npm_${PAD36}"
AKIA="AKIA""IOSFODNN7EXAMPLE"

echo "scrub-secrets: 토큰 형태는 가린다"
masked "remote: https://${GHP}@github.com/x/y" "$GHP" "GitHub PAT (ghp_)"
masked "token: ${GHS}" "$GHS" "GitHub 앱 토큰 (ghs_)"
masked "using ${GPAT}" "$GPAT" "fine-grained PAT"
masked "ANTHROPIC_API_KEY=${SKA}" "$SKA" "Anthropic API 키"
masked "npm ERR! //registry.npmjs.org/:_authToken=${NPMT}" "$NPMT" "npm 토큰"
masked "slack notify failed: xoxb-1234567890-abcdefghij" \
       "xoxb-1234567890-abcdefghij" "Slack 봇 토큰"
masked "aws key ${AKIA} rejected" "$AKIA" "AWS 액세스 키"
masked "jwt: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpM" \
       "SflKxwRJSMeKKF2QT4fwpM" "JWT 3분절"
masked "curl -H 'Authorization: Bearer abc123def456ghi789'" \
       "abc123def456ghi789" "Authorization 헤더"
masked "DB_PASSWORD=hunter2hunter2 npm run migrate" \
       "hunter2hunter2" "password=값 대입"
masked "fetch https://deploy:s3cr3tPass99@example.com/repo failed" \
       "s3cr3tPass99" "URL 속 자격증명"

echo "scrub-secrets: 개인키 블록은 통째로 가린다"
PK="PRIVATE KEY" # 헤더도 이어붙인다 — 시크릿 가드가 PEM 헤더 자체를 잡는다
KEYBLOCK="-----BEGIN RSA ${PK}-----
MIIEpAIBAAKCAQEA7changeme
-----END RSA ${PK}-----"
masked "$KEYBLOCK" "MIIEpAIBAAKCAQEA7changeme" "PEM 개인키 본문"

echo "scrub-secrets: 평범한 로그는 건드리지 않는다"
intact "FAIL  tests/golden/anchorage.test.ts > 定着長さ L2 표 대조" "vitest 실패 줄"
intact "src/domain/rebar/column.ts(42,7): error TS2345: Argument of type 'string'" "tsc 오류 줄"
intact "const token = parseToken(input)" "코드 속 token 식별자"
intact "npm ERR! code ELIFECYCLE" "npm 오류 줄"
intact "deadbeefcafe0123456789abcdef0123456789ab is the merge commit" "40자 git SHA"
intact "정착 길이 계산: 40d = 880mm (SD345, Fc24)" "일본어·한국어 도메인 줄"
intact "log shows *** was rejected" "이미 마스킹된 ***"

if [ "$FAILED" -ne 0 ]; then
  echo "scrub-secrets.spec: 실패"
  exit 1
fi

echo "scrub-secrets.spec: 통과"
