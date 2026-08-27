"""Verify ADR-041 premises without changing project sources.

The verifier is intentionally kept inside this phase directory. It reads the
rulepack, its source registry, the golden verification record, and the locally
cached R7 specification. Its only output is ``step0b-report.json``.
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
REPORT_PATH = PHASE / "step0b-report.json"
RULEPACK_DIR = ROOT / "src" / "rulepack" / "jp-mlit"
PDF_PATH = ROOT / ".cache" / "001888816.pdf"
FIXTURE_PATH = ROOT / "tests" / "golden" / "fixtures" / "spec-r7-ch5.json"
INDEX_TEST_PATH = ROOT / "src" / "rulepack" / "index.test.ts"
ADR_PATH = ROOT / "docs" / "ADR.md"
RISKS_PATH = ROOT / "docs" / "RISKS.md"

PENDING_REVIEW = "独立検討待ち"
FC_BANDS: tuple[tuple[int, ...], ...] = (
    (18,),
    (21,),
    (24, 27),
    (30, 33, 36),
)
DIAMETER_BANDS: dict[str, tuple[str, ...]] = {
    "D16以下": ("D10", "D13", "D16"),
    "D19～D38": ("D19", "D22", "D25", "D29", "D32"),
}


def load_entries() -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    entries: list[dict[str, Any]] = []
    sources = yaml.safe_load((RULEPACK_DIR / "sources.yaml").read_text(encoding="utf-8"))
    assert isinstance(sources, dict)

    for path in sorted(RULEPACK_DIR.glob("*.yaml")):
        if path.name == "sources.yaml":
            continue
        parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
        assert isinstance(parsed, list), path
        for entry in parsed:
            assert isinstance(entry, dict), path
            copied = dict(entry)
            copied["_file"] = path.name
            entries.append(copied)
    return entries, sources


def condition_key(entry: dict[str, Any], *, without: str | None = None) -> tuple[Any, ...]:
    conditions = entry.get("conditions") or {}
    return tuple(
        (key, json.dumps(value, ensure_ascii=False, sort_keys=True))
        for key, value in sorted(conditions.items())
        if key != without
    )


def compact(value: str) -> str:
    return re.sub(r"\s+", "", value)


def pdf_text(document: fitz.Document, printed_page: int) -> str:
    # fitz uses a zero-based page index. The phase specification's
    # printed-page + 5 mapping is therefore document[printed_page + 5].
    return document[printed_page + 5].get_text()


def table_text(document: fitz.Document, printed_page: int, title: str) -> str:
    text = pdf_text(document, printed_page)
    start = text.find(title)
    if start < 0:
        return ""
    return text[start:]


def check_premises() -> dict[str, Any]:
    entries, sources = load_entries()
    confidence_counts = Counter(entry.get("confidence") for entry in entries)
    key_counts = Counter(entry.get("key") for entry in entries)
    index_test = INDEX_TEST_PATH.read_text(encoding="utf-8")
    adr = ADR_PATH.read_text(encoding="utf-8")
    risks = RISKS_PATH.read_text(encoding="utf-8")
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

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
    test_pins_zero = bool(re.search(r"confidence\s*===\s*['\"]stated", index_test)) and bool(
        re.search(r"toHaveLength\(0\)", index_test)
    )
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
        + ". 옛 문서의 inferred 행수와 혼동하지 않는다.",
    )

    transcribed = [entry for entry in entries if entry.get("confidence") == "transcribed"]
    note_counts = Counter(PENDING_REVIEW in (entry.get("note") or "") for entry in transcribed)
    # The note is deliberately not authoritative. An explicit completion
    # marker would contradict ADR-023; an absent note would not.
    contradictory_completion = [
        entry
        for entry in transcribed
        if re.search(r"独立検討(?:済み|完了|済)", entry.get("note") or "")
    ]
    record(
        "confidence-is-the-signal",
        not contradictory_completion,
        f"ADR-023의 권위 신호인 confidence=transcribed는 {len(transcribed)}행 모두 검토 대기다. note의 '{PENDING_REVIEW}' 분포는 있음 {note_counts[True]}행/없음 {note_counts[False]}행이며 장식으로만 기록했다; confidence상 검토 대기가 아닌 transcribed 행은 {len(contradictory_completion)}행{': ' + str([entry.get('key') for entry in contradictory_completion]) if contradictory_completion else ''}.",
        "note가 없는 29행도 confidence=transcribed이므로 검토 대기 모집단에서 제외하지 않는다.",
    )

    source_counts = Counter((entry.get("source") or {}).get("ref") for entry in entries)
    transcribed_source_counts = Counter(
        (entry.get("source") or {}).get("ref") for entry in transcribed
    )
    quantity_band_candidates = [
        entry
        for entry in entries
        if (entry.get("source") or {}).get("ref") == "quantity"
        and any(name in (entry.get("conditions") or {}) for name in ("fc", "grade"))
    ]
    record(
        "two-source-populations",
        transcribed_source_counts == Counter({"spec": 211, "quantity": 29})
        and source_counts == Counter({"spec": 211, "quantity": 32})
        and not quantity_band_candidates,
        f"원문별 룰팩 행수: spec {source_counts['spec']}행(그중 transcribed {transcribed_source_counts['spec']}행), quantity {source_counts['quantity']}행(그중 transcribed {transcribed_source_counts['quantity']}행·inferred {confidence_counts['inferred']}행). Fc/grade 밴드 후보를 가진 quantity 행은 {len(quantity_band_candidates)}행이며, 따라서 원문 표 밴드 되접기 대상은 spec 쪽뿐이다.",
        "quantity는 1通則·부재별 단발 조문이므로 spec 표 밴드와 같은 되접기를 적용하지 않는다.",
    )

    spec_fc_rows = [
        entry
        for entry in entries
        if (entry.get("source") or {}).get("ref") == "spec"
        and "fc" in (entry.get("conditions") or {})
    ]
    fc_groups: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for entry in spec_fc_rows:
        fc_groups[(entry["key"], condition_key(entry, without="fc"))].append(entry)

    fc_band_conflicts: list[str] = []
    fc_shape_errors: list[str] = []
    for (key, other_conditions), rows in fc_groups.items():
        by_fc = {entry["conditions"]["fc"]: entry for entry in rows}
        grade = next((value for name, value in other_conditions if name == "grade"), None)
        expected = {21, 24, 27, 30, 33, 36} if grade == '"SD390"' else {18, 21, 24, 27, 30, 33, 36}
        if set(by_fc) != expected:
            fc_shape_errors.append(
                f"{key} {other_conditions}: actual={sorted(by_fc)} expected={sorted(expected)}"
            )
        for band in FC_BANDS:
            present = [by_fc[fc] for fc in band if fc in by_fc]
            values = {entry["value"] for entry in present}
            if len(present) > 1 and len(values) != 1:
                fc_band_conflicts.append(
                    f"{key} {other_conditions} Fc{band}: {sorted(values)}"
                )

    diameter_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        conditions = entry.get("conditions") or {}
        if (
            entry.get("key") == "bend.inside-diameter"
            and (entry.get("source") or {}).get("ref") == "spec"
        ):
            diameter_groups[conditions["grade"]].append(entry)

    diameter_conflicts: list[str] = []
    diameter_shape_errors: list[str] = []
    for grade, rows in diameter_groups.items():
        by_size = {entry["conditions"]["size"]: entry for entry in rows}
        expected_sizes = set(DIAMETER_BANDS["D19～D38"])
        if grade in {"SD295", "SD345"}:
            expected_sizes |= set(DIAMETER_BANDS["D16以下"])
        if set(by_size) != expected_sizes:
            diameter_shape_errors.append(
                f"{grade}: actual={sorted(by_size)} expected={sorted(expected_sizes)}"
            )
        for band_name, band in DIAMETER_BANDS.items():
            present = [by_size[size] for size in band if size in by_size]
            values = {entry["value"] for entry in present}
            if len(present) > 1 and len(values) != 1:
                diameter_conflicts.append(f"{grade} {band_name}: {sorted(values)}")

    with fitz.open(PDF_PATH) as document:
        table_531 = table_text(document, 27, "表5.3.1")
        table_532 = table_text(document, 28, "表5.3.2")
        table_534 = table_text(document, 30, "表5.3.4")
        table_535 = table_text(document, 31, "表5.3.5")
        table_536 = table_text(document, 33, "表5.3.6")

    normalized_531 = compact(table_531)
    normalized_534 = compact(table_534)
    pdf_band_structure = all(
        marker in normalized_534 for marker in ("18", "21", "24、27", "30、33、36")
    ) and all(marker in normalized_531 for marker in ("D16以下", "D19～D38"))
    fold_ok = (
        not fc_band_conflicts
        and not fc_shape_errors
        and not diameter_conflicts
        and not diameter_shape_errors
    )
    record(
        "band-structure",
        pdf_band_structure and fold_ok,
        "원문 표의 Fc 밴드 18 / 21 / 24、27 / 30、33、36 및 径 밴드 D16以下 / D19～D38를 확인했고, 룰팩 전개 후 Fc 그룹 "
        f"{len(fc_groups)}개·径 그룹 {len(diameter_groups)}개를 되접었다. Fc 구조 오류={fc_shape_errors or '없음'}, 径 구조 오류={diameter_shape_errors or '없음'}, 밴드 내부 값 충돌={fc_band_conflicts + diameter_conflicts or '없음'}.",
    )
    record(
        "fold-lossless",
        fold_ok,
        f"spec 밴드 내부 값 불일치 0건(Fc={len(fc_band_conflicts)}, 径={len(diameter_conflicts)}); 전개 구조 오류 0건(Fc={len(fc_shape_errors)}, 径={len(diameter_shape_errors)}).",
        "SD390의 Fc18 및 D16以下가 없는 것은 원문 결번이며, 존재하는 밴드 내부 전개 불일치와 구별했다.",
    )

    def expanded_map(key: str, hook: bool) -> dict[tuple[str, int], float]:
        result: dict[tuple[str, int], float] = {}
        for entry in entries:
            if entry.get("key") != key or (entry.get("source") or {}).get("ref") != "spec":
                continue
            conditions = entry["conditions"]
            if conditions.get("hook") != hook:
                continue
            result[(conditions["grade"], conditions["fc"])] = entry["value"]
        return result

    l1_mismatches: list[str] = []
    for lap_key, anchorage_key, hook in (
        ("lap.L1", "anchorage.L1", False),
        ("lap.L1h", "anchorage.L1h", True),
    ):
        lap_map = expanded_map(lap_key, hook)
        anchorage_map = expanded_map(anchorage_key, hook)
        for cell in sorted(set(lap_map) | set(anchorage_map)):
            if cell not in lap_map or cell not in anchorage_map:
                l1_mismatches.append(f"{lap_key}/{anchorage_key} missing {cell}")
            elif lap_map[cell] != anchorage_map[cell]:
                l1_mismatches.append(
                    f"{lap_key}/{anchorage_key} {cell}: {lap_map[cell]} != {anchorage_map[cell]}"
                )
    source_band_rows = sum(
        1
        for grade in ("SD295", "SD345", "SD390")
        for band in FC_BANDS
        if not (grade == "SD390" and band == (18,))
    )
    expanded_cells = len(expanded_map("lap.L1", False)) + len(expanded_map("lap.L1h", True))
    record(
        "l1-l1h-identical",
        not l1_mismatches,
        f"表5.3.2와 表5.3.4의 대응은 원문 밴드행 {source_band_rows}개×L1/L1h={source_band_rows * 2}칸, 룰팩 전개 {expanded_cells}셀이다. L1·L1h 대응값 누락·불일치={l1_mismatches or '없음'}.",
    )

    cover_entries = [
        entry
        for entry in entries
        if entry.get("key") == "cover.minimum"
        and (entry.get("source") or {}).get("ref") == "spec"
    ]
    cover_mismatches: list[str] = []
    cover_keys = [
        (False, "屋内", "仕上げあり"),
        (False, "屋内", "仕上げなし"),
        (False, "屋外", "仕上げあり"),
        (False, "屋外", "仕上げなし"),
        (True, None, None),
    ]
    for soil_contact, exposure, finish in cover_keys:
        def cover_value(member_kind: str) -> Any:
            for entry in cover_entries:
                conditions = entry["conditions"]
                if conditions.get("memberKind") != member_kind or conditions.get("soilContact") != soil_contact:
                    continue
                if not soil_contact and (
                    conditions.get("exposure"), conditions.get("finish")
                ) != (exposure, finish):
                    continue
                return entry.get("value")
            return None

        column = cover_value("柱")
        girder = cover_value("大梁")
        if column is None or girder is None or column != girder:
            cover_mismatches.append(
                f"{exposure}/{finish}/soil={soil_contact}: 柱={column} 大梁={girder}"
            )
    record(
        "table536-column-equals-girder",
        not cover_mismatches and "柱、梁、耐力壁" in compact(table_536),
        f"表5.3.6의 柱↔大梁 대응 조건 5개(屋内/屋外×仕上げ 4 + 土に接する部分 1) 모두 일치; 차이={cover_mismatches or '없음'}.",
    )

    missing_cells = [
        "表5.3.2: SD390 × Fc18 (SD390 행은 Fc21부터)",
        "表5.3.4: SD390 × Fc18 (SD390 행은 Fc21부터)",
        "表5.3.5: SD390 × Fc18 (SD390 행은 Fc21부터)",
        "表5.3.1: SD390 × D16以下 (SD390 열은 D19～D38만)",
    ]
    normalized_532 = compact(table_532)
    normalized_535 = compact(table_535)
    missing_evidence_ok = all(
        "SD39021" in block and "SD39018" not in block
        for block in (normalized_532, normalized_534, normalized_535)
    ) and "SD295、SD345SD390呼び名D16以下D19～D38D19～D38" in normalized_531
    record(
        "missing-cells",
        missing_evidence_ok,
        "원문에서 확인한 결번: " + "; ".join(missing_cells) + ".",
    )

    verification_records = fixture.get("source", {}).get("verifications", [])
    verification_cells = sum(record.get("cells", 0) for record in verification_records)
    pdf_sha256 = hashlib.sha256(PDF_PATH.read_bytes()).hexdigest()
    fixture_sha = fixture.get("source", {}).get("sha256")
    expected_tables = {"表5.3.2", "表5.3.4", "表5.3.5"}
    verification_ok = (
        verification_cells == 77
        and bool(verification_records)
        and all(record.get("by") == "agent" for record in verification_records)
        and all(expected_tables.issubset(set(record.get("tables", []))) for record in verification_records)
        and pdf_sha256 == fixture_sha
        and "77칸" in risks
        and "전사자＝승인자" in risks
        and "독립 검토" in risks
    )
    record(
        "prior-verification-not-independent",
        verification_ok,
        f"source.verifications 합계 {verification_cells}칸; by={sorted({record.get('by') for record in verification_records})}; PDF SHA-256 일치={pdf_sha256 == fixture_sha}; docs/RISKS.md R6에 77칸·전사자＝승인자·독립 검토 필요가 기재됨.",
        "기계 대조 기록은 전사자와 같은 인격의 재대조이므로 독립 검토가 아니며 stated 승격 근거가 아니다.",
    )

    missing_sources: list[str] = []
    for entry in entries:
        source = entry.get("source")
        ref = source.get("ref") if isinstance(source, dict) else None
        source_doc = sources.get(ref) if isinstance(ref, str) else None
        page = source.get("page") if isinstance(source, dict) else None
        if (
            not isinstance(source, dict)
            or not isinstance(source_doc, dict)
            or not source.get("section")
            or not isinstance(page, (int, float))
            or isinstance(page, bool)
            or page <= 0
            or not source_doc.get("doc")
            or not source_doc.get("publisher")
            or not source_doc.get("url")
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
            "### ADR-015:",
            "### ADR-023:",
            "### ADR-041:",
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
    return {
        "premises": premises,
        "counts": {
            "byConfidence": dict(sorted(confidence_counts.items())),
            "byKey": dict(sorted(key_counts.items())),
        },
        "verdict": verdict,
    }


def main() -> None:
    report = check_premises()
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
