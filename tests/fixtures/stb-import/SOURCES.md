# ST-Bridge 취입 코퍼스

**원본 `.stb`·`.xsd`는 커밋하지 않는다.** 원본은 `.cache/stb/`에만 두고, 이 문서에는 출처 URL과 SHA-256만 기록한다. 커밋하는 합성 픽스처와 step 2의 중간표현 JSON은 이 원본에서 파생된다.

## 실물 `.stb`

| 저장 파일명 | 출처 repo | 커밋 고정 URL | SHA-256 | bytes | ST-Bridge 버전 | 선언 인코딩 |
|---|---|---|---:|---:|---|---|
| `dotnet-sample1.stb` | `hrntsm/STBDotNet` | https://raw.githubusercontent.com/hrntsm/STBDotNet/2e742685700456ac10a3ed326ca99be75acd6b33/TestStbFiles/ver2/Sample1.stb | `50df079abaf5514d88129b7e0ad194fb959d6bd2757126baebab650072ff391a` | 63177 | 2.0.1 | UTF-8 |
| `diffchecker-filea.stb` | `NS-NS/STB-DiffChecker` | https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/FileA.stb | `fb350d0efcec007219ccc73d975175f4f694f422619dbc416ba133b18433ebe2` | 117138 | 2.0.2 | Shift_JIS |
| `hoaryfox-sample.stb` | `hrntsm/HoaryFox` | https://raw.githubusercontent.com/hrntsm/HoaryFox/f991f97df99e307c449c4c0bc0cb85b514cc5e8c/Samples/SampleBuilding.stb | `83d35a8eeb57177d409766804e36288ff325d141d05a7cba4b58fff221257629` | 83288 | 2.0.2 | utf-8 |
| `diffchecker-mini210.stb` | `NS-NS/STB-DiffChecker` | https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/Mini210_FileA.stb | `9bf2b7b628d801f87d6d348b53b7628dfc0cc8a05989ace7787e727c697e80c5` | 1606 | 2.1.0 | utf-8 |

## 공식 XSD

| ST-Bridge 버전 | zip URL | zip SHA-256 | XSD 파일명 | XSD SHA-256 | bytes |
|---|---|---|---|---|---:|
| 2.0.1 | https://www.building-smart.or.jp/wp-content/uploads/2022/03/ST-Bridge_v201_20220316.zip | `e9294763477a18f0bc0e19aab629be4d8b1ea7ade085a688766a94dcfa5e4913` | `ST-Bridge_v201_20220316.xsd` | `3eac9a71b08c6be02fcc514b821937d24305fe0662500047108316c88a98005b` | 201033 |
| 2.0.2 | https://www.building-smart.or.jp/wp-content/uploads/2026/04/ST-Bridge_v202.zip | `f69d4ee1c4b162f50a1a05ba13c948996d743924f1eeebd7016de866a5b4da8d` | `ST-Bridge_v202.xsd` | `56cc1b80062c2385c15f8ab0745f4e96ac5b9400a4743307031e813d0253a1fa` | 331047 |
| 2.1.0 | https://www.building-smart.or.jp/wp-content/uploads/2023/05/ST-Bridge210.zip | `b694b2675001b1ac6d894cac66b7e0f357d611fb793f6dedd3d90b6aab07771e` | `ST-Bridge210.xsd` | `9f2038b7b308f411b6397e6cd2d1b0fe82169dd20c1e98cbf7d478a9d7b3583c` | 556507 |
| 2.1.1 | https://www.building-smart.or.jp/wp-content/uploads/2026/07/ST-Bridge_v211.zip | `e4690298e3233e77049633a26a05de3633b7272b5220447f60446591c4cb17fd` | `ST-Bridge_v211.xsd` | `73ab69075c2b8d5d480b40aa34f3b62d34a3d3f3099792afd34a71274343a089` | 558066 |

## 라이선스

`hrntsm/STBDotNet`, `hrntsm/HoaryFox`, `NS-NS/STB-DiffChecker`의 고정 커밋에는 모두 MIT License가 있다. 각 저장소 `LICENSE`의 저작권 표기는 다음과 같다.

- `hrntsm/STBDotNet`: `Copyright (c) 2020 hrntsm`
- `hrntsm/HoaryFox`: `Copyright (c) 2019 hrntsm`
- `NS-NS/STB-DiffChecker`: `Copyright (c) 2020 NS-NS`

커밋하는 합성 `.stb`와 이후 중간표현 JSON은 위 원본에서 파생된 저작물이다. 원본 파일 자체는 재배포하지 않는다.

## 이 코퍼스가 대표하지 못하는 것

이 절의 수치는 모두 `phases/33-stbridge-skeleton-import/step0-report.json`의
실물 전 요소 조사 결과다. 원본을 다시 파싱해 만든 값이 아니다.

### 버전과 파일 규모

