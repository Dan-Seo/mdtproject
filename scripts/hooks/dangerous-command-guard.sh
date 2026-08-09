#!/bin/bash
# Dangerous Command Guard Hook — PreToolUse (shell 계열 툴)
# 되돌릴 수 없는 명령을 실행하려 하면 차단한다.
#
# Claude(.claude/settings.json)와 Codex(.codex/hooks.json) 양쪽에서 공유한다.
# 판정 결과는 exit code가 아니라 훅 출력 JSON으로 낸다 — 두 도구가 같은 와이어 포맷
# (hookSpecificOutput.permissionDecision)을 쓰고, exit code 해석은 도구마다 다르기 때문.
#
# 입력의 명령 표현이 다르므로 tool_input 안의 문자열을 전부 모아서 검사한다:
#   - Claude Bash  → tool_input.command (문자열)
#   - Codex shell  → tool_input.command (배열: ["bash","-lc","..."])

INPUT=$(cat)

CMD=$(echo "$INPUT" | jq -r '[.tool_input | .. | strings] | join("\n")' 2>/dev/null)

if [ -z "$CMD" ]; then
  exit 0
fi

DANGEROUS='rm[[:space:]]+-rf|git[[:space:]]+push[[:space:]]+--force|git[[:space:]]+reset[[:space:]]+--hard|DROP[[:space:]]+TABLE'

if echo "$CMD" | grep -qE "$DANGEROUS"; then
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED: 되돌릴 수 없는 명령이 감지되었습니다 (rm -rf / git push --force / git reset --hard / DROP TABLE). 꼭 필요하면 사용자에게 직접 실행을 요청하세요."
  }
}
EOF
fi

exit 0
