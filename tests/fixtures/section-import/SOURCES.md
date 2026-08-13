# 断面リスト 취입 파서 — 검증 도면 출처

도면 인식(로컬) 트랙의 파서 검증용 실물 構造図 PDF 목록. **PDF 원본은 커밋하지 않는다**
(공공 발주 도면의 재배포 허용 여부가 불명확하다). `.cache/`에 아래 파일명으로 두고,
무결성은 SHA-256으로 대조한다. 커밋하는 것은 두 가지다:

- `textitems/*.json` — pdf.js로 추출한 위치 있는 텍스트 조각(TextItem). 좌표계는 좌상 원점, y 아래 방향, 단위 pt
- `expected/*.json` — 도면을 **눈으로 읽어 독립 전사한** 기대값 (ADR-010 준용 — 파서 출력에서 유도 금지)

## 표제란 제외 (개인정보)

도면 우하단 표제란에는 관리건축사 실명·사무소 주소·전화·메일이 들어 있다. 원본
재배포를 피하려고 PDF를 커밋하지 않으면서 텍스트 전문을 커밋하면 같은 내용을
재배포하는 셈이 되므로, `scripts/extract-textitems.mjs`의 `excludeFrom`(페이지별
표제란 좌상단 모서리, 실측)이 그 사각형의 아이템을 픽스처에서 떨어낸다:

| 픽스처 | excludeFrom (x, y) | 근거 |
|---|---|---|
| ojkk-p2/p3 | (660, 715) | 표 내용 최대 x≈650 (y≥715 대역), 표제란 시작 x≈731 |
| yokohama-p13/p14 | (1850, 1540) | 표제란 시작 x≈1857·y≈1560, 표 내용은 y<1540 |
| kani-p38 | (480, 1095) | 표제란 시작 x≈484·y≈1104, リスト 내용은 y<840 |

`tests/section-import/textitems.test.ts`의 밀도 하한(≥600)은 이 제외 후의 실측
최솟값(ojkk-p2 707) 아래로 잡은 값이다.

| .cache 파일명 | 발주처 | 공사명 | 사용 페이지 | SHA-256 |
|---|---|---|---|---|
| `dwg-ojkk-zumen6.pdf` | 沖縄県住宅供給公社 | (仮称)公社赤道都市再生住宅整備工事（建築） 令和1年度 | p2 柱リスト (S-13), p3–4 梁リスト (S-15) | `dcb9504a50d8661a76bbd96c412a20f468cfff7495167cd055ca0bb2289e1343` |
| `dwg-yokohama.pdf` | 横浜市建築局 | 金沢区総合庁舎改築工事（第2工区建築工事） 平成28年8月 | p13 柱·小梁断面リスト (S-C13), p14 大梁断面リスト (S-C14) | `37d20dbab2dec0721d77ed9dfce74cce6685cd9c9f2e34fec4f346bf5d2e237b` |
| `dwg-kani-kids.pdf` | 岐阜県可児市 | 可児市立桜ケ丘小学校キッズクラブ新築工事 平成29年8月 | p38 基礎伏図·基礎リスト·地中梁リスト (S-08) | `6d4b0f806b429a0103facf10189f75ef87568303459759fbc2826988fc037c8f` |

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
npx dev-browser --browser kijun --timeout 150 run tests/e2e/uc12-section-import.js
```
