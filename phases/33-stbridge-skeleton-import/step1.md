# Step 1: 코퍼스를 등록하고 .stb 바이트의 인코딩을 판정해 읽는다 (파서는 아직 없다)

**전제**: step 0이 `completed`다. `.cache/stb/`에 .stb 4건과 XSD가 있고 해시가 맞다. `phases/33-stbridge-skeleton-import/step0-report.json`이 이 스텝의 수치 정본이다.

## 배경
인코딩 판정을 파서보다 먼저 세운다. 잘못 디코드해도 **XML 파싱은 성공하고 문자열만 조용히 깨지기** 때문이다 — 실물 `diffchecker-filea.stb`가 실제로 `encoding="Shift_JIS"`다. 그리고 코퍼스를 여기서 등록하는 이유는, 뒤 스텝의 로컬 전용 테스트가 전부 `tests/fixtures/stb-import/SOURCES.md`에서 SHA-256을 뽑아 대조하기 때문이다.

원본 .stb는 **커밋하지 않는다.** 이유는 `tests/fixtures/section-import/SOURCES.md`와 다르다 — .stb에는 개인정보가 없고 MIT지만, 제3자 저작물을 통째로 재배포하는 판단을 이 스텝에서 하지 않기 위해서다. 커밋하는 것은 이 레포가 만든 합성 픽스처와, step 2가 뽑을 중간표현 JSON이다.

## 할 일 (테스트 먼저 — TDD)
1. `tests/fixtures/stb-import/SOURCES.md`를 만들어라. 담을 것:
   - 「**원본 .stb·.xsd는 커밋하지 않는다.** `.cache/stb/`에 두고 URL·SHA-256만 여기에 적는다」 선언.
   - 표 1: 실물 .stb 4건 — 저장 파일명 / 출처 repo / **커밋 SHA 고정 URL** / SHA-256 / bytes / ST-Bridge 버전 / 선언 인코딩. 값은 **step0-report.json에서** 가져와라.
   - 표 2: 공식 XSD — zip URL / zip SHA-256 / xsd 파일명 / xsd SHA-256 / bytes.
   - 「## 라이선스」 절 — 3개 repo(hrntsm/STBDotNet, hrntsm/HoaryFox, NS-NS/STB-DiffChecker)가 전부 MIT임을 적고, 각 repo의 `LICENSE`에 실린 **저작권 표기를 그대로 옮겨 적어라**. 파생물(중간표현 JSON)이 이 원본에서 나왔다는 사실도 적어라.
   - 「## 이 코퍼스가 대표하지 못하는 것」 절 — 지금은 **비워 두고 「step 5에서 실측으로 채운다」**라고만 적어라.
   - 「## 재현 절차」 — `curl` 명령과 `sha256sum` 대조 명령을 그대로 붙여넣을 수 있게.
2. `.gitattributes`에 `*.stb -text` 한 줄을 추가하라(레포에 `.gitattributes`가 없으면 새로 만들어라). autocrlf 설정에 따라 Shift_JIS 픽스처의 바이트열이 달라져 해시 단언이 흔들리는 것을 막는다.
3. `src/lib/import/stb/types.ts`를 만들어라(**TDD 훅 면제 대상**이라 테스트 없이 바로 쓸 수 있다). 이 스텝에서 정의하는 것:
   ```ts
   export type StbEncoding = 'utf-8' | 'shift_jis';
   export const STB_ISSUES = [
     '対応外バージョン', '未対応エンコーディング', 'XML解析不能', 'ST-Bridge形式でない',
     '非直交通り芯', '未対応通り芯種別', '通り芯グループ数不一致', '通り芯方向不明',
     '通り芯距離解釈不能', '通り芯位置重複', '通り芯ラベル欠落', '通り芯未検出',
     '通り芯位置と節点の不一致',
     '階レベル解釈不能', '階レベル重複', '地下レベル未対応', '対応外の階種別', '階不足',
   ] as const;
   export type StbIssue = (typeof STB_ISSUES)[number];
   ```
   **자유 문장을 싣지 마라 — 코드만이다.** 코드 옆에 「어느 규칙이 이 코드를 낸다」를 한 줄 주석으로 달아라(미사용 코드가 남지 않게).
