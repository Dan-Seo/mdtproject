# Step 0: ST-Bridge 골격 취입의 전제를 반증하고, 뒤 스텝이 쓸 실측값을 확정하라 (검증 전용·게이트)

이 스텝은 **구현이 아니다.** 대상 코드를 고치지 마라. `gate: true`다 — 반증하면 뒤 스텝이 돌지 않는다.

**전제**: `docs/ADR.md`에 `### ADR-043`이 있다. 없으면 `blocked`로 멈추고 그 사실을 `blocked_reason`에 적어라(ADR은 Claude가 쓴다 — 네가 쓰지 마라).

## 배경
phase 33은 .stb에서 **通り芯 그리드와 階 레벨 스택만**을 후보로 내는 파서를 짓는다. 断面(`StbSec*`)·부재 배치·UI·`Project` 반영은 전부 범위 밖이다. 이 좁힘과 ADR-043의 결정문이 서 있는 전제가 아직 이 레포 안에서 확인된 적이 없다.

이 스텝의 산출은 둘이다 — **반증**(전제가 어긋나면 phase를 멈춘다)과 **실측**(뒤 스텝의 AC가 될 수치를 확정한다). 둘을 섞지 마라. 「전제 목록」의 항목만 `refuted`를 낼 수 있고, 「기록 항목」은 값이 예상과 달라도 반증이 아니다.

## 읽을 것
- `docs/ADR.md` — ADR-002 / ADR-004(36~39행 전 4줄) / ADR-005 / ADR-012 / ADR-015 / ADR-018 / ADR-029 / ADR-030 / ADR-035 / ADR-038 / **ADR-043**
- `docs/PRD.md` 43행 (레포에서 IFC가 나오는 나머지 한 곳)
- `src/domain/model/project.ts` — `Grid`(67~80행), `Story`(94~98행), `storyElevation`(160~168행)
- `src/lib/import/framing-plan/types.ts` — `PlanGridCandidate`·`AxisCandidate`(pt 필드가 어디에 있는지 확인만 하라)
- `vitest.config.ts` — 두 프로젝트의 `include`와 `environment`
- `tests/fixtures/section-import/SOURCES.md` — 픽스처 규율의 정본. **하네스 가드레일 주입 대상이 아니므로 반드시 직접 열어라.**

## 준비 — 근거 파일을 `.cache/stb/`에 놓아라
`.cache/`는 `.gitignore` 대상이라 커밋되지 않는다. 아래를 받아 SHA-256을 대조하라. **받지 못하면 `refuted`가 아니라 `blocked`다** — URL과 기대 해시를 `blocked_reason`에 적어라(사람이 파일을 놓고 재개한다).

| 저장 파일 | URL | 기대 SHA-256 | bytes |
|---|---|---|---|
| `.cache/stb/dotnet-sample1.stb` | https://raw.githubusercontent.com/hrntsm/STBDotNet/2e742685700456ac10a3ed326ca99be75acd6b33/TestStbFiles/ver2/Sample1.stb | `50df079abaf5514d88129b7e0ad194fb959d6bd2757126baebab650072ff391a` | 63177 |
| `.cache/stb/diffchecker-filea.stb` | https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/FileA.stb | `fb350d0efcec007219ccc73d975175f4f694f422619dbc416ba133b18433ebe2` | 117138 |
| `.cache/stb/hoaryfox-sample.stb` | https://raw.githubusercontent.com/hrntsm/HoaryFox/f991f97df99e307c449c4c0bc0cb85b514cc5e8c/Samples/SampleBuilding.stb | `83d35a8eeb57177d409766804e36288ff325d141d05a7cba4b58fff221257629` | 83288 |
| `.cache/stb/diffchecker-mini210.stb` | https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/Mini210_FileA.stb | `9bf2b7b628d801f87d6d348b53b7628dfc0cc8a05989ace7787e727c697e80c5` | 1606 |

공식 XSD도 `.cache/stb/`에 받아 풀어라. zip 안에는 `.xsd` 파일 하나뿐이다.