| 파일 | ST-Bridge 버전 | bytes |
|---|---|---:|
| `dotnet-sample1.stb` | 2.0.1 | 63177 |
| `diffchecker-filea.stb` | 2.0.2 | 117138 |
| `hoaryfox-sample.stb` | 2.0.2 | 83288 |
| `diffchecker-mini210.stb` | 2.1.0 | 1606 |

ver 2.1 계열은 `diffchecker-mini210.stb` 한 건, 1606 bytes뿐이며 실제 규모의
파일이 아니라 최소 토이다. GitHub code search의
`ST_BRIDGE version="2.1.0"` 질의 `total_count`는 9,
`StbSecBarColumnRectSameSimple extension:stb` 질의 `total_count`는 0이었다.
따라서 이 코퍼스는 ver 2.1의 현실 규모 RC 파일이나 2.1식 RC 柱 배근 요소를
대표하지 못한다.

### 구조 종별과 RC 배근 요소

`StbColumn@kind_structure`의 실측 분포는 다음과 같다. RC 柱는
`dotnet-sample1.stb`의 17건뿐이고, S造 柱는 두 파일 합계 145건이다.

| 파일 | `kind_structure` 분포 |
|---|---|
| `dotnet-sample1.stb` | RC 17 |
| `diffchecker-filea.stb` | S 40 |
| `hoaryfox-sample.stb` | S 105 |
| `diffchecker-mini210.stb` | 柱 없음 |

| 파일 | `StbSecColumn_RC` | `StbSecBarColumn_RC_RectSame` | `StbSecBarColumnRectSameSimple` | `StbSecBarBeam_RC_Same` | `StbSecBarBeam_RC_ThreeTypes` |
|---|---:|---:|---:|---:|---:|
| `dotnet-sample1.stb` | 4 | 4 | 0 | 3 | 12 |
| `diffchecker-filea.stb` | 0 | 0 | 0 | 4 | 0 |
| `hoaryfox-sample.stb` | 0 | 0 | 0 | 0 | 0 |
| `diffchecker-mini210.stb` | 0 | 0 | 0 | 0 | 0 |

즉 RC 柱 배근을 검증하는 실물은 ver 2.0.1 한 건뿐이다. ver 2.1 요소
`StbSecBarColumnRectSameSimple`은 전 파일 0건이라, 断面 취입 트랙을 열 근거가
되지 않는다.

### 부재 종별

| 파일 | `StbWall` | `StbSlab` | `StbBeam` | `StbBrace` | `StbFooting` | `StbPile` |
|---|---:|---:|---:|---:|---:|---:|
| `dotnet-sample1.stb` | 6 | 27 | 11 | 0 | 9 | 0 |
| `diffchecker-filea.stb` | 0 | 82 | 56 | 0 | 0 | 0 |
| `hoaryfox-sample.stb` | 0 | 0 | 0 | 10 | 0 | 0 |
| `diffchecker-mini210.stb` | 0 | 0 | 0 | 0 | 0 | 0 |

ST-Bridge에서 `StbBeam`은 小梁이고 大梁는 `StbGirder`다. RC 실물
`dotnet-sample1.stb`에는 `StbGirder` 34건도 있다. 따라서 Kijun 부재 넷은
柱·大梁·耐震壁(`StbWall` 6건)·床板 모두에 적어도 한 건의 형식상 실물 근거가
있지만, 그 근거가 모두 ver 2.0.1 파일 한 건에 몰려 있다. 다른 발행자와 ver 2.1
현실 파일에서 네 부재를 재현한다는 근거는 없다. `StbBrace`·`StbFooting`은
코퍼스에 있어도 Kijun 범위 밖이고, `StbPile`은 전 파일 0건이다.

### 部材 符号와 断面 符号

| 파일 | distinct `StbColumn@name` | distinct `StbSecColumn_RC@name` | 같은 문자열 집합인가 |
|---|---|---|---|
| `dotnet-sample1.stb` | `1C1`, `1C2`, `2C1`, `2C2` | `C1`, `C2` | 아니오 |
| `diffchecker-filea.stb` | `1C1`, `1C2`, `2C1`, `2C2`, `3C1`, `3C2`, `PH1C2`, `PH1C3` | 없음 | 아니오 |
| `hoaryfox-sample.stb` | `Column` | 없음 | 아니오 |
| `diffchecker-mini210.stb` | 없음 | 없음 | 예 — 빈 집합끼리의 자명한 일치 |

유일한 RC 柱 실물에서도 `StbColumn@name`은 階 접두사가 붙고
`StbSecColumn_RC@name`은 붙지 않아 **같은 문자열이 아니다**. 部材 符号를
断面 符号로 직접 쓰는 매칭은 이 코퍼스에 의해 반증된다.

### かぶり厚さ

`depth_cover`로 시작하는 속성을 가진 요소명은 파일별로 다음과 같다.

- `dotnet-sample1.stb`(2.0.1): `StbSecBarArrangementBeam_RC`,
  `StbSecBarArrangementColumn_RC`, `StbSecBarArrangementFoundation_RC`,
  `StbSecBarArrangementSlab_RC`, `StbSecBarArrangementWall_RC`