4. `src/locales/ja.json`·`ko.json`에 **18개 전부** `stbImport.issue.<코드>` 키를 추가하라. 도메인 용어는 일본어 원어를 유지한다(ADR-008) — 한국어 로케일도 부재·부위 용어는 원어를 쓰고 설명만 한국어로 적어라. `src/lib/import/stb/types.test.ts`를 `src/lib/import/framing-plan/types.test.ts:23-40`과 같은 형태로 써서, `STB_ISSUES`의 모든 코드에 두 로케일 키가 있는지 단언하라.
5. `src/lib/import/stb/decode.test.ts`를 **먼저** 쓰고 `decode.ts`를 구현하라.
   `decodeStbBytes(bytes: ArrayBuffer): { ok: true; text: string; encoding: StbEncoding } | { ok: false; issue: '未対応エンコーディング'; declared: string }`
   - 선두 512바이트를 `latin1`로 가디코드해 `<?xml ... encoding="X"?>`를 정규식으로 뽑는다.
   - 정규화(대소문자 무시): `utf8`·`utf-8` → `utf-8`, `shift_jis`·`shift-jis`·`sjis`·`windows-31j` → `shift_jis`. 선언이 없거나 encoding 속성이 없으면 `utf-8`.
   - 그 밖의 라벨은 **추측하지 말고** `ok:false` + 선언 원문을 돌려준다. 예외를 던지지 마라.
   - `new TextDecoder(enc)`로 전체를 디코드한다. **인코딩 변환 라이브러리를 npm에서 추가하지 마라** — `shift_jis`는 WHATWG Encoding Standard의 필수 레이블이라 Node·브라우저 양쪽에서 동작한다.
   - **디코드 결과를 보고 인코딩을 재시도하지 마라.** 치환문자가 나와도 선언을 신뢰하고 그대로 돌려준다(재시도를 넣으면 이 phase의 인코딩 오라클이 죽는다).
6. 합성 픽스처를 만들어라.
   - `scripts/stb/make-sjis-fixture.py` — UTF-8 텍스트 파일을 읽어 **XML 선언의 `encoding="UTF-8"`을 `encoding="Shift_JIS"`로 바꾼 뒤** `str.encode('cp932')`로 써 내는 최소 스크립트. **선언 치환을 빼먹지 마라** — 바이트만 CP932이고 선언은 UTF-8인 파일이 나오면 `decodeStbBytes`가 `utf-8`로 판정해 7.의 첫 단언만 실패하는데, 8.의 바이트 가드는 그대로 통과하므로 원인이 선언이라는 것이 어디에도 드러나지 않는다. **이 스크립트를 커밋하라**(재현 가능해야 한다). 파일명이 `test_`로 시작하지 않으므로 `python -m pytest scripts/ -q`가 수집하지 않는다.
   - `tests/fixtures/stb-import/synthetic/mini-utf8.stb` — 손으로 쓴 최소 .stb. `<?xml version="1.0" encoding="UTF-8"?>`, `<ST_BRIDGE version="2.0.2">`, `StbCommon@project_name="基準階サンプル"`, `StbAxes` 안에 `StbParallelAxes` 2그룹(`group_name="Y" angle="0.0"` 축 Y1/Y2 distance 0/5000, `group_name="X" angle="270.0"` 축 X1/X2/X3 distance 0/6000/12000, 각 축에 `StbNodeIdList`), `StbNodes`에 그 교점 6개(`kind="ON_GRID"`, X·Y·Z 포함), `StbStories`에 `StbStory` 3개(`1FL` height 0.0 kind GENERAL, `2FL` height 4000.0 kind GENERAL, `RFL` height 7500.0 kind ROOF). **모든 요소명·속성명은 step0-report.json의 `skeleton_attr_sets`에 실재하는 것만 쓰고 하나도 지어내지 마라.**
   - `tests/fixtures/stb-import/synthetic/mini-sjis.stb` — 같은 내용이되 선언이 `encoding="Shift_JIS"`이고 본문이 **실제 CP932 바이트**다. 6.의 스크립트로 만들어라.