| zip | URL | zip SHA-256 | 안의 xsd / xsd SHA-256 / bytes |
|---|---|---|---|
| ST-Bridge210.zip | https://www.building-smart.or.jp/wp-content/uploads/2023/05/ST-Bridge210.zip | `b694b2675001b1ac6d894cac66b7e0f357d611fb793f6dedd3d90b6aab07771e` | `ST-Bridge210.xsd` / `9f2038b7b308f411b6397e6cd2d1b0fe82169dd20c1e98cbf7d478a9d7b3583c` / 556507 |
| ST-Bridge_v211.zip | https://www.building-smart.or.jp/wp-content/uploads/2026/07/ST-Bridge_v211.zip | `e4690298e3233e77049633a26a05de3633b7272b5220447f60446591c4cb17fd` | `ST-Bridge_v211.xsd` / `73ab69075c2b8d5d480b40aa34f3b62d34a3d3f3099792afd34a71274343a089` / 558066 |
| ST-Bridge_v202.zip | https://www.building-smart.or.jp/wp-content/uploads/2026/04/ST-Bridge_v202.zip | `f69d4ee1c4b162f50a1a05ba13c948996d743924f1eeebd7016de866a5b4da8d` | `ST-Bridge_v202.xsd` / `56cc1b80062c2385c15f8ab0745f4e96ac5b9400a4743307031e813d0253a1fa` / 331047 |

압축 해제에 `unzip`이 없으면 `python -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall('.cache/stb')" <zip>`을 써라. **도구 실패는 반증이 아니다** — 무엇이 없었는지 `note`에 적어라.

ver **2.0.1** XSD의 배포 URL은 이 사양에 없다. https://www.building-smart.or.jp/meeting/buildall/structural-design/ 의 `href`를 뽑아 찾아보고, 찾으면 URL·SHA-256을 적어라. **못 찾는 것은 반증이 아니다** — 그 경우 2.0.1의 골격 요소 속성 집합은 XSD 대신 `.cache/stb/dotnet-sample1.stb` 실물에서 뽑아 적어라.

검증 스크립트가 필요하면 `phases/33-stbridge-skeleton-import/` 안에 **`.py`로** 두어라(`tsconfig.json`의 include가 `**/*.ts`라 phases 아래 `.ts`가 `npx tsc --noEmit`에 잡히고, `eslint .`의 ignores에 `phases/**`가 없다).

## 전제 목록 (이 7건만 `refuted`를 낼 수 있다)

| id | 전제 (반증 조건 포함) |
|---|---|
| `adr004-ifc-unargued` | ADR-004의 **이유**절과 **트레이드오프**절(docs/ADR.md:38-39)에 `IFC`가 **0회**이고, 두 절의 논증은 전부 DWG/DXF 도면 인식에 관한 것이다. 즉 「IFC 업로드는 하지 않는다」에는 논거가 붙은 적이 없다. 이유절 또는 트레이드오프절에 IFC를 배제하는 논거가 한 문장이라도 있으면 **원문을 인용하고 `refuted`** — ADR-043의 논증 축이 무너진다. |
| `no-rc-anchorage-length` | `ST-Bridge210.xsd`에서 RC 부재(柱·大梁·壁·スラブ) 범위에 **定着長さ·重ね継手長さを数値で担う属性が 0 個**다. `anchorage_rule`·`cut_off_rule`·`allocation_rule_stirrup`은 전부 `xs:string`(룰 이름)이고, `stb:length` 타입의 정착 관련 속성은 杭 전용 `length_lap_bar` 2건과 S造 앵커볼트 `pitch_anchorbolt_*`뿐임을 보여라. RC 범위에 길이형 정착 속성이 하나라도 있으면 속성명·소유 요소·타입을 적고 **`refuted`** — 「定着·重ね継手는 룰팩이 계산한다」는 분업 전제가 무너진다. |
| `skeleton-attrs-version-stable` | 이 phase의 파서가 읽는 **골격 요소·속성**이 2.0.2 / 2.1.0 / 2.1.1 XSD에서 **완전히 같다**. 대상은 정확히 이것뿐이다 — `StbCommon{project_name}`, `StbNode{id,X,Y,Z,kind}`, `StbAxes`, `StbParallelAxes{group_name,X,Y,angle}`, `StbParallelAxis{id,name,distance}`, `StbNodeIdList`, `StbNodeId{id}`, `StbStory{id,name,height,kind}`, 그리고 존재 확인만 하는 `StbArcAxes`·`StbRadialAxes`·`StbDrawingAxes`. **이 목록에 있는 속성**에 세 버전 간 차이가 하나라도 있으면 **`refuted`**. 목록 밖 속성의 차이(예: `StbStory@level_name`이 2.0.2에 없다)는 반증이 아니라 **나열만** 하라. 세 버전의 속성 집합을 요소별로 나란히 적어라. |
| `grid-and-story-cannot-hold` | `src/domain/model/project.ts`의 `Grid`에 회전각·원점·원호·방사축을 담을 필드가 **없고**, `Story`에 `kind`도 GL 기준 절대 표고도 **없다**(표고는 `storyElevation()`이 배열 순서로 누적해 만들므로 음의 표고를 만들 수 없다). 반면 XSD에는 `StbParallelAxes@angle`·`StbArcAxes`·`StbRadialAxes`·`StbDrawingAxes`가, `StbStory@kind`에는 GENERAL/BASEMENT/ROOF/PENTHOUSE/ISOLATION/DEPENDENCE가 실재한다. 어느 한쪽이라도 기존 타입에 담을 수 있으면 파일:행으로 보이고 **`refuted`** — 거부 규칙의 근거가 사라진다. |
| `domparser-env-split` | `src/lib/**/*.test.ts`는 vitest `ui` 프로젝트(jsdom)라 전역 `DOMParser`가 있고, `tests/**/*.test.ts`는 `domain` 프로젝트(node)라 **없다**. `node -e "console.log(process.version, typeof DOMParser)"`와 vitest 양쪽에서 실제로 확인하라. 반대이거나 양쪽 다 있으면 **`refuted`** — 2단 분리의 파일 배치 계획이 무너진다. |
| `no-cover-or-section-in-skeleton` | 위 `skeleton-attrs-version-stable`의 대상 목록에 かぶり厚さ·主筋·帯筋에 해당하는 속성이 **하나도 없다**(`depth_cover_*`·`center_*`·`D_main`·`N_*`·`pitch_*` 등). 목록 안에 그런 속성이 하나라도 섞여 있으면 **`refuted`** — 골격만 읽는다는 절단이 성립하지 않는다. |
| `shiftjis-decoder-available` | `new TextDecoder('shift_jis')`가 **Node와 vitest 양쪽에서** 예외 없이 만들어지고 CP932 바이트를 올바로 디코드한다. `node -e "const d=new TextDecoder('shift_jis'); console.log(d.decode(Buffer.from([0x8a,0xee,0x8f,0x80])))"`가 「基準」을 내는지 확인하고 출력을 그대로 적어라(그 4바이트가 CP932의 「基準」이다). vitest 안에서도 같은 단언이 서는지 확인하라. `RangeError: Incorrect locale information provided`가 나거나 다른 문자가 나오면 **`refuted`** — step 1이 인코딩 변환 라이브러리 추가를 금지하고 있어 우회로가 없다(small-icu 빌드의 Node에서 실제로 나는 실패다). |

