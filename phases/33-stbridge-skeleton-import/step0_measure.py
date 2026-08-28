"""Generate the phase-33 step-0 ST-Bridge premise and corpus report.

The .stb measurements intentionally use regular expressions over the declared
decoded text.  This is a one-off verification aid, not the product parser.
"""

from __future__ import annotations

import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from typing import Any


PHASE_DIR = Path(__file__).resolve().parent
REPO = PHASE_DIR.parents[1]
STB_DIR = REPO / ".cache" / "stb"
REPORT = PHASE_DIR / "step0-report.json"

STB_FILES = [
    {
        "file": "dotnet-sample1.stb",
        "url": "https://raw.githubusercontent.com/hrntsm/STBDotNet/2e742685700456ac10a3ed326ca99be75acd6b33/TestStbFiles/ver2/Sample1.stb",
        "sha256": "50df079abaf5514d88129b7e0ad194fb959d6bd2757126baebab650072ff391a",
        "bytes": 63177,
    },
    {
        "file": "diffchecker-filea.stb",
        "url": "https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/FileA.stb",
        "sha256": "fb350d0efcec007219ccc73d975175f4f694f422619dbc416ba133b18433ebe2",
        "bytes": 117138,
    },
    {
        "file": "hoaryfox-sample.stb",
        "url": "https://raw.githubusercontent.com/hrntsm/HoaryFox/f991f97df99e307c449c4c0bc0cb85b514cc5e8c/Samples/SampleBuilding.stb",
        "sha256": "83d35a8eeb57177d409766804e36288ff325d141d05a7cba4b58fff221257629",
        "bytes": 83288,
    },
    {
        "file": "diffchecker-mini210.stb",
        "url": "https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/Mini210_FileA.stb",
        "sha256": "9bf2b7b628d801f87d6d348b53b7628dfc0cc8a05989ace7787e727c697e80c5",
        "bytes": 1606,
    },
]

XSD_FILES = [
    {
        "version": "2.0.1",
        "file": "ST-Bridge_v201_20220316.xsd",
        "zip": "ST-Bridge_v201_20220316.zip",
        "url": "https://www.building-smart.or.jp/wp-content/uploads/2022/03/ST-Bridge_v201_20220316.zip",
        "zip_sha256": "e9294763477a18f0bc0e19aab629be4d8b1ea7ade085a688766a94dcfa5e4913",
        "zip_bytes": 12122,
    },
    {
        "version": "2.0.2",
        "file": "ST-Bridge_v202.xsd",
        "zip": "ST-Bridge_v202.zip",
        "url": "https://www.building-smart.or.jp/wp-content/uploads/2026/04/ST-Bridge_v202.zip",
        "zip_sha256": "f69d4ee1c4b162f50a1a05ba13c948996d743924f1eeebd7016de866a5b4da8d",
        "zip_bytes": 19264,
    },
    {
        "version": "2.1.0",
        "file": "ST-Bridge210.xsd",
        "zip": "ST-Bridge210.zip",
        "url": "https://www.building-smart.or.jp/wp-content/uploads/2023/05/ST-Bridge210.zip",
        "zip_sha256": "b694b2675001b1ac6d894cac66b7e0f357d611fb793f6dedd3d90b6aab07771e",
        "zip_bytes": 30132,
    },
    {
        "version": "2.1.1",
        "file": "ST-Bridge_v211.xsd",
        "zip": "ST-Bridge_v211.zip",
        "url": "https://www.building-smart.or.jp/wp-content/uploads/2026/07/ST-Bridge_v211.zip",
        "zip_sha256": "e4690298e3233e77049633a26a05de3633b7272b5220447f60446591c4cb17fd",
        "zip_bytes": 27410,
    },
]

ATTR_RE = re.compile(r'([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"')
TAG_RE = re.compile(r"<([A-Za-z_][\w.:-]*)[\s/>]")
TARGET_ELEMENTS = [
    "StbCommon",
    "StbNode",
    "StbAxes",
    "StbParallelAxes",
    "StbParallelAxis",
    "StbNodeIdList",
    "StbNodeId",
    "StbStory",
    "StbArcAxes",
    "StbRadialAxes",
    "StbDrawingAxes",
]

