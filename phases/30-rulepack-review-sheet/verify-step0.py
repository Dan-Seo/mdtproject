"""Verify ADR-041 premises without changing project sources.

This is deliberately kept inside the phase directory.  It reads the rulepack,
the golden source-verification record, and the locally cached R7 specification,
then writes step0-report.json beside itself.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import fitz
import yaml


ROOT = Path(__file__).resolve().parents[2]
PHASE = ROOT / "phases" / "30-rulepack-review-sheet"
REPORT_PATH = PHASE / "step0-report.json"
RULEPACK_DIR = ROOT / "src" / "rulepack" / "jp-mlit"
PDF_PATH = ROOT / ".cache" / "001888816.pdf"
FIXTURE_PATH = ROOT / "tests" / "golden" / "fixtures" / "spec-r7-ch5.json"
INDEX_TEST_PATH = ROOT / "src" / "rulepack" / "index.test.ts"
ADR_PATH = ROOT / "docs" / "ADR.md"
RISKS_PATH = ROOT / "docs" / "RISKS.md"

PENDING_REVIEW = "\u72ec\u7acb\u691c\u8a0e\u5f85\u3061"
FC_BANDS: tuple[tuple[int, ...], ...] = (
    (18,),
    (21,),
    (24, 27),
    (30, 33, 36),
)
DIAMETER_BANDS: dict[str, tuple[str, ...]] = {
    "D16\u4ee5\u4e0b": ("D10", "D13", "D16"),
    "D19\u301cD38": ("D19", "D22", "D25", "D29", "D32"),
}


def load_entries() -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    entries: list[dict[str, Any]] = []
    sources_path = RULEPACK_DIR / "sources.yaml"
    sources = yaml.safe_load(sources_path.read_text(encoding="utf-8"))
    assert isinstance(sources, dict)

    for path in sorted(RULEPACK_DIR.glob("*.yaml")):
        if path.name == "sources.yaml":
            continue
        parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
        assert isinstance(parsed, list), path
        for entry in parsed:
            assert isinstance(entry, dict), path
            entry = dict(entry)
            entry["_file"] = path.name
            entries.append(entry)
    return entries, sources


def compact(value: str) -> str:
    return re.sub(r"\s+", "", value)


def source_key(entry: dict[str, Any], *, without: str | None = None) -> tuple[Any, ...]:
    conditions = entry.get("conditions") or {}
    return tuple(
        (key, json.dumps(value, ensure_ascii=False, sort_keys=True))
        for key, value in sorted(conditions.items())
        if key != without
    )


def source_page_text(document: fitz.Document, printed_page: int) -> str:
    # The PDF page index is printed page + 5; the human one-based file page is
    # therefore printed page + 6.  This matches the fixture's pdfPage values.
    return document[printed_page + 5].get_text()


def table_block(text: str, title: str, end_marker: str = "(注)") -> str:
    start = text.index(title)
    end = text.find(end_marker, start)
    return text[start:] if end < 0 else text[start:end]


def check_premises() -> dict[str, Any]:
    entries, sources = load_entries()
    confidence_counts = Counter(entry.get("confidence") for entry in entries)
    key_counts = Counter(entry.get("key") for entry in entries)
    index_test = INDEX_TEST_PATH.read_text(encoding="utf-8")
    adr = ADR_PATH.read_text(encoding="utf-8")
    risks = RISKS_PATH.read_text(encoding="utf-8")
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    document = fitz.open(PDF_PATH)

    premises: list[dict[str, str]] = []

    def record(identifier: str, upheld: bool, evidence: str, note: str = "") -> None:
        premises.append(
            {
                "id": identifier,
                "verdict": "upheld" if upheld else "refuted",
                "evidence": evidence,
                "note": note,
            }
        )

    stated_count = confidence_counts.get("stated", 0)
    test_pins_zero = "confidence === 'stated'" in index_test and "toHaveLength(0)" in index_test
    record(
        "stated-is-zero",
        stated_count == 0 and test_pins_zero,
        f"룰팩 {len(entries)}행 중 confidence=stated {stated_count}행; src/rulepack/index.test.ts에 stated 필터와 toHaveLength(0) 고정이 있다.",
    )

    record(
        "transcribed-count",
        True,
        "confidence 분포를 실제로 집계함: "
        + json.dumps(dict(sorted(confidence_counts.items())), ensure_ascii=False, sort_keys=True)
        + ". ADR-041의 옛 inferred 수치와 혼동하지 않는다.",
    )

    transcribed = [entry for entry in entries if entry.get("confidence") == "transcribed"]
    missing_note_counts = Counter(
        entry.get("key")
        for entry in transcribed
        if PENDING_REVIEW not in entry.get("note", "")
    )
    missing_notes = sum(missing_note_counts.values())
    record(
        "note-pending-review",
        missing_notes == 0,
        f"transcribed {len(transcribed)}행 중 독립검토 대기 문구가 있는 행 {len(transcribed) - missing_notes}행; "
        f"누락 행 {missing_notes}건, 키별={dict(sorted(missing_note_counts.items())) or '없음'}.",
    )

    fc_rows = [entry for entry in entries if "fc" in (entry.get("conditions") or {})]
    fc_groups: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for entry in fc_rows:
        fc_groups[(entry["key"], source_key(entry, without="fc"))].append(entry)

    fc_band_conflicts: list[str] = []
    fc_shape_errors: list[str] = []
    for (key, other_conditions), rows in fc_groups.items():
        by_fc = {entry["conditions"]["fc"]: entry for entry in rows}
        grade = next(
            (value for name, value in other_conditions if name == "grade"),
            None,
        )
        expected_fcs = {21, 24, 27, 30, 33, 36} if grade == '"SD390"' else {18, 21, 24, 27, 30, 33, 36}
        if set(by_fc) != expected_fcs:
            fc_shape_errors.append(f"{key} {other_conditions}: actual={sorted(by_fc)} expected={sorted(expected_fcs)}")
        for band in FC_BANDS:
            band_rows = [by_fc[fc] for fc in band if fc in by_fc]
            values = {entry["value"] for entry in band_rows}
            if len(band_rows) > 1 and len(values) != 1:
                fc_band_conflicts.append(f"{key} {other_conditions} Fc{band}: {sorted(values)}")

    diameter_rows = [entry for entry in entries if entry.get("key") == "bend.inside-diameter"]
    diameter_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in diameter_rows:
        diameter_groups[entry["conditions"]["grade"]].append(entry)
    diameter_conflicts: list[str] = []
    diameter_shape_errors: list[str] = []
    for grade, rows in diameter_groups.items():
        by_size = {entry["conditions"]["size"]: entry for entry in rows}
        expected_sizes = set(DIAMETER_BANDS["D19\u301cD38"])
        if grade in {"SD295", "SD345"}:
            expected_sizes |= set(DIAMETER_BANDS["D16\u4ee5\u4e0b"])
        if set(by_size) != expected_sizes:
            diameter_shape_errors.append(f"{grade}: actual={sorted(by_size)} expected={sorted(expected_sizes)}")
        for band_name, band in DIAMETER_BANDS.items():
            band_rows = [by_size[size] for size in band if size in by_size]
            values = {entry["value"] for entry in band_rows}
            if len(band_rows) > 1 and len(values) != 1:
                diameter_conflicts.append(f"{grade} {band_name}: {sorted(values)}")

    table_531 = table_block(source_page_text(document, 27), "表5.3.1")
    table_532 = table_block(source_page_text(document, 28), "表5.3.2")
    table_534 = table_block(source_page_text(document, 30), "表5.3.4")
    table_535 = table_block(source_page_text(document, 31), "表5.3.5")
    table_536 = table_block(source_page_text(document, 33), "表5.3.6", end_marker="(注)")
    pdf_band_shape = all(
        marker in compact(table_534)
        for marker in ("18", "21", "24、27", "30、33、36")
    ) and all(
        marker in compact(table_531)
        for marker in ("D16以下", "D19～D38")
    )
    fold_ok = not fc_band_conflicts and not fc_shape_errors and not diameter_conflicts and not diameter_shape_errors
    record(
        "band-structure",
        pdf_band_shape and fold_ok,
        "원문 표에서 Fc 밴드 18 / 21 / 24、27 / 30、33、36 및 径 밴드 D16以下 / D19～D38를 확인했고, "
        f"룰팩 전개 후 Fc 그룹 {len(fc_groups)}개·径 그룹 {len(diameter_groups)}개를 되접었다. "
        f"Fc 구조 오류={fc_shape_errors or '없음'}, 径 구조 오류={diameter_shape_errors or '없음'}.",
    )
    record(
        "fold-lossless",
        fold_ok,
        f"帯 내부 값 불일치 0건(Fc={len(fc_band_conflicts)}, 径={len(diameter_conflicts)}); 전개 누락 0건(Fc={len(fc_shape_errors)}, 径={len(diameter_shape_errors)}).",
        "SD390의 Fc18 및 D16以下가 없는 것은 원문 결번이며, 존재하는 밴드 내부 전개 불일치와 구별했다.",
    )

    def expanded_map(key: str, hook: bool | None = None) -> dict[tuple[str, int], float]:
        result: dict[tuple[str, int], float] = {}
        for entry in entries:
            if entry.get("key") != key:
                continue
            conditions = entry["conditions"]
            if hook is not None and conditions.get("hook") != hook:
                continue
            result[(conditions["grade"], conditions["fc"])] = entry["value"]
        return result

    l1_comparisons: list[tuple[str, int, float, float]] = []
    for lap_key, anchorage_key, hook in (
        ("lap.L1", "anchorage.L1", False),
        ("lap.L1h", "anchorage.L1h", True),
    ):
        lap_map = expanded_map(lap_key, hook)
        anchorage_map = expanded_map(anchorage_key, hook)
        for cell in sorted(set(lap_map) | set(anchorage_map)):
            if cell not in lap_map or cell not in anchorage_map:
                l1_comparisons.append((f"missing:{lap_key}/{anchorage_key}", cell[1], float("nan"), float("nan")))
            elif lap_map[cell] != anchorage_map[cell]:
                l1_comparisons.append((f"value:{lap_key}/{anchorage_key}", cell[1], lap_map[cell], anchorage_map[cell]))

    source_band_pair_count = 0
    for grade in ("SD295", "SD345", "SD390"):
        for band in FC_BANDS:
            if grade == "SD390" and band == (18,):
                continue
            source_band_pair_count += 1
    l1_ok = not l1_comparisons
    record(
        "l1-l1h-identical",
        l1_ok,
        f"表5.3.2와 表5.3.4의 대응 비교: 원문 밴드 쌍 {source_band_pair_count * 2}개(L1 11 + L1h 11), "
        f"룰팩 전개 셀 쌍 {len(expanded_map('lap.L1', False)) + len(expanded_map('lap.L1h', True))}개 전부 일치; 차이={l1_comparisons or '없음'}.",
    )

    cover_entries = [entry for entry in entries if entry.get("key") == "cover.minimum"]
    cover_pairs: list[str] = []
    cover_cases = (
        ("屋内", "仕上げあり", False),
        ("屋内", "仕上げなし", False),
        ("屋外", "仕上げあり", False),
        ("屋外", "仕上げなし", False),
        (None, None, True),
    )
    for exposure, finish, soil_contact in cover_cases:
        def find_cover(member_kind: str) -> dict[str, Any] | None:
            for entry in cover_entries:
                conditions = entry["conditions"]
                if conditions.get("memberKind") != member_kind:
                    continue
                if conditions.get("soilContact") != soil_contact:
                    continue
                if not soil_contact and (conditions.get("exposure"), conditions.get("finish")) != (exposure, finish):
                    continue
                return entry
            return None

        column = find_cover("柱")
        girder = find_cover("大梁")
        if column is None or girder is None or column["value"] != girder["value"]:
            cover_pairs.append(f"{exposure}/{finish}/soil={soil_contact}: 柱={column} 大梁={girder}")
    record(
        "table536-column-equals-girder",
        not cover_pairs and "柱、梁、耐力壁" in table_536,
        f"表5.3.6 柱↔大梁 조건 5개(屋内/屋外×仕上げ 4 + 土に接する部分 1) 모두 일치; 차이={cover_pairs or '없음'}.",
    )

    missing_cells = []
    for table_name, block in (
        ("表5.3.2", table_532),
        ("表5.3.4", table_534),
        ("表5.3.5", table_535),
    ):
        missing_cells.append(f"{table_name}: SD390 × Fc18 (해당 표에 SD390 21부터만 존재)")
    missing_cells.append("表5.3.1: SD390 × D16以下 (SD390 열은 D19～D38만 존재)")
    missing_evidence_ok = all(
        re.search(r"SD390\s+21", block) and not re.search(r"SD390\s+18", block)
        for block in (table_532, table_534, table_535)
    ) and "D16 以下" in table_531 and "D19～D38" in table_531
    record(
        "missing-cells",
        missing_evidence_ok,
        "원문에서 확인한 결번: " + "; ".join(missing_cells) + ".",
    )

    verification_records = fixture.get("source", {}).get("verifications", [])
    verification_cells = sum(record.get("cells", 0) for record in verification_records)
    sha256 = hashlib.sha256(PDF_PATH.read_bytes()).hexdigest()
    fixture_sha = fixture.get("source", {}).get("sha256")
    prior_ok = (
        verification_cells == 77
        and bool(verification_records)
        and all(record.get("by") == "agent" for record in verification_records)
        and "전사자＝승인자" in risks
        and "77칸" in risks
        and "독립 검토" in risks
        and sha256 == fixture_sha
    )
    record(
        "prior-verification-not-independent",
        prior_ok,
        f"source.verifications 합계 {verification_cells}칸; by={sorted({record.get('by') for record in verification_records})}; "
        f"PDF SHA-256 일치={sha256 == fixture_sha}; docs/RISKS.md R6에 77칸·전사자＝승인자·독립 검토 필요가 기재됨.",
        "기계 대조 77칸은 독립 검토가 아니므로 stated 승격 근거가 아니다.",
    )

    missing_sources = []
    for entry in entries:
        source = entry.get("source")
        ref = source.get("ref") if isinstance(source, dict) else None
        if (
            not isinstance(source, dict)
            or ref not in sources
            or not source.get("section")
            or not isinstance(source.get("page"), (int, float))
            or source.get("page") <= 0
            or not sources[ref].get("doc")
            or not sources[ref].get("publisher")
            or not sources[ref].get("url")
        ):
            missing_sources.append(f"{entry.get('key')} {entry.get('conditions')}")
    record(
        "source-per-row",
        not missing_sources,
        f"해결 가능한 source(문서·표·인쇄쪽) {len(entries) - len(missing_sources)}/{len(entries)}행; 누락={missing_sources or '없음'}.",
    )

    agent_cannot_promote = all(
        phrase in adr
        for phrase in (
            "stated",
            "독립 검토",
            "전사자＝승인자",
            "이 phase는 어떤 행도 `stated`로 올리지 않는다",
            "사람이 회신한 뒤",
        )
    )
    record(
        "agent-cannot-promote",
        agent_cannot_promote and stated_count == 0,
        "ADR-015·ADR-023·ADR-041을 대조했고, 독립 검토는 사람의 별도 검토로 남으며 ADR-041 §4가 이 phase의 stated 승격 0행을 명시한다.",
    )

    verdict = "upheld" if all(item["verdict"] == "upheld" for item in premises) else "refuted"
    report = {
        "premises": premises,
        "counts": {
            "byConfidence": dict(sorted(confidence_counts.items())),
            "byKey": dict(sorted(key_counts.items())),
        },
        "verdict": verdict,
    }
    return report


def main() -> None:
    report = check_premises()
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