7. `src/lib/import/stb/decode.test.ts`(jsdom)의 단언:
   - `mini-sjis.stb`를 바이트로 읽어 `decodeStbBytes`에 넣으면 `encoding === 'shift_jis'`이고 `text`에 「基準階サンプル」가 **깨지지 않고** 들어 있다.
   - `mini-utf8.stb`도 같은 문자열을 낸다. 두 결과의 `text`가 **문자 단위로 동일**하다.
   - 같은 `mini-sjis.stb` 바이트를 `new TextDecoder('utf-8')`로 강제 디코드하면 「基準階サンプル」가 **나오지 않는다**(대조 단언 — 이것이 없으면 UTF-8 파일에 선언만 붙인 가짜 픽스처가 통과한다).
   - XML 선언이 없으면 `utf-8`. `utf8`·`Shift-JIS`·`sjis`·`windows-31j` 각각이 올바르게 정규화된다.
   - `encoding="EUC-JP"`면 `{ok:false, issue:'未対応エンコーディング', declared:'EUC-JP'}`이고 예외를 던지지 않는다.
8. `tests/stb-import/fixture-bytes.test.ts`(**node 프로젝트, CI 상시**)를 만들어라.
   - `mini-sjis.stb`의 바이트열이 **유효한 UTF-8이 아니다**를 단언하라(`new TextDecoder('utf-8', {fatal:true})`가 던지는지). 이것이 「선언만 Shift_JIS인 가짜 픽스처」를 막는 유일한 장치다.
   - `mini-utf8.stb`의 바이트열은 유효한 UTF-8이다.
   - 두 파일에서 정규식으로 뽑은 **요소명·속성명 집합이 서로 같다**.
9. `src/lib/import/stb/real-decode.test.ts`(**jsdom, 로컬 전용**)를 만들어라.
   - `existsSync(resolve(process.cwd(), '.cache/stb/<파일>'))`로 존재를 보고 `describe.skipIf(...)`로 감싼다. **`describe`의 제목에 문자열 `real-decode`를 반드시 넣어라**(예: `describe.skipIf(...)('real-decode: .cache/stb の実物 .stb（ローカル限定）')`) — AC 5와 step 4의 `local-only-not-load-bearing`이 **스킵된 테스트 이름**으로 이 구간의 존재를 확인하므로, 제목에 없으면 파일명이 `real-decode.test.ts`여도 확인이 실패한다. **`describe` 안에는 정적 `it`을 써라 — `it.each(available)`를 쓰지 마라**(vitest가 skipped를 0으로 보고해 뒤 스텝의 「스킵 수가 0이 아니다」 검사가 거짓 실패한다).
   - `SOURCES.md`를 읽어 정규식 `` /`([a-f\d]{64})`/u ``로 각 파일의 기대 SHA-256을 뽑고, 실제 파일 해시와 `toBe`로 대조하라. 표에 해시가 없으면 `throw`하라(`tests/section-import/real-pdf.test.ts:70-91`의 방식 그대로).
   - `diffchecker-filea.stb`: `decodeStbBytes(...)`가 `encoding === 'shift_jis'`이고, 결과 텍스트의 `U+FFFD` 개수가 **0**이다.
   - `dotnet-sample1.stb`·`hoaryfox-sample.stb`·`diffchecker-mini210.stb`: `decodeStbBytes`가 `ok:true`이고 `encoding`이 step0-report.json이 보고한 값과 같다. **`U+FFFD` 개수는 단언하지 말고 report에 적기만 하라** — 선언과 실제 바이트가 어긋난 파일이 있을 수 있고, 이 스텝은 그것을 고치는 곳이 아니다.