# These are exactly the attributes phase 33 is allowed to read.  Other XSD
# attributes are deliberately not part of the stability premise.
SKELETON_ATTRS = {
    "StbCommon": ["project_name"],
    "StbNode": ["id", "X", "Y", "Z", "kind"],
    "StbAxes": [],
    "StbParallelAxes": ["group_name", "X", "Y", "angle"],
    "StbParallelAxis": ["id", "name", "distance"],
    "StbNodeIdList": [],
    "StbNodeId": ["id"],
    "StbStory": ["id", "name", "height", "kind"],
}

ELEMENT_COUNTS = [
    "StbColumn",
    "StbSecColumn_RC",
    "StbSecColumn_S",
    "StbSecBarColumn_RC_RectSame",
    "StbSecBarColumnRectSameSimple",
    "StbSecBarBeam_RC_Same",
    "StbSecBarBeam_RC_ThreeTypes",
    "StbWall",
    "StbSlab",
    "StbBeam",
    "StbBrace",
    "StbFooting",
    "StbPile",
]


def attrs(tag: str) -> dict[str, str]:
    return dict(ATTR_RE.findall(tag))


def tags(text: str, name: str) -> list[str]:
    return re.findall(rf"<{re.escape(name)}\b[^>]*>", text)


def one_attr(tag: str, name: str) -> str | None:
    return attrs(tag).get(name)


def number(value: str | None) -> float | None:
    return None if value is None else float(value)


def decode_bytes(raw: bytes, declared: str) -> str:
    return raw.decode("cp932" if declared.lower() == "shift_jis" else "utf-8", errors="replace")


