#!/usr/bin/env python3
"""
Harness Step Executor — phase 내 step을 순차 실행하고 자가 교정한다.

Usage:
    python3 scripts/execute.py <phase-dir> [--push]
"""

import argparse
import contextlib
import json
import os
import signal
import shutil
import subprocess
import sys
import threading
import time
import types
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent


def run_codex_process(cmd, prompt, stdout_path, stderr_path, timeout_sec, cwd):
    """Run a Codex command with file-backed output and whole-tree timeout cleanup."""
    started = time.monotonic()
    popen_kwargs = {
        "cwd": cwd,
        "stdin": subprocess.PIPE,
        "text": True,
        "encoding": "utf-8",
    }
    if os.name != "nt":
        popen_kwargs["start_new_session"] = True

    stdout_path = Path(stdout_path)
    stderr_path = Path(stderr_path)
    with stdout_path.open("w", encoding="utf-8") as stdout_file, stderr_path.open(
        "w", encoding="utf-8"
    ) as stderr_file:
        popen_kwargs["stdout"] = stdout_file
        popen_kwargs["stderr"] = stderr_file
        proc = subprocess.Popen(cmd, **popen_kwargs)
        timed_out = False
        try:
            proc.communicate(input=prompt, timeout=timeout_sec)
        except subprocess.TimeoutExpired:
            timed_out = True
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    capture_output=True,
                    check=False,
                )
            else:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            proc.wait()

    return {
        "exitCode": proc.returncode,
        "timedOut": timed_out,
        "elapsed": time.monotonic() - started,
    }


