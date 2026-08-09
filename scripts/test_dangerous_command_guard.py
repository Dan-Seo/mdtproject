"""
hooks/dangerous-command-guard.sh 동작 테스트.

Claude(Bash)와 Codex(shell) 양쪽 PreToolUse 입력에서 위험 명령을 잡아내는지 검증한다.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

GUARD = (Path(__file__).parent / "hooks" / "dangerous-command-guard.sh").as_posix()
BASH = shutil.which("bash")

pytestmark = pytest.mark.skipif(BASH is None, reason="bash가 필요하다")


def run_guard(payload: dict) -> dict:
    """가드를 실행하고 stdout을 파싱한다. 허용이면 None, 차단이면 훅 출력 dict."""
    r = subprocess.run(
        [BASH, GUARD],
        input=json.dumps(payload, ensure_ascii=False),
        capture_output=True, text=True, encoding="utf-8",
    )
    assert r.returncode == 0, f"guard가 비정상 종료: {r.stderr}"
    out = r.stdout.strip()
    return json.loads(out) if out else None


def claude_bash(command: str) -> dict:
    return {"hook_event_name": "PreToolUse", "tool_name": "Bash",
            "tool_input": {"command": command}}


def codex_bash(command: str) -> dict:
    """Codex의 셸 툴은 tool_name이 `Bash`이고 tool_input.command는 문자열이다."""
    return {"hook_event_name": "PreToolUse", "tool_name": "Bash",
            "tool_input": {"command": command}}


DANGEROUS = [
    "rm -rf /",
    "git push --force origin main",
    "git reset --hard HEAD~3",
    "psql -c 'DROP TABLE users'",
]


class TestBlocks:
    @pytest.mark.parametrize("cmd", DANGEROUS)
    def test_blocks_claude_bash(self, cmd):
        out = run_guard(claude_bash(cmd))
        assert out is not None, f"차단되지 않음: {cmd}"
        hso = out["hookSpecificOutput"]
        assert hso["hookEventName"] == "PreToolUse"
        assert hso["permissionDecision"] == "deny"
        assert hso["permissionDecisionReason"]

    @pytest.mark.parametrize("cmd", DANGEROUS)
    def test_blocks_codex_bash(self, cmd):
        assert run_guard(codex_bash(cmd)) is not None


class TestAllows:
    @pytest.mark.parametrize("cmd", [
        "npm run test",
        "git push origin feat-mvp",
        "git reset HEAD -- file.ts",
        "rm build.log",
    ])
    def test_allows_safe_commands(self, cmd):
        assert run_guard(claude_bash(cmd)) is None

    def test_allows_empty_tool_input(self):
        assert run_guard({"hook_event_name": "PreToolUse", "tool_name": "shell"}) is None