## 기록 항목 (반증 대상이 아니다 — **실제 값을 적어라. 이 값이 step 2·3의 AC가 된다**)
예상값이 아래에 붙어 있는 항목이 있다. **예상과 다르면 `refuted`가 아니라 실제 값을 `step0-report.json`에 적어라.** 뒤 스텝은 이 보고서를 정본으로 삼는다.

1. **파일별 헤더**: 4개 .stb 각각의 `<?xml ... encoding=?>` 선언 원문과 `<ST_BRIDGE version=?>`. (예상: dotnet-sample1=UTF-8 선언/2.0.1, diffchecker-filea=**Shift_JIS**/2.0.2, hoaryfox-sample=UTF-8/2.0.2, diffchecker-mini210=UTF-8/2.1.0)
2. **인코딩 실태**: 각 파일을 **선언대로** 디코드했을 때 `U+FFFD`(치환문자)가 몇 개 나오는지 파일별로 세어 적어라. 그리고 `diffchecker-filea.stb`를 강제로 `utf-8`로 디코드했을 때의 `StbCommon@project_name`과 `shift_jis`로 디코드했을 때의 그것을 **나란히** 적어라.
3. **축 그룹 전수**: 파일별로 `StbParallelAxes`의 `(group_name, angle, X, Y, 축 개수)`를 전부 나열하라. (예상: 세 파일 모두 한 그룹이 `angle="0.0"`, 다른 그룹이 `angle="270.0"`. 즉 **angle이 0이 아니어도 직교다** — 「angle≠0이면 거부」는 틀린 규칙이다.)
4. **축 전수**: 파일별·그룹별로 `StbParallelAxis`의 `(name, distance, StbNodeIdList의 StbNodeId 개수)`를 **전부** 나열하고, `distance` 오름차순 정렬 후의 **인접 차분(spansMm)**을 함께 적어라. 파서를 쓰지 말고 정규식으로 뽑아라. (참고 예상 — dotnet-sample1: X1/X2/X3 = 0/6000/12000, Y1/Y2/Y3 = 0/6000/12000. hoaryfox-sample: X1..X7 = 0/3600/…/21600, Y1/Y2/Y3 = 0/10800/14400. diffchecker-filea: Y0,Y1,Y1a,Y2,Y2a,Y3,Y3a,Y4,Y5 = 0/1000/4200/7400/10600/13800/17000/20200/21200, X0,X1,X1a,X2,X2a,X3,X4 = 0/1000/3000/5000/9400/13800/14800.)
5. **축 distance와 節点 좌표의 어긋남**: 비교 대상 좌표는 **그룹 원점을 더한 값**이다 — 그룹 angle이 0·180이면 `StbParallelAxes@Y + distance`를 `StbNode@Y`와, 90·270이면 `StbParallelAxes@X + distance`를 `StbNode@X`와 비교한다(`@X`·`@Y`가 없으면 0으로 본다). **파일별 그룹 원점 `(@X, @Y)`의 실제 값을 반드시 함께 적어라** — 0이 아닌 그룹이 있으면 step 3의 검산식이 그 값을 써야 하고, 빠뜨리면 그 그룹의 전 축이 어긋난 것으로 발화한다. 각 축에 대해, `StbNodeIdList`가 비어 있지 **않은데** 그 목록의 어떤 `StbNode`도 위 좌표와 1mm 이내로 맞지 않는 축을 **전부** 나열하라(파일·그룹·축 이름·distance·그룹 원점·노드 좌표). (참고: diffchecker-filea의 `X1a`가 `distance=3000.0`인데 그 노드들이 `X=3500.0`이라고 알려져 있다.) **이것은 반증이 아니다** — 실물의 정상 데이터이고, step 3은 이 어긋남을 거부 사유가 아니라 표시 사유로 다룬다.
6. **`StbNodeIdList`가 빈 축의 수**를 파일별·그룹별로 적어라. (참고: diffchecker-filea는 16축 중 8축이 비어 있다고 알려져 있다.)
7. **階 전수**: 파일별로 `StbStory`의 `(name, height, kind)`를 **전부** 나열하고, `height` 오름차순 정렬 후의 **인접 차분**을 적어라. (참고 예상 — dotnet-sample1: 1FL/0.0/GENERAL, 2FL/5000.0/GENERAL, RFL/9200.0/ROOF. hoaryfox-sample: 1F~RF = 0/4000/8000/12000/16000/20000 전부 GENERAL. diffchecker-filea: 1FL/200/GENERAL, 2FL/4700/GENERAL, 3FL/8700/GENERAL, RFL/12700/**PENTHOUSE**, PHRFL/16500/ROOF. diffchecker-mini210: `StbStory` 1건.)
8. **節点**: 파일별 `StbNode` 총수와 `kind` 값별 분포. (참고: `ON_GRID`·`ON_GIRDER`·`ON_BEAM`·`OTHER`가 관측됐고, hoaryfox-sample은 `ON_GRID`가 0개라고 알려져 있다.)
9. **미대응 축 종별**: 4파일의 `StbArcAxes`·`StbRadialAxes`·`StbDrawingAxes` 건수. (참고 예상: 전부 0.)
10. **`StbAxes` 자체가 없는 파일**이 있으면 적어라. (참고: diffchecker-mini210.)
11. **다음 phase를 위한 사실 (이번 phase는 읽지 않는다 — 값만 적어라)**: 파일별로 ① `StbColumn@kind_structure`의 값별 분포, ② `StbColumn@name`의 distinct 목록(최대 20개), ③ `StbSecColumn_RC@name`의 distinct 목록, ④ `StbSecColumn_RC`·`StbSecColumn_S`·`StbSecBarColumn_RC_RectSame`·`StbSecBarColumnRectSameSimple`·`StbSecBarBeam_RC_Same`·`StbSecBarBeam_RC_ThreeTypes`·`StbWall`·`StbSlab`·`StbBeam`·`StbBrace`·`StbFooting`·`StbPile`의 건수, ⑤ `depth_cover`로 시작하는 속성을 가진 요소명의 distinct 목록.
12. **ver 2.1 현실 샘플 탐색**: `gh search code '"ST_BRIDGE version=\"2.1.0\""'`와 `gh search code 'StbSecBarColumnRectSameSimple extension:stb'`를 돌려 **`total_count`와 HTTP 결과를 그대로** 적어라. `gh`가 인증·레이트리밋으로 실패하면 「검색 불가」를 `note`에 적어라 — **이것은 반증이 아니다**.
13. **전 요소 인구조사 (step 3의 `unsupported` 기대값 정본)**: 4개 .stb 각각에 대해 **문서에 나타나는 모든 요소명과 그 건수**를 이름 오름차순으로 전부 적어라(`element_census`). 파서를 쓰지 말고 여는 태그만 정규식(`<([A-Za-z_][\w.:-]*)[\s/>]`)으로 센다. **이 항목이 없으면 step 3의 `unsupported` 기대값을 손으로 유도할 수 없어 검증자가 파서 출력을 베끼게 된다** — 반드시 4파일 전부 적어라.

## 하지 말 것
- `src/`·`tests/`·`docs/` 아래 어떤 파일도 만들거나 고치지 마라. 이 스텝의 산출은 보고서와 `.cache/stb/` 다운로드뿐이다.
- **`docs/ADR.md`를 고치지 마라** — ADR은 Claude가 쓴다. 어긋난 것은 반증으로 적기만 하라.
- 전제가 어긋나는 것을 「고치지」 마라. 고치면 검증자가 구현자가 되어 교차검증이 무너진다.
- `.cache/`의 `.stb`·`.xsd`·`.zip`을 커밋하지 마라. `.gitignore`를 우회하지 마라.
- XSD를 `tests/`나 `src/`로 복사하지 마라 — 재배포 라이선스가 미확인이다.
- 파서를 만들지 마라. 세는 것은 grep·python 정규식이다.
- npm 패키지를 설치하지 마라. `stbridge-api`·`st-bridge`는 무관한 패키지다.
- 검증 스크립트를 `src/` 아래에 만들지 마라 — `phases/33-stbridge-skeleton-import/` 안에 `.py`로 두어라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라 — 하네스가 쓰는 파일이라 작업 중 더러운 것이 정상이다.
- `scripts/execute.py` 실행 금지 — 재귀다. 하네스 프로세스를 `taskkill`·`kill`·`Stop-Process`로 끊지 마라(자식인 너 자신까지 끊긴다).

## 산출물
`phases/33-stbridge-skeleton-import/step0-report.json`:

```json
{
  "premises": [{"id": "adr004-ifc-unargued", "verdict": "upheld|refuted", "evidence": "파일:행 또는 원문 인용", "note": ""}],
  "corpus": [{"file": "", "url": "", "sha256": "", "sha256_matches_spec": true, "bytes": 0, "version": "", "encoding_declared": "", "replacement_chars_when_declared": 0}],
  "xsd": [{"version": "", "file": "", "sha256": "", "bytes": 0, "found": true, "url": ""}],
  "skeleton_attr_sets": {"StbStory": {"2.0.1": [], "2.0.2": [], "2.1.0": [], "2.1.1": []}},
  "axis_groups": [{"file": "", "group_name": "", "angle": "", "origin_x": "", "origin_y": "", "axis_count": 0}],
  "element_census": [{"file": "", "counts": {}}],
  "axes": [{"file": "", "group_name": "", "labels": [], "distances": [], "spans_mm": [], "node_id_counts": []}],
  "axis_node_mismatch": [{"file": "", "group_name": "", "label": "", "distance": "", "node_coords": []}],
  "empty_node_list_axes": [{"file": "", "group_name": "", "count": 0}],
  "stories": [{"file": "", "levels": [{"name": "", "height": "", "kind": ""}], "adjacent_diffs": []}],
  "nodes": [{"file": "", "total": 0, "by_kind": {}}],
  "unsupported_axis_kinds": [{"file": "", "StbArcAxes": 0, "StbRadialAxes": 0, "StbDrawingAxes": 0}],
  "next_phase_facts": [{"file": "", "column_kind_structure": {}, "column_names": [], "sec_column_rc_names": [], "element_counts": {}, "elements_with_depth_cover": []}],
  "gh_search": {"version_query_total": 0, "element_query_total": 0, "note": ""},
  "verdict": "upheld|refuted"
}
```

`summary`(한 줄): 전제 7건 중 upheld/refuted 수 + 반증 시 어느 id가 왜 무너졌는지 + 「축·階 실측을 4파일 전부 기록했는가」.

## 종결
「전제 목록」의 7건 중 하나라도 어긋나면 status `refuted` + `summary`에 반증 요지. 「기록 항목」의 값이 참고 예상과 달라도 그것은 반증이 아니다 — 실제 값을 적고 계속하라. 반증 성립은 실패가 아니라 이 스텝의 정상 종결이며, 게이트이므로 뒤 스텝은 돌지 않는다.