def _force_utf8_output():
    """Windows 콘솔 기본 코드페이지(cp949 등)는 '✓'·'◐'를 인코딩하지 못한다.
    step이 성공해도 진행 출력 한 줄 때문에 UnicodeEncodeError로 죽으므로 막는다."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


@contextlib.contextmanager
def progress_indicator(label: str):
    """터미널 진행 표시기. with 문으로 사용하며 .elapsed 로 경과 시간을 읽는다."""
    frames = "◐◓◑◒"
    stop = threading.Event()
    t0 = time.monotonic()

    def _animate():
        idx = 0
        while not stop.wait(0.12):
            sec = int(time.monotonic() - t0)
            sys.stderr.write(f"\r{frames[idx % len(frames)]} {label} [{sec}s]")
            sys.stderr.flush()
            idx += 1
        sys.stderr.write("\r" + " " * (len(label) + 20) + "\r")
        sys.stderr.flush()

    th = threading.Thread(target=_animate, daemon=True)
    th.start()
    info = types.SimpleNamespace(elapsed=0.0)
    try:
        yield info
    finally:
        stop.set()
        th.join()
        info.elapsed = time.monotonic() - t0


class StepExecutor:
    """Phase 디렉토리 안의 step들을 순차 실행하는 하네스."""

    MAX_RETRIES = 3
    FEAT_MSG = "feat({phase}): step {num} — {name}"
    CHORE_MSG = "chore({phase}): step {num} output"
    TZ = timezone(timedelta(hours=9))

    def __init__(self, phase_dir_name: str, *, auto_push: bool = False, root=None):
        self._root_path = Path(root) if root is not None else ROOT
        self._root = str(self._root_path)
        self._phases_dir = self._root_path / "phases"
        self._phase_dir = self._phases_dir / phase_dir_name
        self._phase_dir_name = phase_dir_name
        self._top_index_file = self._phases_dir / "index.json"
        self._auto_push = auto_push

        if not self._phase_dir.is_dir():
            print(f"ERROR: {self._phase_dir} not found")
            sys.exit(1)

        self._index_file = self._phase_dir / "index.json"
        if not self._index_file.exists():
            print(f"ERROR: {self._index_file} not found")
            sys.exit(1)

        idx = self._read_json(self._index_file)
        self._project = idx.get("project", "project")
        self._phase_name = idx.get("phase", phase_dir_name)
        self._total = len(idx["steps"])

    def run(self):
        self._print_header()
        self._validate_gate_fields()
        self._check_blockers()
        self._checkout_branch()
        guardrails = self._load_guardrails()
        self._ensure_created_at()
        self._execute_all_steps(guardrails)
        self._finalize()

    # --- timestamps ---

    def _stamp(self) -> str:
        return datetime.now(self.TZ).strftime("%Y-%m-%dT%H:%M:%S%z")

    # --- JSON I/O ---

    @staticmethod
    def _read_json(p: Path) -> dict:
        return json.loads(p.read_text(encoding="utf-8"))

    @staticmethod
    def _write_json(p: Path, data: dict):
        p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- git ---

    def _run_git(self, *args) -> subprocess.CompletedProcess:
        cmd = ["git"] + list(args)
        return subprocess.run(cmd, cwd=self._root, capture_output=True, text=True)

    def _checkout_branch(self):
        branch = f"feat-{self._phase_name}"

        r = self._run_git("rev-parse", "--abbrev-ref", "HEAD")
        if r.returncode != 0:
            print(f"  ERROR: git을 사용할 수 없거나 git repo가 아닙니다.")
            print(f"  {r.stderr.strip()}")
            sys.exit(1)

        if r.stdout.strip() == branch:
            return

        r = self._run_git("rev-parse", "--verify", branch)
        r = self._run_git("checkout", branch) if r.returncode == 0 else self._run_git("checkout", "-b", branch)

        if r.returncode != 0:
            print(f"  ERROR: 브랜치 '{branch}' checkout 실패.")
            print(f"  {r.stderr.strip()}")
            print(f"  Hint: 변경사항을 stash하거나 commit한 후 다시 시도하세요.")
            sys.exit(1)

        print(f"  Branch: {branch}")

    def _commit_step(self, step_num: int, step_name: str):
        invoke_rel = f"phases/{self._phase_dir_name}/step{step_num}-invoke.json"
        stdout_rel = f"phases/{self._phase_dir_name}/step{step_num}-codex.stdout.log"
        stderr_rel = f"phases/{self._phase_dir_name}/step{step_num}-codex.stderr.log"
        index_rel = f"phases/{self._phase_dir_name}/index.json"

        self._run_git("add", "-A")
        self._run_git("reset", "HEAD", "--", invoke_rel, stdout_rel, stderr_rel, index_rel)

        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = self.FEAT_MSG.format(phase=self._phase_name, num=step_num, name=step_name)
            r = self._run_git("commit", "-m", msg)
            if r.returncode == 0:
                print(f"  Commit: {msg}")
            else:
                print(f"  WARN: 코드 커밋 실패: {r.stderr.strip()}")

        self._run_git("add", "-A")
        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = self.CHORE_MSG.format(phase=self._phase_name, num=step_num)
            r = self._run_git("commit", "-m", msg)
            if r.returncode != 0:
                print(f"  WARN: housekeeping 커밋 실패: {r.stderr.strip()}")

    # --- top-level index ---

    def _update_top_index(self, status: str):
        if not self._top_index_file.exists():
            return
        top = self._read_json(self._top_index_file)
        ts = self._stamp()
        for phase in top.get("phases", []):
            if phase.get("dir") == self._phase_dir_name:
                phase["status"] = status
                ts_key = {
                    "completed": "completed_at",
                    "refuted": "refuted_at",
                    "error": "failed_at",
                    "blocked": "blocked_at",
                }.get(status)
                if ts_key:
                    phase[ts_key] = ts
                break
        self._write_json(self._top_index_file, top)

    # --- guardrails & context ---

    def _load_guardrails(self) -> str:
        sections = []
        agents_md = self._root_path / "AGENTS.md"
        if agents_md.exists():
            sections.append(f"## 프로젝트 규칙 (AGENTS.md)\n\n{agents_md.read_text(encoding='utf-8')}")
        docs_dir = self._root_path / "docs"
        if docs_dir.is_dir():
            for doc in sorted(docs_dir.glob("*.md")):
                sections.append(f"## {doc.stem}\n\n{doc.read_text(encoding='utf-8')}")
        return "\n\n---\n\n".join(sections) if sections else ""

    @staticmethod
    def _build_step_context(index: dict) -> str:
        lines = [
            f"- Step {s['step']} ({s['name']}): "
            f"{('(반증) ' if s['status'] == 'refuted' else '')}{s['summary']}"
            for s in index["steps"]
            if s["status"] in ("completed", "refuted") and s.get("summary")
        ]
        if not lines:
            return ""
        return "## 이전 Step 산출물\n\n" + "\n".join(lines) + "\n\n"

    def _build_preamble(self, guardrails: str, step_context: str,
                        prev_error: Optional[str] = None, verify: bool = False) -> str:
        commit_example = self.FEAT_MSG.format(
            phase=self._phase_name, num="N", name="<step-name>"
        )
        retry_section = ""
        if prev_error:
            retry_section = (
                f"\n## ⚠ 이전 시도 실패 — 아래 에러를 반드시 참고하여 수정하라\n\n"
                f"{prev_error}\n\n---\n\n"
            )
        verify_rule = ""
        if verify:
            verify_rule = (
                '   - (이 step은 검증 전용) 반증 성립 → "refuted" + "summary"에 반증 요지. '
                "반증 성립은 실패가 아니라 이 step의 정상 종결이다. 대상을 고치지 마라.\n"
            )
        return (
            f"당신은 {self._project} 프로젝트의 개발자입니다. 아래 step을 수행하세요.\n\n"
            f"{guardrails}\n\n---\n\n"
            f"{step_context}{retry_section}"
            f"## 작업 규칙\n\n"
            f"1. 이전 step에서 작성된 코드를 확인하고 일관성을 유지하라.\n"
            f"2. 이 step에 명시된 작업만 수행하라. 추가 기능이나 파일을 만들지 마라.\n"
            f"3. 기존 테스트를 깨뜨리지 마라.\n"
            f"4. AC(Acceptance Criteria) 검증을 직접 실행하라.\n"
            f"5. /phases/{self._phase_dir_name}/index.json의 해당 step status를 업데이트하라:\n"
            f"   - AC 통과 → \"completed\" + \"summary\" 필드에 이 step의 산출물을 한 줄로 요약\n"
            f"   - {self.MAX_RETRIES}회 수정 시도 후에도 실패 → \"error\" + \"error_message\" 기록\n"
            f"   - 사용자 개입이 필요한 경우 (API 키, 인증, 수동 설정 등) → \"blocked\" + \"blocked_reason\" 기록 후 즉시 중단\n"
            f"{verify_rule}"
            f"6. 모든 변경사항을 커밋하라:\n"
            f"   {commit_example}\n\n---\n\n"
        )

    # --- Codex 호출 ---

    def _invoke_codex(self, step: dict, preamble: str) -> dict:
        step_num, step_name = step["step"], step["name"]
        step_file = self._phase_dir / f"step{step_num}.md"

        if not step_file.exists():
            print(f"  ERROR: {step_file} not found")
            sys.exit(1)

        prompt = preamble + step_file.read_text(encoding="utf-8")
        # 프롬프트는 stdin(`-`)으로 넘긴다. 가드레일(AGENTS.md + docs/*.md)만 수만 자라
        # argv로 넘기면 Windows 명령줄 길이 제한(32767자)에 걸린다.
        # --dangerously-bypass-hook-trust: .codex/hooks.json은 내용이 바뀔 때마다 untrusted로
        # 돌아가고, untrusted 훅은 조용히 건너뛴다. 우회하지 않으면 TDD 가드가 안 걸린다.
        # Windows에서 codex는 npm이 깐 셔뱅(codex.CMD)이다. CreateProcess는 PATHEXT를
        # 적용하지 않으므로 "codex"만 넘기면 FileNotFoundError로 죽는다. which로 해석한다.
        # 못 찾으면 이름 그대로 넘겨 "codex가 없다"는 에러가 그대로 드러나게 둔다.
        codex_bin = shutil.which("codex") or "codex"
        stdout_path = self._phase_dir / f"step{step_num}-codex.stdout.log"
        stderr_path = self._phase_dir / f"step{step_num}-codex.stderr.log"
        result = run_codex_process(
            [codex_bin, "exec", "--dangerously-bypass-approvals-and-sandbox",
             "--dangerously-bypass-hook-trust", "--json", "-"],
            prompt,
            stdout_path,
            stderr_path,
            1800,
            self._root,
        )

        if result["exitCode"] not in (0, None) or result["timedOut"]:
            print(f"\n  WARN: Codex가 비정상 종료됨 (code {result['exitCode']})")
            stderr = stderr_path.read_text(encoding="utf-8", errors="replace")
            if stderr:
                print(f"  stderr: {stderr[-500:]}")

        output = {
            "step": step_num,
            "name": step_name,
            "exitCode": result["exitCode"],
            "timedOut": result["timedOut"],
            "elapsed": result["elapsed"],
            "stdout_log": str(stdout_path.relative_to(self._root_path)),
            "stderr_log": str(stderr_path.relative_to(self._root_path)),
        }
        out_path = self._phase_dir / f"step{step_num}-invoke.json"
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        return output

    # --- 헤더 & 검증 ---

    def _print_header(self):
        print(f"\n{'='*60}")
        print(f"  Harness Step Executor")
        print(f"  Phase: {self._phase_name} | Steps: {self._total}")
        if self._auto_push:
            print(f"  Auto-push: enabled")
        print(f"{'='*60}")

    def _validate_gate_fields(self):
        index = self._read_json(self._index_file)
        for step in index["steps"]:
            if step.get("gate") is True and step.get("kind") != "verify":
                print(
                    f'  ERROR: "gate": true는 kind "verify" 스텝에서만 유효하다 '
                    f'(step {step["step"]})'
                )
                sys.exit(1)

    def _check_blockers(self):
        index = self._read_json(self._index_file)
        for s in reversed(index["steps"]):
            if s["status"] == "error":
                print(f"\n  ✗ Step {s['step']} ({s['name']}) failed.")
                print(f"  Error: {s.get('error_message', 'unknown')}")
                print(f"  Fix and reset status to 'pending' to retry.")
                sys.exit(1)
            if s["status"] == "blocked":
                print(f"\n  ⏸ Step {s['step']} ({s['name']}) blocked.")
                print(f"  Reason: {s.get('blocked_reason', 'unknown')}")
                print(f"  Resolve and reset status to 'pending' to retry.")
                sys.exit(2)
            if s["status"] != "pending":
                break

    def _ensure_created_at(self):
        index = self._read_json(self._index_file)
        if "created_at" not in index:
            index["created_at"] = self._stamp()
            self._write_json(self._index_file, index)

    # --- 실행 루프 ---

    def _execute_single_step(self, step: dict, guardrails: str) -> bool:
        """단일 step 실행 (재시도 포함). 완료되면 True, 실패/차단이면 False."""
        step_num, step_name = step["step"], step["name"]
        done = sum(1 for s in self._read_json(self._index_file)["steps"] if s["status"] == "completed")
        prev_error = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            index = self._read_json(self._index_file)
            step_context = self._build_step_context(index)
            preamble = self._build_preamble(
                guardrails,
                step_context,
                prev_error,
                verify=step.get("kind") == "verify",
            )

            tag = f"Step {step_num}/{self._total - 1} ({done} done): {step_name}"
            if attempt > 1:
                tag += f" [retry {attempt}/{self.MAX_RETRIES}]"

            with progress_indicator(tag) as pi:
                self._invoke_codex(step, preamble)
                elapsed = int(pi.elapsed)

            index = self._read_json(self._index_file)
            status = next((s.get("status", "pending") for s in index["steps"] if s["step"] == step_num), "pending")
            ts = self._stamp()

            if status == "completed":
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["completed_at"] = ts
                self._write_json(self._index_file, index)
                self._commit_step(step_num, step_name)
                print(f"  ✓ Step {step_num}: {step_name} [{elapsed}s]")
                return True

            if status == "refuted":
                if step.get("kind") == "verify":
                    for s in index["steps"]:
                        if s["step"] == step_num:
                            s["refuted_at"] = ts
                    self._write_json(self._index_file, index)
                    self._commit_step(step_num, step_name)
                    print(f"  ⊘ Step {step_num}: {step_name} refuted [{elapsed}s]")
                    return True
                err_msg = "status 'refuted'는 kind 'verify' 스텝에서만 유효하다"
            else:
                err_msg = next(
                    (s.get("error_message", "Step did not update status") for s in index["steps"] if s["step"] == step_num),
                    "Step did not update status",
                )

            if status == "blocked":
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["blocked_at"] = ts
                self._write_json(self._index_file, index)
                reason = next((s.get("blocked_reason", "") for s in index["steps"] if s["step"] == step_num), "")
                print(f"  ⏸ Step {step_num}: {step_name} blocked [{elapsed}s]")
                print(f"    Reason: {reason}")
                self._update_top_index("blocked")
                sys.exit(2)

            if attempt < self.MAX_RETRIES:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "pending"
                        s.pop("error_message", None)
                self._write_json(self._index_file, index)
                prev_error = err_msg
                print(f"  ↻ Step {step_num}: retry {attempt}/{self.MAX_RETRIES} — {err_msg}")
            else:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "error"
                        s["error_message"] = f"[{self.MAX_RETRIES}회 시도 후 실패] {err_msg}"
                        s["failed_at"] = ts
                self._write_json(self._index_file, index)
                self._commit_step(step_num, step_name)
                print(f"  ✗ Step {step_num}: {step_name} failed after {self.MAX_RETRIES} attempts [{elapsed}s]")
                print(f"    Error: {err_msg}")
                self._update_top_index("error")
                sys.exit(1)

        return False  # unreachable

    def _execute_all_steps(self, guardrails: str):
        while True:
            index = self._read_json(self._index_file)
            pending = next((s for s in index["steps"] if s["status"] == "pending"), None)
            if pending is None:
                print("\n  All steps completed!")
                return

            step_num = pending["step"]
            for s in index["steps"]:
                if s["step"] == step_num and "started_at" not in s:
                    s["started_at"] = self._stamp()
                    self._write_json(self._index_file, index)
                    break

            self._execute_single_step(pending, guardrails)

            index = self._read_json(self._index_file)
            finished = next(
                (s for s in index["steps"] if s["step"] == step_num),
                None,
            )
            remaining = [s["step"] for s in index["steps"] if s["status"] == "pending"]
            if (
                finished is not None
                and finished["status"] == "refuted"
                and finished.get("kind") == "verify"
                and finished.get("gate") is True
                and remaining
            ):
                print(
                    f"  ⏹ Gate Step {step_num} refuted; "
                    f"stopping before pending steps: {', '.join(str(step) for step in remaining)}"
                )
                return

    def _finalize(self):
        index = self._read_json(self._index_file)
        index["completed_at"] = self._stamp()
        self._write_json(self._index_file, index)
        gate_refuted = any(
            step.get("gate") is True and step.get("kind") == "verify" and step.get("status") == "refuted"
            for step in index["steps"]
        )
        has_pending_steps = any(step.get("status") == "pending" for step in index["steps"])
        self._update_top_index("refuted" if gate_refuted and has_pending_steps else "completed")

        self._run_git("add", "-A")
        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = f"chore({self._phase_name}): mark phase completed"
            r = self._run_git("commit", "-m", msg)
            if r.returncode == 0:
                print(f"  ✓ {msg}")

        if self._auto_push:
            branch = f"feat-{self._phase_name}"
            r = self._run_git("push", "-u", "origin", branch)
            if r.returncode != 0:
                print(f"\n  ERROR: git push 실패: {r.stderr.strip()}")
                sys.exit(1)
            print(f"  ✓ Pushed to origin/{branch}")

        print(f"\n{'='*60}")
        print(f"  Phase '{self._phase_name}' completed!")
        print(f"{'='*60}")


def main():
    _force_utf8_output()
    parser = argparse.ArgumentParser(description="Harness Step Executor")
    parser.add_argument("phase_dir", help="Phase directory name (e.g. 0-mvp)")
    parser.add_argument("--push", action="store_true", help="Push branch after completion")
    args = parser.parse_args()

    StepExecutor(args.phase_dir, auto_push=args.push).run()


if __name__ == "__main__":
    main()