- `diffchecker-filea.stb`(2.0.2): `StbSecBarArrangementBeam_RC`
- `hoaryfox-sample.stb`(2.0.2): 없음
- `diffchecker-mini210.stb`(2.1.0): `StbSecBarBeamSimple`

따라서 **2.0.x에도 かぶり가 있다.** 버전을 골라 ST-Bridge의 かぶり와 Kijun
룰팩의 충돌을 피할 수 없으며, 이 취입 범위가 `depth_cover*`를 읽지 않는 결정은
명시적 범위 제한이다.

### 通り芯 검산의 한계

`StbNodeIdList`에 節点 id가 하나라도 있는 축만 축 위치를 節点 좌표로 검산할 수
있다고 세었다.

| 파일 | 빈 `StbNodeIdList` 축 / 전체 축 | 節点 `kind` 분포 |
|---|---|---|
| `dotnet-sample1.stb` | 0 / 6 | `ON_GIRDER` 22, `ON_GRID` 26, `OTHER` 2 |
| `diffchecker-filea.stb` | 8 / 16 | `ON_BEAM` 20, `ON_GIRDER` 92, `ON_GRID` 54 |
| `hoaryfox-sample.stb` | 0 / 10 | `ON_GIRDER` 126 |
| `diffchecker-mini210.stb` | 0 / 0 | `ON_GRID` 2 |

전체 32축 중 검산 가능한 축은 24축(24/32)뿐이다. 그리고
`通り芯位置と節点の不一致`는 실물에서 1건 발화했다:
`diffchecker-filea.stb`의 X1a는 축 거리 3000인데 연결된 節点 x 좌표가 3500이다.
따라서 節点 좌표는 축 위치의 무조건적인 정답도 아니고, 빈 목록인 절반의 FileA
축에는 아예 검산 근거가 없다.

### 階의 한계

| 파일 | `StbStory@kind` 분포 | 최하단 레벨의 절대 `height` |
|---|---|---:|
| `dotnet-sample1.stb` | `GENERAL` 2, `ROOF` 1 | 0 |
| `diffchecker-filea.stb` | `GENERAL` 3, `PENTHOUSE` 1, `ROOF` 1 | 200 |
| `hoaryfox-sample.stb` | `GENERAL` 6 | 0 |
| `diffchecker-mini210.stb` | `GENERAL` 1 | 0 |

`diffchecker-filea.stb`의 1FL은 GL 기준 절대 표고 200이다. Kijun `Story`는
층고를 배열 순서로 누적하므로 후보를 `Story`로 옮길 때 이 200 오프셋은 사라진다.
또 `PENTHOUSE`처럼 Kijun이 담지 못하는 `kind`를 부분 제거하면 인접 층고가 빠진
구간을 흡수하므로, 이 코퍼스는 階 스택 통짜 거부 필요성만 검증한다.

### 로컬 전용 검증 구간

`.cache/stb/`가 비면 `src/lib/import/stb/real-decode.test.ts`의 실물별
decode 테스트가 스킵된다. 그때 CI는 실제 파일 bytes → 인코딩 판정 → XML
중간표현(`StbDocument`) 구간을 덮지 못한다. 반면 커밋된
`tests/fixtures/stb-import/document/*.json`과 `expected/*.json` 덕분에
중간표현 → 通り芯·階 후보 구간은 `.cache/` 없이도 CI에서 상시 검증된다.

## 재현 절차

```sh
mkdir -p .cache/stb
curl -L --fail 'https://raw.githubusercontent.com/hrntsm/STBDotNet/2e742685700456ac10a3ed326ca99be75acd6b33/TestStbFiles/ver2/Sample1.stb' -o .cache/stb/dotnet-sample1.stb
curl -L --fail 'https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/FileA.stb' -o .cache/stb/diffchecker-filea.stb
curl -L --fail 'https://raw.githubusercontent.com/hrntsm/HoaryFox/f991f97df99e307c449c4c0bc0cb85b514cc5e8c/Samples/SampleBuilding.stb' -o .cache/stb/hoaryfox-sample.stb
curl -L --fail 'https://raw.githubusercontent.com/NS-NS/STB-DiffChecker/bd9a6eb09d82e58f033e3ee542bf6874196ae924/TestData/Mini210_FileA.stb' -o .cache/stb/diffchecker-mini210.stb
sha256sum .cache/stb/dotnet-sample1.stb .cache/stb/diffchecker-filea.stb .cache/stb/hoaryfox-sample.stb .cache/stb/diffchecker-mini210.stb
```

공식 XSD zip도 표의 zip URL을 `curl -L --fail <url> -o .cache/stb/<zip 파일명>`으로 내려받은 뒤, zip과 압축 해제한 XSD에 각각 `sha256sum`을 실행해 표와 대조한다.
