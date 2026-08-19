"""
ci/review-verdict.sh 판정 테스트.

/review-code 가 PR 리뷰 본문에 남긴 게이트 마커를 읽어
merge / approve / hold 중 무엇을 고르는지 검증한다.
판정 근거가 조금이라도 불확실하면 항상 hold(fail-closed)여야 한다.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

VERDICT = (Path(__file__).parent / "ci" / "review-verdict.sh").as_posix()
BASH = shutil.which("bash")
JQ = shutil.which("jq")
HEAD = "abc1234def5678"
BOT = "github-actions[bot]"

pytestmark = pytest.mark.skipif(
    BASH is None or JQ is None, reason="bash와 jq가 필요하다"
)


def marker(critical=0, major=0, minor=0, nit=0, failed=0, reviewed=None) -> str:
    """/review-code 가 리뷰 본문 끝에 남기는 게이트 마커."""
    fields = '"critical":%d,"major":%d,"minor":%d,"nit":%d,"failed_dimensions":%d' % (
        critical,
        major,
        minor,
        nit,
        failed,
    )
    # reviewed 는 "리뷰를 실제로 돌렸는가". 생략되면 참으로 본다 — 기존 마커와 호환.
    if reviewed is not None:
        fields += ',"reviewed":%s' % ("true" if reviewed else "false")
    return "<!-- review-code-gate: {%s} -->" % fields


def review(body: str, sha: str = HEAD, login: str = BOT) -> dict:
    return {"commit_id": sha, "body": body, "user": {"login": login}}


def run_verdict(reviews: list, head_sha: str = HEAD) -> dict:
    """리뷰 목록을 stdin으로 넘기고 decision=/reason= 출력을 파싱한다."""
    r = subprocess.run(
        [BASH, VERDICT],
        input=json.dumps(reviews, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        env={**os.environ, "HEAD_SHA": head_sha},
    )
    assert r.returncode == 0, f"verdict가 비정상 종료: {r.stderr}"
    out = {}
    for line in r.stdout.strip().splitlines():
        key, _, value = line.partition("=")
        out[key] = value
    assert set(out) == {"decision", "reason"}, f"예상 밖 출력: {r.stdout!r}"
    assert out["reason"], "사유가 비어 있으면 안 된다"
    return out


# ── 심각도별 판정 ────────────────────────────────────────────────


def test_지적_0건이면_머지한다():
    assert run_verdict([review("깨끗함\n" + marker())])["decision"] == "merge"


def test_nit만_있으면_머지한다():
    assert run_verdict([review(marker(nit=3))])["decision"] == "merge"


def test_minor가_있으면_승인만_한다():
    assert run_verdict([review(marker(minor=1, nit=2))])["decision"] == "approve"


def test_major가_있으면_보류한다():
    assert run_verdict([review(marker(major=1, nit=5))])["decision"] == "hold"


def test_critical이_있으면_보류한다():
    assert run_verdict([review(marker(critical=1))])["decision"] == "hold"


def test_critical과_major가_함께_있으면_보류한다():
    assert run_verdict([review(marker(critical=2, major=3))])["decision"] == "hold"


# ── fail-closed 조건 ────────────────────────────────────────────


def test_차원_리뷰가_실패했으면_지적_0건이어도_보류한다():
    assert run_verdict([review(marker(failed=1))])["decision"] == "hold"


def test_마커가_없으면_보류한다():
    assert run_verdict([review("리뷰는 돌았지만 마커가 없다")])["decision"] == "hold"


def test_리뷰가_아예_없으면_보류한다():
    assert run_verdict([])["decision"] == "hold"


def test_stdin이_비어_있으면_보류한다():
    r = subprocess.run(
        [BASH, VERDICT],
        input="",
        capture_output=True,
        text=True,
        encoding="utf-8",
        env={**os.environ, "HEAD_SHA": HEAD},
    )
    assert r.returncode == 0
    assert "decision=hold" in r.stdout


def test_다른_커밋의_리뷰는_인정하지_않는다():
    stale = review(marker(nit=1), sha="0000000dead")
    assert run_verdict([stale])["decision"] == "hold"


def test_봇이_아닌_사용자가_남긴_마커는_인정하지_않는다():
    spoofed = review(marker(), login="drive-by-contributor")
    assert run_verdict([spoofed])["decision"] == "hold"


def test_마커_JSON이_깨졌으면_보류한다():
    broken = review('<!-- review-code-gate: {"critical":"없음"} -->')
    assert run_verdict([broken])["decision"] == "hold"


def test_필드가_빠진_마커는_보류한다():
    partial = review('<!-- review-code-gate: {"critical":0,"major":0} -->')
    assert run_verdict([partial])["decision"] == "hold"


# ── 여러 리뷰가 쌓인 경우 ────────────────────────────────────────


def test_같은_커밋에_마커가_여러_개면_마지막_것을_쓴다():
    reviews = [review(marker(critical=1)), review(marker(nit=1))]
    assert run_verdict(reviews)["decision"] == "merge"


def test_이전_커밋의_깨끗한_마커가_현재_커밋_판정을_덮지_않는다():
    reviews = [
        review(marker(), sha="0000000dead"),
        review(marker(major=1)),
    ]
    assert run_verdict(reviews)["decision"] == "hold"


def test_사람이_남긴_리뷰가_섞여_있어도_봇_마커로_판정한다():
    reviews = [
        review("LGTM 👍", login="Dan-Seo"),
        review(marker(nit=1)),
    ]
    assert run_verdict(reviews)["decision"] == "merge"


def test_사유에_심각도_집계가_담긴다():
    out = run_verdict([review(marker(critical=1, major=2))])
    assert "1" in out["reason"] and "2" in out["reason"]


# ── 리뷰를 돌리지 않은 마커 ──────────────────────────────────────
# 리뷰 대상이 0개면 review-carryforward.sh 가 지적 0건 마커를 게시한다. 그 마커가
# "리뷰 결과 깨끗함"과 구별되지 않으면, 리뷰 대상 밖 파일(.claude/*·CLAUDE.md 등)만
# 고친 PR 이 아무 리뷰 없이 자동 머지된다 — PR #41 리뷰의 critical.


def test_리뷰를_돌리지_않았으면_머지하지_않고_승인만_한다():
    out = run_verdict([review(marker(reviewed=False))])
    assert out["decision"] == "approve"


def test_리뷰를_돌렸다고_명시하면_기존대로_머지한다():
    assert run_verdict([review(marker(reviewed=True))])["decision"] == "merge"


def test_reviewed_필드가_없는_기존_마커는_머지한다():
    assert run_verdict([review(marker())])["decision"] == "merge"
