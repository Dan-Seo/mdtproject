# 断面リスト 취입 파서 — 검증 도면 출처

도면 인식(로컬) 트랙의 파서 검증용 실물 構造図 PDF 목록. **PDF 원본은 커밋하지 않는다**
(공공 발주 도면의 재배포 허용 여부가 불명확하다). `.cache/`에 아래 파일명으로 두고,
무결성은 SHA-256으로 대조한다. 커밋하는 것은 두 가지다:

- `textitems/*.json` — pdf.js로 추출한 위치 있는 텍스트 조각(TextItem). 좌표계는 좌상 원점, y 아래 방향, 단위 pt
- `expected/*.json` — 도면을 **눈으로 읽어 독립 전사한** 기대값 (ADR-010 준용 — 파서 출력에서 유도 금지)

## 표제란 제외 (개인정보)

도면 우하단 표제란에는 관리건축사 실명·사무소 주소·전화·메일이 들어 있다. 원본
재배포를 피하려고 PDF를 커밋하지 않으면서 텍스트 전문을 커밋하면 같은 내용을
재배포하는 셈이 되므로, 페이지별 표제란 좌상단 모서리(실측) 이후의 사각형을
픽스처에서 떨어낸다. 경계는 `title-block-exclusions.json` **한 곳**에만 두고
생성기(`scripts/extract-textitems.mjs`)와 검증(`tests/section-import/textitems.test.ts`)이
같은 값을 본다 — 생성기에만 두면 경계가 바뀌어도 픽스처 검증이 눈치채지 못한다.

| 픽스처 | 제외 시작 (x, y) | 실측 표제란 시작 | 같은 대역 표 내용 최대 | 여유 |
|---|---|---|---|---|
| ojkk-p2/p3 | (660, 700) | (731.1, 725.7) | x≈605 (y≥700 대역) | x 55·71 / y 25.7 |
| yokohama-p13/p14 | (1800, 1500) | (1847.5, 1562.8) | x≈1650 미만 (y≥1340 대역) | x 47 / y 62.8 |
| kani-p38 | (440, 1040) | (484.4, 1101.0) | y≈1000 (x≥440 대역) | x 44 / y 61 |
| ojkk-p4 | (660, 700) | (731.1, 725.7) | y≈671 (x≥660 대역) | x 71.1 / y 25.7 |
| yokohama-p6 | (1800, 1500) | (1847.5, 1562.8) | y≈1409 (x≥1800 대역) | x 47.5 / y 62.8 |
| yokohama-p9 | (1800, 1500) | (1847.5, 1562.8) | y≈1383 (x≥1800 대역) | x 47.5 / y 62.8 |
| yokohama-p15 | (1800, 1500) | (1847.5, 1562.8) | y≈899 (x≥1800 대역) | x 47.5 / y 62.8 |
| kani-p39 | (440, 1040) | (484.4, 1101.0) | y≈992 (x≥440 대역) | x 44.4 / y 61.0 |
| kani-p41 | (440, 1040) | (484.4, 1101.0) | y≈992 (x≥440 대역) | x 44.4 / y 61.0 |

여유를 좌우 양쪽으로 둔 이유: 경계를 표제란 시작에 딱 붙이면 텍스트 행의 **첫 글자**가
경계 바깥에 남는다(2026-08-13 이전 경계 x=1850에서 yokohama 표제란의 「登」이
x=1847.5로 살아남아 커밋됐다). 넓힌 뒤에도 제외되는 표 내용은 없다 — 재생성 후
아이템 수는 ojkk-p2 707·ojkk-p3 1447·kani-p38 863으로 동일하고 yokohama만 1개씩
줄었다(살아남았던 표제란 글자).

`tests/section-import/textitems.test.ts`는 (1) 제외 사각형 안에 아이템이 하나도
없을 것과 (2) 각 픽스처의 제외 후 실측 아이템 수 × 0.8을 내림한 개별 밀도 하한을
함께 본다. 저밀도 도면 kani-p39 513건·kani-p41 399건 때문에 기존 픽스처의 하한까지
낮추지 않는다.