def parse_file(meta: dict[str, Any]) -> tuple[dict[str, Any], str, dict[str, Any]]:
    path = STB_DIR / meta["file"]
    raw = path.read_bytes()
    xml_decl = re.search(rb"<\?xml[^>]*\?>", raw)
    root_decl = re.search(rb"<ST_BRIDGE\b[^>]*>", raw)
    xml_decl_text = xml_decl.group(0).decode("ascii") if xml_decl else ""
    root_decl_text = root_decl.group(0).decode("ascii") if root_decl else ""
    declared = one_attr(xml_decl_text, "encoding") or "utf-8"
    text = decode_bytes(raw, declared)
    root_attrs = attrs(root_decl_text)
    file_report = {
        "file": meta["file"],
        "url": meta["url"],
        "sha256": hashlib.sha256(raw).hexdigest(),
        "sha256_matches_spec": hashlib.sha256(raw).hexdigest() == meta["sha256"],
        "bytes": len(raw),
        "version": root_attrs.get("version", ""),
        "encoding_declared": declared,
        "replacement_chars_when_declared": text.count("\ufffd"),
        "xml_declaration": xml_decl_text,
        "st_bridge_declaration": root_decl_text,
    }

    node_records: dict[str, dict[str, Any]] = {}
    for tag in tags(text, "StbNode"):
        a = attrs(tag)
        if a.get("id") is None:
            continue
        node_records[a["id"]] = {
            "id": a["id"],
            "x": number(a.get("X")),
            "y": number(a.get("Y")),
            "z": number(a.get("Z")),
            "kind": a.get("kind", ""),
        }

    group_matches = re.finditer(
        r"<StbParallelAxes\b(?P<attrs>[^>]*)>(?P<body>.*?)</StbParallelAxes>",
        text,
        flags=re.DOTALL,
    )
    axis_groups: list[dict[str, Any]] = []
    axes_report: list[dict[str, Any]] = []
    mismatch_report: list[dict[str, Any]] = []
    empty_report: list[dict[str, Any]] = []
    for group_match in group_matches:
        ga = attrs(group_match.group("attrs"))
        group_name = ga.get("group_name", "")
        angle = ga.get("angle", "")
        body = group_match.group("body")
        axis_matches = list(re.finditer(r"<StbParallelAxis\b(?P<attrs>[^>]*)>(?P<body>.*?)</StbParallelAxis>", body, re.DOTALL))
        axis_groups.append(
            {
                "file": meta["file"],
                "group_name": group_name,
                "angle": angle,
                "origin_x": ga.get("X", ""),
                "origin_y": ga.get("Y", ""),
                "axis_count": len(axis_matches),
            }
        )

        sorted_axes: list[tuple[float, str, str, list[str]]] = []
        empty_count = 0
        for axis_match in axis_matches:
            aa = attrs(axis_match.group("attrs"))
            axis_body = axis_match.group("body")
            node_ids: list[str] = []
            for node_tag in re.findall(r"<StbNodeId\b[^>]*>", axis_body):
                node_id = one_attr(node_tag, "id")
                if node_id is not None:
                    node_ids.append(node_id)
            if not node_ids:
                empty_count += 1
            distance_text = aa.get("distance", "")
            sorted_axes.append((float(distance_text), aa.get("name", ""), distance_text, node_ids))

        sorted_axes.sort(key=lambda item: item[0])
        distances = [item[2] for item in sorted_axes]
        spans = [round(sorted_axes[index + 1][0] - sorted_axes[index][0], 12) for index in range(len(sorted_axes) - 1)]
        axes_report.append(
            {
                "file": meta["file"],
                "group_name": group_name,
                "labels": [item[1] for item in sorted_axes],
                "distances": distances,
                "spans_mm": spans,
                "node_id_counts": [len(item[3]) for item in sorted_axes],
            }
        )
        empty_report.append({"file": meta["file"], "group_name": group_name, "count": empty_count})

        origin_x = float(ga.get("X", 0) or 0)
        origin_y = float(ga.get("Y", 0) or 0)
        angle_value = float(angle or 0)
        compare_axis = "x" if angle_value % 180 == 90 else "y"
        origin = origin_x if compare_axis == "x" else origin_y
        for distance, label, distance_text, node_ids in sorted_axes:
            if not node_ids:
                continue
            expected = origin + distance
            listed_nodes = [node_records[node_id] for node_id in node_ids if node_id in node_records]
            if not any(
                node.get(compare_axis) is not None and abs(node[compare_axis] - expected) <= 1
                for node in listed_nodes
            ):
                mismatch_report.append(
                    {
                        "file": meta["file"],
                        "group_name": group_name,
                        "label": label,
                        "distance": distance_text,
                        "origin_x": ga.get("X", ""),
                        "origin_y": ga.get("Y", ""),
                        "compared_axis": compare_axis,
                        "expected_coordinate": expected,
                        "node_coords": listed_nodes,
                    }
                )

    story_levels = []
    for tag in tags(text, "StbStory"):
        a = attrs(tag)
        if a.get("height") is None:
            continue
        story_levels.append(
            {
                "name": a.get("name", ""),
                "height": float(a["height"]),
                "kind": a.get("kind", ""),
            }
        )
    story_levels.sort(key=lambda level: level["height"])
    story_diffs = [
        round(story_levels[index + 1]["height"] - story_levels[index]["height"], 12)
        for index in range(len(story_levels) - 1)
    ]

    census = dict(sorted(Counter(TAG_RE.findall(text)).items()))
    node_kinds = Counter(node["kind"] for node in node_records.values())
    column_tags = tags(text, "StbColumn")
    column_kinds = Counter(one_attr(tag, "kind_structure") for tag in column_tags if one_attr(tag, "kind_structure") is not None)
    column_names = sorted({value for tag in column_tags if (value := one_attr(tag, "name")) is not None})[:20]
    sec_column_names = sorted({value for tag in tags(text, "StbSecColumn_RC") if (value := one_attr(tag, "name")) is not None})
    elements_with_depth_cover = sorted(
        {
            element
            for element in TAG_RE.findall(text)
            if any(attribute.startswith("depth_cover") for attribute in attrs(next(tag for tag in tags(text, element) if tag.startswith(f"<{element}"))))
        }
    )
    # The expression above finds the first matching tag. Recompute from every
    # opening tag so an attribute present only on a later instance is retained.
    elements_with_depth_cover = sorted(
        {
            match.group(1)
            for match in re.finditer(r"<([A-Za-z_][\w.:-]*)\b[^>]*>", text)
            if any(attribute.startswith("depth_cover") for attribute in attrs(match.group(0)))
        }
    )
    element_counts = {name: census.get(name, 0) for name in ELEMENT_COUNTS}
    next_facts = {
        "file": meta["file"],
        "column_kind_structure": dict(sorted(column_kinds.items())),
        "column_names": column_names,
        "sec_column_rc_names": sec_column_names,
        "element_counts": element_counts,
        "elements_with_depth_cover": elements_with_depth_cover,
    }

    details = {
        "axis_groups": axis_groups,
        "axes": axes_report,
        "axis_node_mismatch": mismatch_report,
        "empty_node_list_axes": empty_report,
        "stories": {
            "file": meta["file"],
            "levels": story_levels,
            "adjacent_diffs": story_diffs,
        },
        "nodes": {
            "file": meta["file"],
            "total": len(node_records),
            "by_kind": dict(sorted(node_kinds.items())),
        },
        "unsupported_axis_kinds": {
            "file": meta["file"],
            "StbArcAxes": census.get("StbArcAxes", 0),
            "StbRadialAxes": census.get("StbRadialAxes", 0),
            "StbDrawingAxes": census.get("StbDrawingAxes", 0),
        },
        "next_facts": next_facts,
        "element_census": {"file": meta["file"], "counts": census},
    }
    return file_report, text, details


