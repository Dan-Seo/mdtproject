"""
hooks/tdd-guard.sh 동작 테스트.

Claude(Edit|Write)와 Codex(apply_patch / shell) 양쪽 PreToolUse 입력을 모두
같은 규칙으로 판정하는지 검증한다.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

GUARD = (Path(__file__).parent / "hooks" / "tdd-guard.sh").as_posix()
BASH = shutil.which("bash")

pytestmark = pytest.mark.skipif(BASH is None, reason="bash가 필요하다")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run_guard(cwd: Path, payload: dict) -> dict:
    """가드를 실행하고 stdout을 파싱한다. 허용이면 None, 차단이면 훅 출력 dict."""
    r = subprocess.run(
        [BASH, GUARD],
        cwd=str(cwd),
        input=json.dumps(payload, ensure_ascii=False),
        capture_output=True, text=True, encoding="utf-8",
    )
    assert r.returncode == 0, f"guard가 비정상 종료: {r.stderr}"
    out = r.stdout.strip()
    return json.loads(out) if out else None


def claude_payload(file_path: str) -> dict:
    return {
        "hook_event_name": "PreToolUse",
        "tool_name": "Write",
        "tool_input": {"file_path": file_path, "content": "export const x = 1\n"},
    }


def patch_text(*headers: str) -> str:
    body = "".join(f"{h}\n+line\n" for h in headers)
    return f"*** Begin Patch\n{body}*** End Patch"


def codex_apply_patch_payload(patch: str) -> dict:
    """tool_name은 apply_patch, 패치는 tool_input.command 문자열."""
    return {
        "hook_event_name": "PreToolUse",
        "tool_name": "apply_patch",
        "tool_input": {"command": patch},
    }


@pytest.fixture
def project(tmp_path):
    """package.json이 있는(=스캐폴딩된) 프로젝트."""
    (tmp_path / "package.json").write_text("{}", encoding="utf-8")
    (tmp_path / "src" / "lib").mkdir(parents=True)
    return tmp_path


def add_test_file(project: Path, rel: str):
    p = project / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("import { it } from 'vitest'\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Claude 입력 (Edit|Write)
# ---------------------------------------------------------------------------

class TestClaudeInput:
    def test_blocks_source_without_test(self, project):
        out = run_guard(project, claude_payload("src/lib/foo.ts"))
        assert out is not None
        hso = out["hookSpecificOutput"]
        assert hso["hookEventName"] == "PreToolUse"
        assert hso["permissionDecision"] == "deny"
        assert "foo" in hso["permissionDecisionReason"]

    def test_allows_source_with_sibling_test(self, project):
        add_test_file(project, "src/lib/foo.test.ts")
        assert run_guard(project, claude_payload("src/lib/foo.ts")) is None

    def test_allows_markdown(self, project):
        assert run_guard(project, claude_payload("docs/ADR.md")) is None

    def test_allows_test_file_itself(self, project):
        assert run_guard(project, claude_payload("src/lib/foo.test.ts")) is None


# ---------------------------------------------------------------------------
# Codex 입력 (apply_patch / shell)
# ---------------------------------------------------------------------------

class TestCodexInput:
    def test_blocks_added_source_without_test(self, project):
        payload = codex_apply_patch_payload(patch_text("*** Add File: src/lib/bar.ts"))
        out = run_guard(project, payload)
        assert out is not None
        assert out["hookSpecificOutput"]["permissionDecision"] == "deny"
        assert "bar" in out["hookSpecificOutput"]["permissionDecisionReason"]

    def test_blocks_updated_source_without_test(self, project):
        payload = codex_apply_patch_payload(patch_text("*** Update File: src/lib/baz.ts"))
        out = run_guard(project, payload)
        assert out is not None
        assert "baz" in out["hookSpecificOutput"]["permissionDecisionReason"]

    def test_allows_when_test_exists(self, project):
        add_test_file(project, "src/lib/bar.test.ts")
        payload = codex_apply_patch_payload(patch_text("*** Add File: src/lib/bar.ts"))
        assert run_guard(project, payload) is None

    def test_allows_markdown_patch(self, project):
        payload = codex_apply_patch_payload(patch_text("*** Update File: docs/ADR.md"))
        assert run_guard(project, payload) is None

    def test_allows_delete_only_patch(self, project):
        payload = codex_apply_patch_payload("*** Begin Patch\n*** Delete File: src/lib/old.ts\n*** End Patch")
        assert run_guard(project, payload) is None

    def test_allows_codex_infra(self, project):
        payload = codex_apply_patch_payload(patch_text("*** Add File: .codex/hooks.json"))
        assert run_guard(project, payload) is None

    def test_reports_every_untested_file_in_patch(self, project):
        add_test_file(project, "src/lib/ok.test.ts")
        payload = codex_apply_patch_payload(patch_text(
            "*** Add File: src/lib/ok.ts",
            "*** Add File: src/lib/one.ts",
            "*** Update File: src/lib/two.ts",
        ))
        out = run_guard(project, payload)
        assert out is not None
        reason = out["hookSpecificOutput"]["permissionDecisionReason"]
        assert "one" in reason and "two" in reason
        assert "ok" not in reason.replace("hooks", "")


# ---------------------------------------------------------------------------
# 스캐폴딩 이전
# ---------------------------------------------------------------------------

class TestBeforeScaffolding:
    def test_skips_without_package_json(self, tmp_path):
        assert run_guard(tmp_path, claude_payload("src/lib/foo.ts")) is None

    def test_skips_codex_patch_without_package_json(self, tmp_path):
        payload = codex_apply_patch_payload(patch_text("*** Add File: src/lib/foo.ts"))
        assert run_guard(tmp_path, payload) is None