| .cache 파일명 | 발주처 | 공사명 | 사용 페이지 | SHA-256 |
|---|---|---|---|---|
| `dwg-ojkk-zumen6.pdf` | 沖縄県住宅供給公社 | (仮称)公社赤道都市再生住宅整備工事（建築） 令和1年度 | p2 柱リスト (S-13), p3 大梁リスト (S-15), p4 小梁・スラブ・壁・階段リスト | `dcb9504a50d8661a76bbd96c412a20f468cfff7495167cd055ca0bb2289e1343` |
| `dwg-yokohama.pdf` | 横浜市建築局 | 金沢区総合庁舎改築工事（第2工区建築工事） 平成28年8月 | p6 基礎伏図・1階床伏図 (S-C06), p7 2階床伏図 (S-C07), p8 軸組図(1) (S-C08), p9 軸組図(2) (S-C09), p13 柱・小梁断面リスト (S-C13), p14 大梁断面リスト (S-C14), p15 スラブリスト・壁リスト (S-C15) | `37d20dbab2dec0721d77ed9dfce74cce6685cd9c9f2e34fec4f346bf5d2e237b` |
| `dwg-kani-kids.pdf` | 岐阜県可児市 | 可児市立桜ケ丘小学校キッズクラブ新築工事 平成29年8月 | p38 基礎伏図・基礎リスト・地中梁リスト (S-08), p39 梁伏図 (S-09), p40 軸組図(1) (S-10), p41 軸組図(2) (S-11) | `6d4b0f806b429a0103facf10189f75ef87568303459759fbc2826988fc037c8f` |

### 전수 조사 후 제외한 페이지

- yokohama p5 杭伏図・杭リスト — 말뚝은 산정 스코프 밖 부재다.
- kani p42 (S-12) — 軸組図는 p40·p41과 동형이고 나머지는 S造 部材リスト다.
- kani p44 (S-14) — 별동 소도면 여럿이 한 장에 혼재해 코퍼스 대표성이 낮다.
- kani p45–48 — 解体撤去図로, 기설 건물의 도면이다.
- ojkk p5–7 — セルボイドスラブ 시공 표준·배근구분도이며 リスト 표가 아니다.

다운로드 URL (2026-08-12 수집 시점):

- ojkk: https://www.ojkk.or.jp/userfiles/files/nyusatu_akamiti/zumen6.pdf
- yokohama: https://www.city.yokohama.lg.jp/kanazawa/kusei/shiteikanrisha/kobo_kekka/20210330.files/0039_20190917.pdf
- kani: http://www.city.kani.lg.jp/secure/14358/zumentenkiku.pdf

## 왜 이 3부인가

- **발주처 상이 3곳** — 포맷 변동(작성 사무소·CAD)이 실제로 존재함을 보장한다
- **표 방향 2종** — ojkk·yokohama는 가로형(부재가 열), kani 地中梁リスト는 세로형(항목이 행)
- **엣지 케이스 포함** — 高強度筋 `K13`(BarSize 표현 불가)·`S13(KSS785)`, 원형 단면 `600φ`,
  `2段筋` 주석, カットオフ 치수 `[2500]`(스코프 밖 값), 位置(端部/中央)·階별 상이값,
  스코프 밖 부재 종별(基礎柱 FC·地中梁 FG·小梁 B)

## 재현 절차

```
# PDF 재취득 후 해시 대조
Invoke-WebRequest <url> -OutFile .cache\<파일명>
Get-FileHash .cache\<파일명> -Algorithm SHA256

# TextItem JSON 재생성 (phase 6 step 0의 스크립트)
npx tsx scripts/extract-textitems.mjs
```

### uc12 e2e (실물 PDF 브라우저 검증)

dev-browser 샌드박스는 호스트 경로를 직접 열지 못하므로 PDF를 base64로 미러링한
뒤 실행한다 (bash):

```
base64 -w0 .cache/dwg-yokohama.pdf > ~/.dev-browser/tmp/uc12-dwg-yokohama.pdf.b64
base64 -w0 .cache/dwg-ojkk-zumen6.pdf > ~/.dev-browser/tmp/uc12-dwg-ojkk.pdf.b64
npx dev-browser --browser kijun --timeout 150 run tests/e2e/uc12-section-import.js
```