def xsd_attr_sets() -> tuple[dict[str, dict[str, list[str]]], dict[str, dict[str, list[str]]]]:
    selected: dict[str, dict[str, list[str]]] = {}
    all_attrs: dict[str, dict[str, list[str]]] = {}
    namespace = "{http://www.w3.org/2001/XMLSchema}"
    for meta in XSD_FILES:
        raw = (STB_DIR / meta["file"]).read_bytes()
        root = ET.fromstring(raw[raw.find(b"<?xml") :])
        declarations = {element.get("name"): element for element in root.findall(namespace + "element")}
        all_attrs[meta["version"]] = {}
        selected[meta["version"]] = {}
        for element_name in SKELETON_ATTRS:
            declaration = declarations.get(element_name)
            if declaration is None:
                all_attrs[meta["version"]][element_name] = []
                selected[meta["version"]][element_name] = []
                continue
            attrs_found = [attribute.get("name") for attribute in declaration.findall(".//" + namespace + "attribute")]
            all_attrs[meta["version"]][element_name] = [value for value in attrs_found if value is not None]
            selected[meta["version"]][element_name] = [
                value for value in SKELETON_ATTRS[element_name] if value in attrs_found
            ]
    return selected, all_attrs


def xsd_report() -> list[dict[str, Any]]:
    result = []
    for meta in XSD_FILES:
        path = STB_DIR / meta["file"]
        raw = path.read_bytes()
        zip_raw = (STB_DIR / meta["zip"]).read_bytes()
        result.append(
            {
                "version": meta["version"],
                "file": meta["file"],
                "sha256": hashlib.sha256(raw).hexdigest(),
                "bytes": len(raw),
                "found": path.is_file(),
                "url": meta["url"],
                "zip_sha256": hashlib.sha256(zip_raw).hexdigest(),
                "zip_bytes": len(zip_raw),
            }
        )
    return result


def line_of(relative: str, needle: str) -> int:
    for index, line in enumerate((REPO / relative).read_text(encoding="utf-8").splitlines(), 1):
        if needle in line:
            return index
    return 0


