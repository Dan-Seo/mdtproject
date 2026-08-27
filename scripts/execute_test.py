#!/usr/bin/env python3
"""Regression tests for the harness process and artifact boundaries."""

import importlib.util
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("execute", SCRIPT_DIR / "execute.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("could not load scripts/execute.py")
execute = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(execute)


def pid_alive(pid: int) -> bool:
    if os.name == "nt":
        # tasklist는 콘솔 코드페이지(cp949 등)로 출력한다 — 특히 해당 PID가 없을 때의
        # 한국어 안내문이 UTF-8 strict 디코드를 깨뜨린다. 찾는 토큰은 ASCII이므로
        # 디코드 없이 바이트로 비교한다.
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True,
            check=False,
        )
        return f'"{pid}"'.encode("ascii") in result.stdout

    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def kill_pid(pid: int) -> None:
    if not pid_alive(pid):
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(pid)],
            capture_output=True,
            check=False,
        )
        return
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def wait_for_dead(pids: list[int], timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if all(not pid_alive(pid) for pid in pids):
            return
        time.sleep(0.05)


class RunCodexProcessTests(unittest.TestCase):
    def test_normal_path_writes_stdout_and_stderr_to_logs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            stdout_path = root / "stdout.log"
            stderr_path = root / "stderr.log"
            result = execute.run_codex_process(
                [
                    sys.executable,
                    "-c",
                    (
                        "import sys; value = sys.stdin.read(); "
                        "print('stdout:' + value); "
                        "print('stderr:' + value, file=sys.stderr)"
                    ),
                ],
                "hello",
                stdout_path,
                stderr_path,
                10,
                root,
            )

            self.assertEqual(result["exitCode"], 0)
            self.assertFalse(result["timedOut"])
            self.assertIn("stdout:hello", stdout_path.read_text(encoding="utf-8"))
            self.assertIn("stderr:hello", stderr_path.read_text(encoding="utf-8"))

    def test_timeout_kills_child_and_grandchild_without_hanging(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            child_pid_path = root / "child.pid"
            grandchild_pid_path = root / "grandchild.pid"
            stdout_path = root / "stdout.log"
            stderr_path = root / "stderr.log"
            child_code = (
                "import os, subprocess, sys, time; "
                "print('child-started', flush=True); "
                "open(sys.argv[1], 'w', encoding='utf-8').write(str(os.getpid())); "
                "grandchild = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(300)']); "
                "open(sys.argv[2], 'w', encoding='utf-8').write(str(grandchild.pid)); "
                "time.sleep(300)"
            )
            result_holder: dict[str, object] = {}

            def invoke() -> None:
                try:
                    result_holder["result"] = execute.run_codex_process(
                        [
                            sys.executable,
                            "-c",
                            child_code,
                            str(child_pid_path),
                            str(grandchild_pid_path),
                        ],
                        "",
                        stdout_path,
                        stderr_path,
                        3,
                        root,
                    )
                except BaseException as error:  # pragma: no cover - assertion below reports it
                    result_holder["error"] = error

            thread = threading.Thread(target=invoke)
            thread.start()
            pids: list[int] = []
            try:
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    if child_pid_path.exists() and grandchild_pid_path.exists():
                        pids = [
                            int(child_pid_path.read_text(encoding="utf-8")),
                            int(grandchild_pid_path.read_text(encoding="utf-8")),
                        ]
                        break
                    time.sleep(0.05)

                thread.join(30)
                self.assertFalse(thread.is_alive(), "timeout handling hung after killing the parent")
                self.assertNotIn("error", result_holder, result_holder.get("error"))
                result = result_holder["result"]
                self.assertIsInstance(result, dict)
                self.assertTrue(result["timedOut"])
                self.assertTrue(pids, "child PID files were not written")
                self.assertIn("child-started", stdout_path.read_text(encoding="utf-8"))
                wait_for_dead(pids)
                self.assertTrue(all(not pid_alive(pid) for pid in pids))
            finally:
                thread.join(timeout=1)
                for pid_path in (child_pid_path, grandchild_pid_path):
                    if pid_path.exists():
                        try:
                            pid = int(pid_path.read_text(encoding="utf-8"))
                        except ValueError:
                            continue
                        if pid not in pids:
                            pids.append(pid)
                for pid in pids:
                    kill_pid(pid)


class InvokeArtifactTests(unittest.TestCase):
    def test_invoke_uses_new_artifact_names_and_does_not_write_output_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            phase_dir = root / "phases" / "t"
            phase_dir.mkdir(parents=True)
            (phase_dir / "index.json").write_text(
                json.dumps({"project": "test", "phase": "t", "steps": [{"step": 0, "name": "sample"}]}),
                encoding="utf-8",
            )
            (phase_dir / "step0.md").write_text("test prompt", encoding="utf-8")
            subprocess.run(["git", "init"], cwd=root, capture_output=True, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True)

            executor = execute.StepExecutor("t", root=root)
            with mock.patch.object(execute.shutil, "which", return_value=sys.executable):
                result = executor._invoke_codex({"step": 0, "name": "sample"}, "preamble\n")

            self.assertTrue((phase_dir / "step0-invoke.json").exists())
            self.assertTrue((phase_dir / "step0-codex.stdout.log").exists())
            self.assertTrue((phase_dir / "step0-codex.stderr.log").exists())
            self.assertFalse((phase_dir / "step0-output.json").exists())
            self.assertEqual(result["stdout_log"], str(Path("phases") / "t" / "step0-codex.stdout.log"))
            self.assertEqual(result["stderr_log"], str(Path("phases") / "t" / "step0-codex.stderr.log"))
            saved = json.loads((phase_dir / "step0-invoke.json").read_text(encoding="utf-8"))
            self.assertNotIn("stdout", saved)
            self.assertNotIn("stderr", saved)
            self.assertIn("timedOut", saved)


class FakeStepExecutor(execute.StepExecutor):
    """Write predetermined step outcomes instead of invoking Codex."""

    def __init__(self, phase_dir_name: str, outcomes: dict[int, list[dict]], *, root: Path):
        self.outcomes = outcomes
        self.calls_by_step: dict[int, int] = {}
        self.preambles: list[str] = []
        super().__init__(phase_dir_name, root=root)

    def _invoke_codex(self, step: dict, preamble: str) -> dict:
        step_num = step["step"]
        attempt = self.calls_by_step.get(step_num, 0)
        self.calls_by_step[step_num] = attempt + 1
        self.preambles.append(preamble)
        choices = self.outcomes[step_num]
        outcome = choices[min(attempt, len(choices) - 1)]
        index = self._read_json(self._index_file)
        for candidate in index["steps"]:
            if candidate["step"] == step_num:
                candidate["status"] = outcome["status"]
                if "summary" in outcome:
                    candidate["summary"] = outcome["summary"]
                if "error_message" in outcome:
                    candidate["error_message"] = outcome["error_message"]
        self._write_json(self._index_file, index)
        return {"step": step_num}


def make_harness_fixture(root: Path, steps: list[dict], *, top_index: bool = False) -> None:
    phase_dir = root / "phases" / "fixture"
    phase_dir.mkdir(parents=True)
    (phase_dir / "index.json").write_text(
        json.dumps({"project": "test", "phase": "fixture", "steps": steps}),
        encoding="utf-8",
    )
    for step in steps:
        (phase_dir / f"step{step['step']}.md").write_text("test prompt", encoding="utf-8")
    if top_index:
        (root / "phases" / "index.json").write_text(
            json.dumps({"phases": [{"dir": "fixture", "status": "pending"}]}),
            encoding="utf-8",
        )
    subprocess.run(["git", "init"], cwd=root, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True)


class RefutedProtocolTests(unittest.TestCase):
    def test_gate_refuted_stops_before_next_pending_step(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            steps = [
                {"step": 0, "name": "gate", "kind": "verify", "gate": True, "status": "pending"},
                {"step": 1, "name": "implementation", "status": "pending"},
            ]
            make_harness_fixture(root, steps)
            executor = FakeStepExecutor(
                "fixture",
                {
                    0: [{"status": "refuted", "summary": "전제가 반증됨"}],
                    1: [{"status": "completed", "summary": "구현 완료"}],
                },
                root=root,
            )

            executor._execute_all_steps("guards")

            saved = json.loads((root / "phases" / "fixture" / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(executor.calls_by_step, {0: 1})
            self.assertEqual([step["status"] for step in saved["steps"]], ["refuted", "pending"])

    def test_gate_refuted_finalizes_phase_as_refuted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            steps = [
                {"step": 0, "name": "gate", "kind": "verify", "gate": True, "status": "pending"},
                {"step": 1, "name": "implementation", "status": "pending"},
            ]
            make_harness_fixture(root, steps, top_index=True)
            executor = FakeStepExecutor(
                "fixture",
                {0: [{"status": "refuted", "summary": "전제가 반증됨"}]},
                root=root,
            )

            executor._execute_all_steps("guards")
            executor._finalize()

            top = json.loads((root / "phases" / "index.json").read_text(encoding="utf-8"))
            phase = top["phases"][0]
            self.assertEqual(phase["status"], "refuted")
            self.assertIn("refuted_at", phase)

    def test_gate_completed_allows_next_pending_step(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            steps = [
                {"step": 0, "name": "gate", "kind": "verify", "gate": True, "status": "pending"},
                {"step": 1, "name": "implementation", "status": "pending"},
            ]
            make_harness_fixture(root, steps)
            executor = FakeStepExecutor(
                "fixture",
                {
                    0: [{"status": "completed", "summary": "전제 확인"}],
                    1: [{"status": "completed", "summary": "구현 완료"}],
                },
                root=root,
            )

            executor._execute_all_steps("guards")

            self.assertEqual(executor.calls_by_step, {0: 1, 1: 1})
            saved = json.loads((root / "phases" / "fixture" / "index.json").read_text(encoding="utf-8"))
            self.assertEqual([step["status"] for step in saved["steps"]], ["completed", "completed"])

    def test_gate_true_on_non_verify_step_exits_before_invocation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            steps = [{"step": 7, "name": "implementation", "gate": True, "status": "pending"}]
            make_harness_fixture(root, steps)
            subprocess.run(["git", "add", "."], cwd=root, capture_output=True, check=True)
            subprocess.run(
                ["git", "commit", "-m", "fixture"],
                cwd=root,
                capture_output=True,
                check=True,
            )
            executor = FakeStepExecutor(
                "fixture",
                {7: [{"status": "completed", "summary": "호출되면 안 됨"}]},
                root=root,
            )

            with mock.patch("builtins.print") as print_mock, self.assertRaises(SystemExit) as raised:
                executor.run()

            self.assertEqual(raised.exception.code, 1)
            self.assertEqual(executor.calls_by_step, {})
            printed = "\n".join(" ".join(str(part) for part in call.args) for call in print_mock.call_args_list)
            self.assertIn('"gate": true는 kind "verify" 스텝에서만 유효하다 (step 7)', printed)

    def test_refuted_verify_is_terminal_and_preserves_summary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            steps = [{"step": 0, "name": "verify", "kind": "verify", "status": "pending"}]
            make_harness_fixture(root, steps)
            executor = FakeStepExecutor(
                "fixture",
                {0: [{"status": "refuted", "summary": "주장이 반증됨"}]},
                root=root,
            )

            result = executor._execute_single_step(steps[0], "guards")

            saved = json.loads((root / "phases" / "fixture" / "index.json").read_text(encoding="utf-8"))
            saved_step = saved["steps"][0]
            self.assertTrue(result)
            self.assertEqual(executor.calls_by_step[0], 1)
            self.assertEqual(saved_step["status"], "refuted")
            self.assertIn("refuted_at", saved_step)
            self.assertEqual(saved_step["summary"], "주장이 반증됨")
            self.assertIn("반증 성립 → \"refuted\"", executor.preambles[0])

    def test_refuted_verify_allows_next_pending_step(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            steps = [
                {"step": 0, "name": "verify", "kind": "verify", "status": "pending"},
                {"step": 1, "name": "next", "status": "pending"},
            ]
            make_harness_fixture(root, steps)
            executor = FakeStepExecutor(
                "fixture",
                {
                    0: [{"status": "refuted", "summary": "첫 주장 반증"}],
                    1: [{"status": "completed", "summary": "후속 구현 완료"}],
                },
                root=root,
            )

            executor._execute_all_steps("guards")

            self.assertEqual(executor.calls_by_step, {0: 1, 1: 1})
            saved = json.loads((root / "phases" / "fixture" / "index.json").read_text(encoding="utf-8"))
            self.assertEqual([step["status"] for step in saved["steps"]], ["refuted", "completed"])

    def test_finalize_marks_phase_completed_after_refuted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            steps = [{"step": 0, "name": "verify", "kind": "verify", "status": "refuted", "summary": "반증"}]
            make_harness_fixture(root, steps, top_index=True)
            executor = FakeStepExecutor("fixture", {0: []}, root=root)

            executor._finalize()

            top = json.loads((root / "phases" / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(top["phases"][0]["status"], "completed")

    def test_invalid_refuted_status_retries_with_explicit_prev_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            steps = [{"step": 0, "name": "implementation", "status": "pending"}]
            make_harness_fixture(root, steps)
            executor = FakeStepExecutor(
                "fixture",
                {
                    0: [
                        {"status": "refuted", "summary": "잘못된 종결"},
                        {"status": "completed", "summary": "수정 완료"},
                    ]
                },
                root=root,
            )

            result = executor._execute_single_step(steps[0], "guards")

            expected = "status 'refuted'는 kind 'verify' 스텝에서만 유효하다"
            self.assertTrue(result)
            self.assertEqual(executor.calls_by_step[0], 2)
            self.assertIn(expected, executor.preambles[1])

    def test_check_blockers_does_not_exit_on_refuted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            steps = [{"step": 0, "name": "verify", "kind": "verify", "status": "refuted", "summary": "반증"}]
            make_harness_fixture(root, steps)
            executor = FakeStepExecutor("fixture", {0: []}, root=root)

            executor._check_blockers()

    def test_build_step_context_includes_refuted_summary(self) -> None:
        context = execute.StepExecutor._build_step_context(
            {
                "steps": [
                    {"step": 0, "name": "verify", "status": "refuted", "summary": "주장이 틀림"},
                    {"step": 1, "name": "done", "status": "completed", "summary": "완료"},
                ]
            }
        )

        self.assertIn("Step 0 (verify): (반증) 주장이 틀림", context)
        self.assertIn("Step 1 (done): 완료", context)

    def test_verify_preamble_only_adds_refuted_rule_for_verify_steps(self) -> None:
        executor = object.__new__(execute.StepExecutor)
        executor._phase_dir_name = "fixture"
        executor._phase_name = "fixture"
        executor._project = "test"
        regular = executor._build_preamble("guards", "", verify=False)
        verify = executor._build_preamble("guards", "", verify=True)

        self.assertNotIn("반증 성립", regular)
        self.assertIn("반증 성립", verify)


if __name__ == "__main__":
    unittest.main()
