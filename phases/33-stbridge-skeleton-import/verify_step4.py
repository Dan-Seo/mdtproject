#!/usr/bin/env python3
"""Independent, standard-library-only checks for phase 33 step 4.

The corpus oracle intentionally uses byte decoding plus regular expressions.  It
does not import or execute the TypeScript ST-Bridge parser.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "stb"
EXPECTED = ROOT / "tests" / "fixtures" / "stb-import" / "expected"
STEP0 = ROOT / "phases" / "33-stbridge-skeleton-import" / "step0-report.json"
STB_SOURCE = ROOT / "src" / "lib" / "import" / "stb"
CORPUS = (
    "dotnet-sample1.stb",
    "diffchecker-filea.stb",
    "hoaryfox-sample.stb",
    "diffchecker-mini210.stb",
)

ATTRIBUTE = re.compile(r"([:\w.-]+)\s*=\s*(['\"])(.*?)\2", re.DOTALL)
GROUP = re.compile(
    r"<(?:\w+:)?StbParallelAxes\b([^>]*)>(.*?)"
    r"</(?:\w+:)?StbParallelAxes\s*>",
    re.DOTALL,
)
AXIS = re.compile(r"<(?:\w+:)?StbParallelAxis\b([^>]*)>", re.DOTALL)
STORY = re.compile(r"<(?:\w+:)?StbStory\b([^>]*)/?>", re.DOTALL)


def attrs(raw: str) -> dict[str, str]:
    return {name: value for name, _quote, value in ATTRIBUTE.findall(raw)}


def decode_source(path: Path) -> str:
    data = path.read_bytes()
    declaration = re.search(br"<\?xml\b[^?]*?\?>", data[:512], re.IGNORECASE)
    label_match = (
        re.search(br"\bencoding\s*=\s*['\"]([^'\"]+)['\"]", declaration.group(0), re.IGNORECASE)
        if declaration
        else None
    )
    label = label_match.group(1).decode("ascii").lower() if label_match else "utf-8"
    encoding = "cp932" if label in {"shift_jis", "shift-jis", "sjis", "windows-31j"} else "utf-8"
    return data.decode(encoding)


def direction(angle_raw: str) -> str:
    angle = float(angle_raw) % 360
    quadrant = round(angle / 90) % 4
    if abs(angle - round(angle / 90) * 90) > 0.001:
        raise ValueError(f"non-orthogonal angle in independent oracle: {angle_raw}")
    return "Y" if quadrant in {0, 2} else "X"


def recompute(path: Path) -> dict[str, Any]:
    text = decode_source(path)
    by_direction: dict[str, dict[str, Any]] = {}
    raw_groups: list[dict[str, Any]] = []
    for group_raw, body in GROUP.findall(text):
        group_attrs = attrs(group_raw)
        axis_rows = []
        for axis_raw in AXIS.findall(body):
            axis_attrs = attrs(axis_raw)
            axis_rows.append(
                {
                    "name": axis_attrs["name"],
                    "distance": float(axis_attrs["distance"]),
                }
            )
        axis_rows.sort(key=lambda row: row["distance"])
        labels = [row["name"] for row in axis_rows]
        distances = [row["distance"] for row in axis_rows]
        spans = [right - left for left, right in zip(distances, distances[1:])]
        axis_direction = direction(group_attrs["angle"])
        by_direction[axis_direction] = {"labels": labels, "spans": spans}
        raw_groups.append(
            {
                "group_name": group_attrs.get("group_name", ""),
                "angle": group_attrs["angle"],
                "labels": labels,
                "spans": spans,
            }
        )

    levels = []
    for story_raw in STORY.findall(text):
        story_attrs = attrs(story_raw)
        levels.append(
            {
                "name": story_attrs["name"],
                "height": float(story_attrs["height"]),
                "kind": story_attrs["kind"],
            }
        )
    levels.sort(key=lambda row: row["height"])
    story_names = [row["name"] for row in levels[:-1]]
    story_heights = [
        right["height"] - left["height"]
        for left, right in zip(levels, levels[1:])
    ]
    return {
        "file": path.name,
        "x_labels": by_direction.get("X", {}).get("labels", []),
        "x_spans": by_direction.get("X", {}).get("spans", []),
        "y_labels": by_direction.get("Y", {}).get("labels", []),
        "y_spans": by_direction.get("Y", {}).get("spans", []),
        "story_names": story_names,
        "story_heights": story_heights,
        "_groups": raw_groups,
        "_levels": levels,
    }


def committed_expected(file_name: str) -> dict[str, Any]:
    expected = json.loads((EXPECTED / file_name.replace(".stb", ".json")).read_text(encoding="utf-8"))
    grids = {grid["direction"]: grid for grid in expected["grids"]}
    return {
        "file": file_name,
        "x_labels": [axis["label"] for axis in grids.get("X", {}).get("axes", [])],
        "x_spans": grids.get("X", {}).get("spansMm", []),
        "y_labels": [axis["label"] for axis in grids.get("Y", {}).get("axes", [])],
        "y_spans": grids.get("Y", {}).get("spansMm", []),
        "story_names": [story["name"] for story in expected["stories"]],
        "story_heights": [story["heightMm"] for story in expected["stories"]],
    }


def step0_expected(file_name: str, step0: dict[str, Any]) -> dict[str, Any]:
    group_angles = {
        (row["file"], row["group_name"]): row["angle"]
        for row in step0["axis_groups"]
    }
    by_direction: dict[str, dict[str, Any]] = {}
    for row in step0["axes"]:
        if row["file"] != file_name:
            continue
        axis_direction = direction(group_angles[(file_name, row["group_name"])])
        by_direction[axis_direction] = {
            "labels": row["labels"],
            "spans": row["spans_mm"],
        }
    story = next(row for row in step0["stories"] if row["file"] == file_name)
    return {
        "file": file_name,
        "x_labels": by_direction.get("X", {}).get("labels", []),
        "x_spans": by_direction.get("X", {}).get("spans", []),
        "y_labels": by_direction.get("Y", {}).get("labels", []),
        "y_spans": by_direction.get("Y", {}).get("spans", []),
        "story_names": [level["name"] for level in story["levels"][:-1]],
        "story_heights": story["adjacent_diffs"],
    }


def public_recomputed(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if not key.startswith("_")}


def source_files(include_tests: bool = True) -> list[Path]:
    files = sorted(STB_SOURCE.rglob("*.ts"))
    if include_tests:
        return files
    return [path for path in files if not path.name.endswith(".test.ts")]


def static_checks() -> dict[str, Any]:
    all_files = source_files()
    production_files = source_files(include_tests=False)
    texts = {str(path.relative_to(ROOT)): path.read_text(encoding="utf-8") for path in all_files}
    forbidden_inert = re.compile(
        r"applyFramingPlan|applyElevation|updateProject|loadProject|useAppStore|createSampleProject"
    )
    forbidden_rules = re.compile(
        r"定着|重ね継手|折曲|かぶり|depth_cover|anchorage|cut_off|center_|StbSec|StbApply",
        re.IGNORECASE,
    )
    fabrication_patterns = {
        "?? 0": re.compile(r"\?\?\s*0"),
        "|| 0": re.compile(r"\|\|\s*0"),
        "?? ''": re.compile(r"\?\?\s*(['\"])\1"),
        "Number(x) ||": re.compile(r"Number\([^\n)]*\)\s*\|\|"),
        "parseFloat(x) ||": re.compile(r"parseFloat\([^\n)]*\)\s*\|\|"),
        "Number(": re.compile(r"\bNumber\("),
        "parseFloat(": re.compile(r"\bparseFloat\("),
    }

    def matches(pattern: re.Pattern[str]) -> list[dict[str, Any]]:
        found = []
        for file, text in texts.items():
            for line_no, line in enumerate(text.splitlines(), 1):
                if pattern.search(line):
                    found.append({"file": file, "line": line_no, "text": line.strip()})
        return found

    outside_imports = []
    for base in (ROOT / "src", ROOT / "tests"):
        for path in base.rglob("*.ts*"):
            if STB_SOURCE in path.parents or (ROOT / "tests" / "stb-import") in path.parents:
                continue
            text = path.read_text(encoding="utf-8")
            if "lib/import/stb" in text or "import/stb" in text:
                outside_imports.append(str(path.relative_to(ROOT)))

    return {
        "actual_non_test_ts": [str(path.relative_to(ROOT)) for path in production_files],
        "all_ts_count": len(all_files),
        "inert_matches_all_ts": matches(forbidden_inert),
        "rulepack_matches_all_ts": matches(forbidden_rules),
        "fabrication_patterns": {
            name: matches(pattern) for name, pattern in fabrication_patterns.items()
        },
        "outside_imports": outside_imports,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    missing = [file for file in CORPUS if not (CACHE / file).is_file()]
    result: dict[str, Any] = {"missing_cache_files": missing}
    if not missing:
        step0 = json.loads(STEP0.read_text(encoding="utf-8"))
        recomputed = [recompute(CACHE / file) for file in CORPUS]
        result["recomputed"] = [public_recomputed(row) for row in recomputed]
        result["expected_mismatches"] = [
            {
                "file": row["file"],
                "actual": public_recomputed(row),
                "expected": committed_expected(row["file"]),
            }
            for row in recomputed
            if public_recomputed(row) != committed_expected(row["file"])
        ]
        result["step0_mismatches"] = [
            {
                "file": row["file"],
                "actual": public_recomputed(row),
                "expected": step0_expected(row["file"], step0),
            }
            for row in recomputed
            if public_recomputed(row) != step0_expected(row["file"], step0)
        ]
    result["static"] = static_checks()

    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