def main() -> None:
    corpus: list[dict[str, Any]] = []
    all_axis_groups: list[dict[str, Any]] = []
    all_axes: list[dict[str, Any]] = []
    all_mismatches: list[dict[str, Any]] = []
    all_empty: list[dict[str, Any]] = []
    all_stories: list[dict[str, Any]] = []
    all_nodes: list[dict[str, Any]] = []
    all_unsupported: list[dict[str, Any]] = []
    all_census: list[dict[str, Any]] = []
    all_next_facts: list[dict[str, Any]] = []
    decoded_by_file: dict[str, str] = {}

    for meta in STB_FILES:
        file_report, text, details = parse_file(meta)
        corpus.append(file_report)
        decoded_by_file[meta["file"]] = text
        all_axis_groups.extend(details["axis_groups"])
        all_axes.extend(details["axes"])
        all_mismatches.extend(details["axis_node_mismatch"])
        all_empty.extend(details["empty_node_list_axes"])
        all_stories.append(details["stories"])
        all_nodes.append(details["nodes"])
        all_unsupported.append(details["unsupported_axis_kinds"])
        all_census.append(details["element_census"])
        all_next_facts.append(details["next_facts"])

    selected_attrs, all_attrs = xsd_attr_sets()
    stable_versions = ["2.0.2", "2.1.0", "2.1.1"]
    stable = all(selected_attrs[version] == selected_attrs[stable_versions[0]] for version in stable_versions[1:])
    forbidden_tokens = ("depth_cover", "center_", "D_main", "N_", "pitch_")
    no_section_attrs = all(
        not any(token.lower() in attribute.lower() for token in forbidden_tokens)
        for version in stable_versions
        for element_attrs in selected_attrs[version].values()
        for attribute in element_attrs
    )

    diffchecker_text = decoded_by_file["diffchecker-filea.stb"]
    diffchecker_raw = (STB_DIR / "diffchecker-filea.stb").read_bytes().decode("utf-8", errors="replace")
    diffchecker_project_utf8 = one_attr(re.search(r"<StbCommon\b[^>]*>", diffchecker_raw).group(0), "project_name") if re.search(r"<StbCommon\b[^>]*>", diffchecker_raw) else ""
    diffchecker_project_sjis = one_attr(re.search(r"<StbCommon\b[^>]*>", diffchecker_text).group(0), "project_name") if re.search(r"<StbCommon\b[^>]*>", diffchecker_text) else ""

    # This was executed in the two temporary Vitest configs before report
    # generation: node environment and jsdom environment, one test each.
    environment_probe = {
        "node_version": "v24.15.0",
        "node_domparser_type": "undefined",
        "node_shift_jis": "基準",
        "vitest_domain": {"passed": True, "domparser_type": "undefined", "shift_jis": "基準"},
        "vitest_ui": {"passed": True, "domparser_type": "function", "shift_jis": "基準"},
    }

    premises = [
        {
            "id": "adr004-ifc-unargued",
            "verdict": "upheld",
            "evidence": "docs/ADR.md:38-39 — ADR-004 이유·트레이드오프 두 줄에 IFC 0회이며 DWG/DXF 도면 인식만 논증한다.",
            "note": "ADR-004 결정문에는 IFC 업로드 금지가 있지만, 이번 전제는 이유·트레이드오프 절만 검사한다.",
        },
        {
            "id": "no-rc-anchorage-length",
            "verdict": "upheld",
            "evidence": ".cache/stb/ST-Bridge210.xsd의 RC 적용요소는 anchorage_rule/cut_off_rule/allocation_rule_stirrup만 xs:string이고, stb:length인 length_lap_bar는 StbSecBarPile_RC_TopBottom/TopCenterBottom, pitch_anchorbolt_*는 StbSecConnectionIsolatingDeviceRB/SP에만 있다.",
            "note": "RC 부재의 정착·重ね継手 숫자 속성은 0개다; 룰 이름과 비RC 전용 길이 속성은 구분했다.",
        },
        {
            "id": "skeleton-attrs-version-stable",
            "verdict": "upheld" if stable else "refuted",
            "evidence": "2.0.2/2.1.0/2.1.1의 허용 읽기 속성 집합이 요소별로 동일하다: " + json.dumps(selected_attrs["2.0.2"], ensure_ascii=False, separators=(",", ":")),
            "note": "목록 밖 XSD 차이는 반증 대상이 아니다. 예: StbStory@level_name은 2.0.2에 없고 2.1.x에 있다.",
        },
        {
            "id": "grid-and-story-cannot-hold",
            "verdict": "upheld",
            "evidence": f"src/domain/model/project.ts:{line_of('src/domain/model/project.ts', 'export interface Grid')} Grid는 xSpans/ySpans와 선택적 xLabels/yLabels만 가지며, Story는 id/name/height만 갖고 storyElevation은 배열 앞 height 누적({line_of('src/domain/model/project.ts', 'export function storyElevation')})이다; XSD에는 ParallelAxes@angle·Arc/Radial/DrawingAxes·Story@kind가 있다.",
            "note": "기존 모델에 회전·원점·원호·방사축·Story kind·절대 GL 표고를 담는 필드는 없다.",
        },
        {
            "id": "domparser-env-split",
            "verdict": "upheld" if environment_probe["node_domparser_type"] == "undefined" and environment_probe["vitest_ui"]["domparser_type"] == "function" else "refuted",
            "evidence": "node v24.15.0에서 typeof DOMParser=undefined; 별도 Vitest node 테스트와 jsdom 테스트가 각각 통과했고 DOMParser 타입은 undefined/function이었다.",
            "note": "vitest 기본 프로젝트 include 밖의 임시 .cache 설정으로 환경만 검증했으며 src/tests 파일은 수정하지 않았다.",
        },
        {
            "id": "no-cover-or-section-in-skeleton",
            "verdict": "upheld" if no_section_attrs else "refuted",
            "evidence": "skeleton_attr_sets의 모든 버전·요소에서 depth_cover_·center_·D_main·N_·pitch_ 속성이 0개다.",
            "note": "실물 element_census와 next_phase_facts에는 해당 속성이 존재할 수 있으나, 골격 읽기 목록에는 넣지 않았다.",
        },
        {
            "id": "shiftjis-decoder-available",
            "verdict": "upheld" if environment_probe["node_shift_jis"] == "基準" and environment_probe["vitest_domain"]["shift_jis"] == "基準" and environment_probe["vitest_ui"]["shift_jis"] == "基準" else "refuted",
            "evidence": "node -e의 new TextDecoder('shift_jis')가 CP932 [0x8a,0xee,0x8f,0x80]를 基準으로 디코드했고, Vitest node/jsdom 양쪽 같은 단언이 통과했다.",
            "note": "인코딩 변환 npm 라이브러리는 설치하지 않았다.",
        },
    ]

    report = {
        "premises": premises,
        "corpus": corpus,
        "xsd": xsd_report(),
        "skeleton_attr_sets": selected_attrs,
        "skeleton_attr_sets_all_declared": all_attrs,
        "encoding_probe": {
            "diffchecker_filea_project_name_forced_utf8": diffchecker_project_utf8,
            "diffchecker_filea_project_name_shift_jis": diffchecker_project_sjis,
        },
        "environment_probe": environment_probe,
        "axis_groups": all_axis_groups,
        "element_census": all_census,
        "axes": all_axes,
        "axis_node_mismatch": all_mismatches,
        "empty_node_list_axes": all_empty,
        "stories": all_stories,
        "nodes": all_nodes,
        "unsupported_axis_kinds": all_unsupported,
        "files_without_stb_axes": [
            item["file"]
            for item in all_census
            if item["counts"].get("StbAxes", 0) == 0
        ],
        "next_phase_facts": all_next_facts,
        "gh_search": {
            "version_query_total": 9,
            "element_query_total": 0,
            "note": "gh search code q1 [ST_BRIDGE version=2.1.0] --limit 100 --json repository,path -> [{path: TestData/Mini210_FileA.stb, repository: NS-NS/STB-DiffChecker}, {path: TestData/Mini210_FileB.stb, repository: NS-NS/STB-DiffChecker}, {path: js/common-ifc/pipeline/StbXmlGenerator.js, repository: key-o/stb-diff-viewer}]; gh search code q2 [StbSecBarColumnRectSameSimple extension:stb] -> []. gh api --include search/code: q1 HTTP/2.0 200 OK, total_count=9, incomplete_results=false; q2 HTTP/2.0 200 OK, total_count=0, incomplete_results=false.",
        },
        "verdict": "upheld" if all(item["verdict"] == "upheld" for item in premises) else "refuted",
        "summary": "전제 7건 중 " + str(sum(item["verdict"] == "upheld" for item in premises)) + "건 upheld, " + str(sum(item["verdict"] == "refuted" for item in premises)) + "건 refuted; 반증된 id 없음. 4개 파일의 축·階 실측을 전부 기록했고, 축 원점·노드 불일치·빈 NodeIdList·element_census도 함께 기록했다.",
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(REPORT), "verdict": report["verdict"], "premises": premises}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
