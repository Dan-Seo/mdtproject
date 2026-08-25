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


if __name__ == "__main__":
    unittest.main()