## 하지 말 것
- **파서를 쓰지 마라.** 이 스텝에 `document.ts`·`candidates.ts`는 없다. `DOMParser`를 쓰지 마라.
- `.cache/`의 `.stb`·`.xsd`·`.zip`을 커밋하지 마라. XSD를 `tests/`나 `src/`로 복사하지 마라(라이선스 미확인).
- XML 파서·인코딩 변환 라이브러리를 npm에서 설치하지 마라. `DOMParser`와 `TextDecoder`뿐이다.
- 디코드 결과에 치환문자가 있다고 다른 인코딩으로 재시도하지 마라 — 선언을 신뢰한다.
- `src/lib/import/{types,textitems,runs,pdf-text,story-label}.ts`와 `section-list/`·`framing-plan/`을 수정하지 마라 — .stb는 좌표 재조립이 필요 없어 공용층을 하나도 쓰지 않는다.
- `src/domain/` 아래에 .stb 코드를 만들지 마라.
- .stb를 네트워크로 가져오는 코드를 만들지 마라 — 입력은 `ArrayBuffer`뿐이다. `fetch`·`XMLHttpRequest`는 eslint와 pre-commit이 막는다.
- `docs/ADR.md`·`CLAUDE.md`·`AGENTS.md`·`.github/workflows/*`를 수정하지 마라. `package.json`의 `dev`·`build`·`lint`·`test`·`test:golden` 값을 바꾸지 마라(`tests/scaffold.test.ts`가 고정한다).
- 취입 UI·file input·e2e 파일을 만들지 마라.
- `phases/**/step*-codex.*.log`·`step*-invoke.json`을 지우지 마라.
- 검증 스크립트를 `src/` 아래에 만들지 마라.
- `scripts/execute.py` 실행 금지 — 재귀다. 하네스 프로세스를 죽이지 마라.

## AC
`npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

그 위에:
1. **흔들기 A**: `decode.ts`의 `shift_jis` 정규화 분기를 지우고 항상 `'utf-8'`을 쓰게 바꾸면 `decode.test.ts`의 「基準階サンプル」 단언이 실패한다. 무엇을 바꿨고 **어느 테스트가 어떤 메시지로** 깨졌는지 report에 적고, **같은 턴 안에 반드시 원복해** `git status --porcelain`이 비었음을 보여라.
2. **흔들기 B**: `mini-sjis.stb`를 UTF-8로 다시 인코딩해 덮으면 `tests/stb-import/fixture-bytes.test.ts`의 「유효한 UTF-8이 아니다」 단언이 실패한다. 메시지를 적고 원복하라.
3. **흔들기 C**: `STB_ISSUES`에 코드를 하나 더하고 로케일 키를 안 넣으면 `src/lib/import/stb/types.test.ts`가 실패한다. 메시지를 적고 원복하라.
4. `STB_ISSUES`가 정확히 **18개**이고 그 전부에 `stbImport.issue.*` 키가 ja·ko 양쪽에 있다.
5. `.cache/stb/`를 임시로 다른 이름으로 옮긴 상태에서 `npm run test`가 통과하고, **그때 스킵된 테스트 이름에 `real-decode`가 들어 있다**. 스킵 수와 이름을 report에 적고 `.cache/stb/`를 되돌려라.
6. `git diff main --stat -- src/domain src/rulepack src/lib/import/framing-plan src/lib/import/section-list src/components .github/workflows docs/ADR.md package.json` 이 **비어 있다**. 출력을 report에 붙여라.
7. `git log main..HEAD --stat | grep -c '^ .cache/'` 가 `0`이다.

## 산출물
`phases/33-stbridge-skeleton-import/step1-report.json`: `files`(만든 파일 목록), `sources_md`(등록한 6~7건의 URL·SHA-256), `issues`(STB_ISSUES 18개와 ja/ko 키 확인), `fixtures`(두 합성 .stb의 바이트 수·유효 UTF-8 여부), `real_decode`(4파일별 encoding·U+FFFD 개수·스킵 여부), `mutations`(흔들기 3건 각각 — 흔든 내용·실패 테스트 파일·실패 메시지 원문·원복 확인), `cache_absent_run`(스킵된 테스트 이름 목록·통과 여부), `untouched_tracks`(6.의 `git diff` 출력).

`summary`(한 줄): 「코퍼스 N건을 SOURCES.md에 등록하고 인코딩 판정을 세웠다. Shift_JIS 픽스처가 실제 CP932 바이트임을 바이트 단언으로 고정했고, 인코딩 분기를 흔들면 실패함을 확인했다.」
