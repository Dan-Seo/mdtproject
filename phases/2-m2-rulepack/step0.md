# Step 0: spec-transcribe

M2(룰팩 정식화)의 첫 칸이다. `標準仕様書 R7` 5章의 배근 표를 기계 추출해 골든테스트의 원문 픽스처를 만든다. 이 step은 **룰팩 YAML을 건드리지 않는다** — 픽스처만 만든다. 룰팩 갱신은 step 1·2가 한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/M0-FINDINGS.md` — §1(표 소재: 表5.3.1~5.3.6의 PDF 쪽·인쇄 쪽·텍스트/이미지 판정), §5(재현 방법 — PyMuPDF 추출 절차와 병합 셀 경고)
- `/docs/SOURCES.md` — 정본 URL과 SHA-256 해시 표
- `/tests/golden/` — 기존 골든 픽스처의 구조(`fixtures/markup.json` 등, 출처 쪽·표 기록 방식)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### 1. 원문 PDF 확보 — `.cache/`

- `.cache/` 디렉토리를 만들고(gitignore 됨) `https://www.mlit.go.jp/gobuild/content/001888816.pdf`(標準仕様書 R7, 약 15MB)를 내려받아라.
- SHA-256이 `8fd3c83ca92b01a26e53071efdb3e871e4b5672583f8473ba062cbcc45759acc`와 일치하는지 검증하라. 불일치하면 **문서가 개정된 것이므로 즉시 status를 `blocked`로 기록하고 중단하라** — 개정판 전사는 사람의 판단이 필요하다.
- Python이 필요하다: `py -m pip install --user pymupdf` (또는 `python -m pip`). 설치가 불가능하면 `blocked`.

### 2. 추출 스크립트 — `scripts/extract_spec_ch5.py`

PyMuPDF로 PDF 쪽 32~39(인쇄 쪽 26~33)에서 아래 항목을 추출하는 스크립트를 작성하고 실행하라.

| 대상 | 소재 | 추출 방식 |
|---|---|---|
| 表5.3.1 折曲げ内法直径 | PDF 33쪽 | 텍스트 |
| 表5.3.1 折曲げ図 フック余長 (180°/135°/90°/幅止め筋) | PDF 33쪽 | **이미지** — `get_pixmap()`으로 렌더한 PNG를 `.cache/`에 저장하고 판독값을 기록. `imageRead: true` 표시 |
| 表5.3.2 重ね継手 L1/L1h | PDF 34쪽 | 텍스트 (11행 × 2 = 22셀) |
| 表5.3.4 定着 L1/L2/L1h/L2h | PDF 36쪽 | 텍스트 (11행 × 4 = 44셀). **L3/L3h는 小梁·スラブ 전용이므로 제외 (ADR-005)** |
| 表5.3.5 投影定着 La | PDF 37쪽 | 텍스트 (11행). **Lb는 제외** |
| 5.3.4(5)(ｲ) 折曲げ定着 조건 (余長 하한·투영정착 하한) | PDF 37쪽 | 텍스트 (2건) |
| 表5.3.6 最小かぶり厚さ 중 柱·梁 관련 셀 | PDF 39쪽 | 텍스트 |
| 5.3.5(2) 加工用かぶり = 最小かぶり + 10mm | PDF 39쪽 | 텍스트 |
| 軽量コンクリート 가산 주석 (表5.3.2·5.3.4·5.3.5) | 각 표 주석 | 텍스트 (3건) |
| D35以上 重ね継手 금지 (5.3.4(1)) | PDF 36쪽 | 텍스트 (1건) |

**주의: `get_text()`는 表5.3.4의 병합 셀을 읽기 순서대로 주지 않는다** (M0-FINDINGS §5). 각 표를 `get_pixmap()`으로 렌더한 PNG(`.cache/table-5-3-N.png`)와 대조해 행·열 배정을 확정하라. 셀 텍스트 순서를 그대로 믿지 마라.

### 3. 픽스처 — `tests/golden/fixtures/spec-r7-ch5.json`

추출 결과를 하나의 JSON으로 저장하라. 스키마:

```jsonc
{
  "source": { "doc": "公共建築工事標準仕様書（建築工事編）", "edition": "令和7年版", "sha256": "8fd3...", "url": "https://..." },
  "entries": [
    {
      "table": "表5.3.2",          // 표·조항 번호
      "pdfPage": 34, "printedPage": 28,
      "kind": "lap.L1",            // 매핑될 룰 키
      "conditions": { "grade": "SD345", "fcBand": "24-27", "hook": false },
      "value": 35, "unit": "d",
      "imageRead": false           // 이미지 판독값이면 true
    }
  ]
}
```

- `fcBand`는 표의 Fc 구간 라벨을 그대로 적는다 (예: `"18"`, `"21"`, `"24-27"`, `"30-36"` — 실제 표 표기를 따를 것).
- 행 수 검산: 세 표 모두 SD295 4행 / SD345 4행 / SD390 3행 = 11행이어야 한다 (M0-FINDINGS §1). 다르면 추출이 잘못된 것이다.

### 4. 픽스처 무결성 테스트 — `tests/golden/spec-fixture.test.ts`

픽스처 자체의 구조를 고정하는 테스트를 작성하라 (룰팩과 아직 대조하지 않는다):
- JSON이 파싱되고 필수 필드가 전부 있다
- `lap.L1`+`lap.L1h` 22셀, `anchorage.L1/L2/L1h/L2h` 44셀, `anchorage.La` 11셀
- 모든 entry에 `table`·`pdfPage`·`printedPage`가 있다 (쪽·표 없는 픽스처 금지 — CLAUDE.md 골든테스트 규칙)

## Acceptance Criteria

```bash
npm run lint
npm run typecheck
npm test
npm run test:golden
npm run build
```

추가로: `tests/golden/fixtures/spec-r7-ch5.json`이 존재하고 위 셀 수 검산을 통과할 것.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 픽스처의 모든 entry에 쪽·표가 기록돼 있는가? (CRITICAL — 사후 대조의 유일한 단서)
   - `.cache/`가 커밋에 포함되지 않았는가? (`git status`로 확인 — PDF·PNG는 gitignore 대상)
   - 룰팩 YAML·`src/` 코드를 건드리지 않았는가?
3. `phases/2-m2-rulepack/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 픽스처 경로·엔트리 총수·이미지 판독 건수를 적어라 (다음 step이 이 픽스처를 소비한다)
   - 3회 시도 후 실패 → `"status": "error"` + `"error_message"`
   - PDF 다운로드 불가·해시 불일치·Python 설치 불가 → `"status": "blocked"` + `"blocked_reason"` 후 즉시 중단

## 금지사항

- **PDF·PNG를 커밋하지 마라.** 이유: 15MB 바이너리는 레포를 망가뜨리고, 정본은 docs/SOURCES.md의 URL·SHA-256이다. `.cache/`는 gitignore 되어 있다.
- **이 step에서 룰팩 YAML을 수정하지 마라.** 이유: 전사(픽스처)와 등재(룰팩)를 분리해야 골든테스트가 순환 참조가 되지 않는다.
- **셀 값을 기억이나 일반 지식으로 채우지 마라.** 이유: 이 프로젝트의 존재 이유가 "기억으로 채운 그럴듯한 값"의 배제다. 추출 실패 셀은 비워두고 summary에 보고하라.
- **`建築工事標準詳細図`(001157902.pdf 등 6분책)를 근거로 쓰지 마라.** 이유: M0에서 배근 상세가 없음을 확인하고 근거 목록에서 제외했다 (ADR-003).
- 기존 테스트를 깨뜨리지 마라.
