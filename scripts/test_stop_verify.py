"""
hooks/stop-verify.sh 동작 테스트.

Codex Stop 이벤트는 exit 0일 때 stdout이 JSON이어야 한다 (plain text는 invalid).
npm 출력이 stdout으로 새지 않고, 실패 시에만 block JSON이 나오는지 검증한다.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

HOOK = (Path(__file__).parent / "hooks" / "stop-verify.sh").as_posix()
BASH = shutil.which("bash")
NPM = shutil.which("npm")

pytestmark = pytest.mark.skipif(BASH is None, reason="bash가 필요하다")

NOOP = "node -e \"\""
FAIL = "node -e \"console.log('LINT_OUTPUT_MARKER'); process.exit(1)\""


def run_hook(cwd: Path, *, stop_hook_active: bool = False):
    payload = {
        "hook_event_name": "Stop",
        "session_id": "thr_test",
        "cwd": str(cwd),
        "stop_hook_active": stop_hook_active,
    }
    r = subprocess.run(
        [BASH, HOOK], cwd=str(cwd),
        input=json.dumps(payload), capture_output=True, text=True, encoding="utf-8",
    )
    assert r.returncode == 0, f"hook이 비정상 종료: {r.stderr}"
    return r


def write_package_json(project: Path, lint: str, build: str, test: str):
    (project / "package.json").write_text(
        json.dumps({"name": "t", "scripts": {
            "lint": lint,
            "typecheck": NOOP,
            "build": build,
            "test": test,
        }}),
        encoding="utf-8",
    )


@pytest.fixture
def project(tmp_path):
    # stop-verify.sh intentionally exits before validation when dependencies are absent.
    (tmp_path / "node_modules").mkdir()
    return tmp_path


class TestSkips:
    def test_no_package_json_is_silent(self, project):
        """스캐폴딩 전에는 검증 대상이 없다."""
        r = run_hook(project)
        assert r.stdout.strip() == ""

    def test_incomplete_scripts_is_silent(self, project):
        """package.json은 생겼지만 lint·build·test가 아직 다 없는 스캐폴딩 도중 구간."""
        (project / "package.json").write_text(
            json.dumps({"name": "t", "scripts": {"lint": NOOP}}), encoding="utf-8")
        r = run_hook(project)
        assert r.stdout.strip() == ""

    def test_no_scripts_field_is_silent(self, project):
        (project / "package.json").write_text('{"name": "t"}', encoding="utf-8")
        r = run_hook(project)
        assert r.stdout.strip() == ""

    def test_already_continued_is_silent(self, project):
        """stop_hook_active면 다시 이어붙이지 않는다 — 무한 루프 방지."""
        write_package_json(project, FAIL, NOOP, NOOP)
        r = run_hook(project, stop_hook_active=True)
        assert r.stdout.strip() == ""


@pytest.mark.skipif(NPM is None, reason="npm이 필요하다")
class TestVerification:
    def test_success_emits_nothing(self, project):
        write_package_json(project, NOOP, NOOP, NOOP)
        r = run_hook(project)
        assert r.stdout.strip() == ""

    def test_failure_emits_block_json(self, project):
        write_package_json(project, FAIL, NOOP, NOOP)
        r = run_hook(project)
        out = json.loads(r.stdout)          # stdout은 반드시 유효한 JSON
        assert out["decision"] == "block"
        assert out["reason"]

    def test_failure_reason_carries_npm_output(self, project):
        write_package_json(project, FAIL, NOOP, NOOP)
        out = json.loads(run_hook(project).stdout)
        assert "LINT_OUTPUT_MARKER" in out["reason"]

    def test_stdout_never_leaks_plain_text(self, project):
        """npm 출력이 stdout으로 새면 Stop 이벤트에서 invalid로 처리된다."""
        write_package_json(project, NOOP, NOOP, NOOP)
        r = run_hook(project)
        assert "npm" not in r.stdout
        if r.stdout.strip():
            json.loads(r.stdout)
