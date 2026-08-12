"""Transcribe the R7 specification chapter 5 tables into a golden fixture.

The PDF's logical text order is not reliable for merged cells in 表5.3.4.
This script therefore uses PyMuPDF's spatial table extraction, asserts the
source row structure, and renders every source table for visual comparison.
The four hook-tail values in 表5.3.1 are manual readings of its raster diagram.
"""

from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from typing import Any

import fitz


ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / ".cache"
PDF_PATH = CACHE_DIR / "001888816.pdf"
FIXTURE_PATH = ROOT / "tests" / "golden" / "fixtures" / "spec-r7-ch5.json"

SOURCE_URL = "https://www.mlit.go.jp/gobuild/content/001888816.pdf"
SOURCE_SHA256 = "8fd3c83ca92b01a26e53071efdb3e871e4b5672583f8473ba062cbcc45759acc"

PAGE_META = {
    33: 27,
    34: 28,
    36: 30,
    37: 31,
    39: 33,
}

TABLE_PAGES = {
    "表5.3.1": 33,
    "表5.3.2": 34,
    "表5.3.4": 36,
    "表5.3.5": 37,
    "表5.3.6": 39,
}


def verify_pdf() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(
            f"Missing {PDF_PATH}. Download the canonical PDF from {SOURCE_URL}."
        )

    digest = hashlib.sha256(PDF_PATH.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise RuntimeError(
            "Canonical PDF hash mismatch: "
            f"expected {SOURCE_SHA256}, received {digest}"
        )


def normalized(text: str) -> str:
    return unicodedata.normalize("NFKC", text).replace(" ", "")


def parse_d(cell: str | None) -> int:
    if not cell:
        raise ValueError("Expected a d-multiple cell, received an empty cell")

    match = re.search(r"(\d+)d", normalized(cell))
    if not match:
        raise ValueError(f"Expected a d-multiple cell, received {cell!r}")
    return int(match.group(1))


def fc_conditions(cell: str | None) -> dict[str, Any]:
    """Fc帯 셀은 「30、33、36」처럼 이산값을 직접 열거한다 — 帯 표기와 함께
    전개값(fcValues)도 전사한다 (골든테스트의 대역 전값 대조 근거)."""
    if not cell:
        raise ValueError("Expected an Fc band, received an empty cell")

    values = re.findall(r"\d+", normalized(cell))
    if not values:
        raise ValueError(f"Expected an Fc band, received {cell!r}")

    band = values[0] if len(values) == 1 else f"{values[0]}-{values[-1]}"
    return {"fcBand": band, "fcValues": [int(value) for value in values]}


# 呼び径帯の展開 — 製品の BarSize ユニオン範囲内 (D35・D38 はスコープ外)。
# 帯 표기는 값을 열거하지 않으므로 이 매핑은 제품 스코프 결정이다.
BAR_SIZE_VALUES = {
    "D16以下": ["D10", "D13", "D16"],
    "D19-D38": ["D19", "D22", "D25", "D29", "D32"],
}


def entry(
    *,
    table: str,
    pdf_page: int,
    kind: str,
    conditions: dict[str, Any],
    value: int | float | bool,
    unit: str,
    image_read: bool = False,
) -> dict[str, Any]:
    return {
        "table": table,
        "pdfPage": pdf_page,
        "printedPage": PAGE_META[pdf_page],
        "kind": kind,
        "conditions": conditions,
        "value": value,
        "unit": unit,
        "imageRead": image_read,
    }


def source_table(page: fitz.Page, expected_rows: int, expected_columns: int) -> list[list[str | None]]:
    tables = page.find_tables().tables
    if len(tables) != 1:
        raise ValueError(
            f"PDF page {page.number + 1} must contain exactly one table; "
            f"found {len(tables)}"
        )

    table = tables[0]
    if table.row_count != expected_rows or table.col_count != expected_columns:
        raise ValueError(
            f"Unexpected table shape on PDF page {page.number + 1}: "
            f"{table.row_count}x{table.col_count}"
        )
    return table.extract()


def data_rows(
    rows: list[list[str | None]],
    *,
    header_rows: int,
) -> list[tuple[str, list[str | None]]]:
    result: list[tuple[str, list[str | None]]] = []
    grade: str | None = None

    for row in rows[header_rows:]:
        if row[0]:
            grade = normalized(row[0])
        if grade is None:
            raise ValueError("Encountered a rule row before its steel grade")
        result.append((grade, row))

    counts = Counter(grade for grade, _ in result)
    expected = Counter({"SD295": 4, "SD345": 4, "SD390": 3})
    if counts != expected:
        raise ValueError(f"Unexpected steel-grade row counts: {dict(counts)}")
    return result


def render_tables(document: fitz.Document) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    for table_name, pdf_page in TABLE_PAGES.items():
        page = document[pdf_page - 1]
        pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
        suffix = table_name.removeprefix("表").replace(".", "-")
        pixmap.save(CACHE_DIR / f"table-{suffix}.png")


def extract_bend_entries(document: fitz.Document) -> list[dict[str, Any]]:
    pdf_page = TABLE_PAGES["表5.3.1"]
    rows = source_table(document[pdf_page - 1], 7, 6)
    diameter_row = rows[3]

    entries = [
        entry(
            table="表5.3.1",
            pdf_page=pdf_page,
            kind="bend.inside-diameter",
            conditions={
                "grades": ["SD295", "SD345"],
                "barSizeBand": "D16以下",
                "barSizes": BAR_SIZE_VALUES["D16以下"],
            },
            value=parse_d(diameter_row[3]),
            unit="d",
        ),
        entry(
            table="表5.3.1",
            pdf_page=pdf_page,
            kind="bend.inside-diameter",
            conditions={
                "grades": ["SD295", "SD345"],
                "barSizeBand": "D19-D38",
                "barSizes": BAR_SIZE_VALUES["D19-D38"],
            },
            value=parse_d(diameter_row[4]),
            unit="d",
        ),
        entry(
            table="表5.3.1",
            pdf_page=pdf_page,
            kind="bend.inside-diameter",
            conditions={
                "grades": ["SD390"],
                "barSizeBand": "D19-D38",
                "barSizes": BAR_SIZE_VALUES["D19-D38"],
            },
            value=parse_d(diameter_row[5]),
            unit="d",
        ),
    ]

    # 表5.3.1's hook-tail labels are raster content and cannot be obtained from
    # get_text(). These values were read from .cache/table-5-3-1.png.
    entries.extend(
        [
            entry(
                table="表5.3.1 折曲げ図",
                pdf_page=pdf_page,
                kind="bend.hook180",
                conditions={},
                value=4,
                unit="d",
                image_read=True,
            ),
            entry(
                table="表5.3.1 折曲げ図",
                pdf_page=pdf_page,
                kind="bend.hook135",
                conditions={},
                value=6,
                unit="d",
                image_read=True,
            ),
            entry(
                table="表5.3.1 折曲げ図",
                pdf_page=pdf_page,
                kind="bend.hook90",
                conditions={},
                value=8,
                unit="d",
                image_read=True,
            ),
            entry(
                table="表5.3.1 折曲げ図",
                pdf_page=pdf_page,
                kind="bend.hook-tome",
                conditions={},
                value=4,
                unit="d",
                image_read=True,
            ),
        ]
    )
    return entries


def extract_lap_entries(document: fitz.Document) -> list[dict[str, Any]]:
    pdf_page = TABLE_PAGES["表5.3.2"]
    rows = source_table(document[pdf_page - 1], 12, 4)
    entries: list[dict[str, Any]] = []

    for grade, row in data_rows(rows, header_rows=1):
        conditions = {"grade": grade, **fc_conditions(row[1])}
        entries.extend(
            [
                entry(
                    table="表5.3.2",
                    pdf_page=pdf_page,
                    kind="lap.L1",
                    conditions={**conditions, "hook": False},
                    value=parse_d(row[2]),
                    unit="d",
                ),
                entry(
                    table="表5.3.2",
                    pdf_page=pdf_page,
                    kind="lap.L1h",
                    conditions={**conditions, "hook": True},
                    value=parse_d(row[3]),
                    unit="d",
                ),
            ]
        )

    entries.append(extract_lightweight_addition(document, "表5.3.2", "lap"))
    return entries


def extract_anchorage_entries(document: fitz.Document) -> list[dict[str, Any]]:
    pdf_page = TABLE_PAGES["表5.3.4"]
    rows = source_table(document[pdf_page - 1], 14, 10)
    entries: list[dict[str, Any]] = []
    columns = (
        ("anchorage.L1", 2, False),
        ("anchorage.L2", 3, False),
        ("anchorage.L1h", 6, True),
        ("anchorage.L2h", 7, True),
    )

    for grade, row in data_rows(rows, header_rows=3):
        common = {"grade": grade, **fc_conditions(row[1])}
        for kind, column, hook in columns:
            entries.append(
                entry(
                    table="表5.3.4",
                    pdf_page=pdf_page,
                    kind=kind,
                    conditions={**common, "hook": hook},
                    value=parse_d(row[column]),
                    unit="d",
                )
            )

    entries.append(
        extract_lightweight_addition(document, "表5.3.4", "anchorage")
    )
    return entries


def extract_projection_entries(document: fitz.Document) -> list[dict[str, Any]]:
    pdf_page = TABLE_PAGES["表5.3.5"]
    rows = source_table(document[pdf_page - 1], 12, 4)
    entries: list[dict[str, Any]] = []

    for grade, row in data_rows(rows, header_rows=1):
        entries.append(
            entry(
                table="表5.3.5",
                pdf_page=pdf_page,
                kind="anchorage.La",
                conditions={"grade": grade, **fc_conditions(row[1])},
                value=parse_d(row[2]),
                unit="d",
            )
        )

    entries.append(
        extract_lightweight_addition(document, "表5.3.5", "anchorage.La")
    )
    return entries


def extract_lightweight_addition(
    document: fitz.Document,
    table: str,
    key_prefix: str,
) -> dict[str, Any]:
    pdf_page = TABLE_PAGES[table]
    text = normalized(document[pdf_page - 1].get_text("text"))
    match = re.search(r"軽量コンクリートの場合は、表の値に(\d+)dを加え", text)
    if not match:
        raise ValueError(f"Could not extract the lightweight-concrete note for {table}")

    return entry(
        table=f"{table}(注)",
        pdf_page=pdf_page,
        kind=f"{key_prefix}.lightweight.addition",
        conditions={"concreteType": "軽量コンクリート"},
        value=int(match.group(1)),
        unit="d",
    )


def extract_bent_anchorage_conditions(document: fitz.Document) -> list[dict[str, Any]]:
    pdf_page = 37
    text = normalized(document[pdf_page - 1].get_text("text"))
    tail = re.search(r"余長は、(\d+)d以上", text)
    projection = re.search(r"柱せいの(\d+)/(\d+)倍以上", text)
    if not tail or not projection:
        raise ValueError("Could not extract both 5.3.4(5)(ｲ) bent-anchorage limits")

    return [
        entry(
            table="5.3.4(5)(ｲ)(b)",
            pdf_page=pdf_page,
            kind="anchorage.bent.tail.minimum",
            conditions={},
            value=int(tail.group(1)),
            unit="d",
        ),
        entry(
            table="5.3.4(5)(ｲ)(c)",
            pdf_page=pdf_page,
            kind="anchorage.bent.projection.minimum",
            conditions={"detail": "梁主筋の柱内定着"},
            value=int(projection.group(1)) / int(projection.group(2)),
            unit="ratio",
        ),
    ]


def extract_lap_prohibition(document: fitz.Document) -> dict[str, Any]:
    # The clause begins on PDF page 33 (printed page 27), although 表5.3.4 is
    # located on PDF page 36. Record the clause's actual page, not the table page.
    # 수치가 아닌 제약이므로 entries가 아니라 fixture.constraints로 분리한다 —
    # 룰팩 스키마(value must be a finite number)와 섞이면 죽은 데이터가 된다.
    pdf_page = 33
    text = normalized(document[pdf_page - 1].get_text("text"))
    match = re.search(r"D(\d+)以上の異形鉄筋については、重ね継手を用いない", text)
    if not match:
        raise ValueError("Could not extract the D35-and-above lap prohibition")

    return {
        "table": "5.3.4(1)",
        "pdfPage": pdf_page,
        "printedPage": PAGE_META[pdf_page],
        "kind": "lap.prohibited.minimum-bar-size",
        "conditions": {"barSizeBand": f"D{match.group(1)}以上"},
        "prohibited": True,
        "imageRead": False,
    }


def extract_cover_entries(document: fitz.Document) -> list[dict[str, Any]]:
    pdf_page = TABLE_PAGES["表5.3.6"]
    rows = source_table(document[pdf_page - 1], 11, 5)
    targets = (
        (3, False, "屋内", "仕上げあり"),
        (4, False, "屋内", "仕上げなし"),
        (5, False, "屋外", "仕上げあり"),
        (6, False, "屋外", "仕上げなし"),
        (8, True, None, None),
    )
    entries: list[dict[str, Any]] = []

    for row_index, soil_contact, exposure, finish in targets:
        conditions: dict[str, Any] = {
            "memberKinds": ["柱", "大梁"],
            "soilContact": soil_contact,
        }
        if exposure is not None:
            conditions["exposure"] = exposure
        if finish is not None:
            conditions["finish"] = finish
        entries.append(
            entry(
                table="表5.3.6",
                pdf_page=pdf_page,
                kind="cover.minimum",
                conditions=conditions,
                value=int(normalized(rows[row_index][4] or "")),
                unit="mm",
            )
        )

    text = normalized(document[pdf_page - 1].get_text("text"))
    addition = re.search(r"最小かぶり厚さに(\d+)mmを加えた数値", text)
    if not addition:
        raise ValueError("Could not extract the fabrication-cover addition")
    entries.append(
        entry(
            table="5.3.5(2)",
            pdf_page=pdf_page,
            kind="cover.fabrication.addition",
            conditions={},
            value=int(addition.group(1)),
            unit="mm",
        )
    )
    return entries


def validate_entries(entries: list[dict[str, Any]]) -> None:
    expected_counts = {
        "lap": 22,
        "anchorage": 44,
        "projection": 11,
        "image": 4,
    }
    actual_counts = {
        "lap": sum(item["kind"] in {"lap.L1", "lap.L1h"} for item in entries),
        "anchorage": sum(
            item["kind"]
            in {
                "anchorage.L1",
                "anchorage.L2",
                "anchorage.L1h",
                "anchorage.L2h",
            }
            for item in entries
        ),
        "projection": sum(item["kind"] == "anchorage.La" for item in entries),
        "image": sum(item["imageRead"] is True for item in entries),
    }
    if actual_counts != expected_counts:
        raise ValueError(f"Unexpected fixture counts: {actual_counts}")


def main() -> None:
    verify_pdf()
    document = fitz.open(PDF_PATH)
    try:
        render_tables(document)
        entries = [
            *extract_bend_entries(document),
            *extract_lap_entries(document),
            *extract_anchorage_entries(document),
            *extract_bent_anchorage_conditions(document),
            *extract_projection_entries(document),
            *extract_cover_entries(document),
        ]
        constraints = [extract_lap_prohibition(document)]
    finally:
        document.close()

    validate_entries(entries)
    fixture = {
        "source": {
            "doc": "公共建築工事標準仕様書（建築工事編）",
            "edition": "令和7年版",
            "sha256": SOURCE_SHA256,
            "url": SOURCE_URL,
        },
        "entries": entries,
        "constraints": constraints,
    }
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(
        json.dumps(fixture, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {len(entries)} entries to {FIXTURE_PATH.relative_to(ROOT)} "
        f"({sum(item['imageRead'] is True for item in entries)} image reads)"
    )


if __name__ == "__main__":
    main()
