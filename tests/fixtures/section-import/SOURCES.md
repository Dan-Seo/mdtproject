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
| karatsu-fukuzu/shousai/hashirashin/jikugumi1/jikugumi2 | (580, 770) | ≈(594.4–598.1, 780.2) | x≈551 이하 (해당 대역에 표 내용이 없는 면 포함) | x 29·14 / y 10.2 |
| fuji-p15/p17/p18/p20 | (1000, 720) | ≈(1018.4–1019.1, 733.3) | x≈783 이하 (y≥720 대역) | x 217·18.4 / y 13.3 |
| ina-p6/p7 | (980, 720) | ≈(991.6, 724.3–724.8) | x≈868 이하 (y≥720 대역) | x 112 / y 4.3 |
| saiki-p1/p2 | (470, 785) | ≈(482.7–483.9, 792.6) | x≈43 이하 (y≥785 대역) | x 427·12.7 / y 7.6 |
| tsu-p16/p20/p21/p22 | (590, 1115) | ≈(615.8–616.2, 1122.4–1122.5) | x≈566 이하 (y≥1115 대역) | x 24·26 / y 7.4 |
| hirosaki-p21/p25 | (720, 770) | ≈(732.7, 776.4) | x≈724 이하 (y≥770 대역) | x 4·12.7 / y 6.4 |
| shibata-p1/p7/p13 | (1660, 1500) | ≈(1682.5, 1512.4) | x≈1660 미만 (y≥1500 대역) | x 10·22.5 / y 12.4 |

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
| `dwg-karatsu-fukuzu.pdf` | 一般社団法人唐津東松浦薬剤師会 | （仮称）救急・夜間対応会営薬局新築工事 (S造·RC基礎) | p1 基礎伏図 (S-3) | `a6712f907e4b17d787e9b1add3e726d960d31340846139269127e9b3aceb068e` |
| `dwg-karatsu-shousai.pdf` | 一般社団法人唐津東松浦薬剤師会 | 同上 | p1 基礎詳細図·地中梁リスト (S-4) | `9b41afc2706874535a0bfaa90c73bca87a2d4781fd2a03c15be4cae77fa81e75` |
| `dwg-karatsu-hashirashin.pdf` | 一般社団法人唐津東松浦薬剤師会 | 同上 | p1 1階柱芯線図 (S-7) | `f2a33838a377b9c072a643333cbbad1a9c775b13335772598068b14dc11a8792` |
| `dwg-karatsu-jikugumi1.pdf` | 一般社団法人唐津東松浦薬剤師会 | 同上 | p1 軸組図(1) (S-9) | `88cc5a750569d6c4e2e3517b3553c25ad123fe4647504f9417a0ea72b9e87ac9` |
| `dwg-karatsu-jikugumi2.pdf` | 一般社団法人唐津東松浦薬剤師会 | 同上 | p1 軸組図(2) (S-10) | `82789e1ea94b707d3ea8b6aa5bee0c949abcb61f775b9ea950dcb06ec69302a3` |
| `dwg-fuji-kanritou.pdf` | 富士河口湖町小立土地区画整理組合 | 平成22年度 新大堀配水場築造工事(建築工事) 管理棟 (RC) | p15 基礎伏図, p17 梁・床伏図, p18 軸組図(1), p20 柱・梁・壁・スラブ断面リスト | `5cf1575f4b596b3e070257f1cc386abc98731d116b4b3f5891c12874684d9e0d` |
| `dwg-ina-pump.pdf` | 長野県伊那市 | 令和4年度開発計画関連小黒原産業適地ポンプ施設築造工事 | p6 構造伏図・軸組図 (S-6), p7 部材リスト (S-7) | `7caf348f1b590f68bcd8efe70efef4e63c7693ebe3fc05df7b5a5cb0e00aabca` |
| `dwg-saiki-fire.pdf` | 大分県佐伯市 | 令和2年度 佐伯市消防署東部分署建設(建築主体)工事 | p1 大梁・小梁リスト (S-11), p2 柱・壁・スラブリスト (S-12) | `0c74b592bf9c4bf20f196645596dc3c64c24cfa4ccce0e5ec8fe95b96710ce20` |
| `dwg-tsu-kanritou.pdf` | 三重県津市 | 旧津市民プール跡地テニスコート整備工事 管理棟 (S造·RC基礎) | p16 杭・基礎・1階伏図 (S-16), p20 2階・屋根伏図 (S-20), p21 軸組図(1) (S-21), p22 軸組図(2) (S-22) | `e09d156150d191096b190283f455e4e7c6875bb8000f89048aabda2326acfc7f` |
| `dwg-hirosaki-kikyono.pdf` | 青森県弘前市 | 令和7年度 桔梗野小学校等複合施設新築工事(建築工事) 構造図1 | p21 1階床梁伏図 (S-019), p25 軸組図(1) (S-023) | `f4dfcfab190970d8df305ce53319b98efb17873b81e77462b112a89978135fa8` |
| `dwg-shibata-fire.pdf` | 新発田地域広域事務組合 | 新発田広域消防本部解体工事（既存建物 構造図一式） | p1 1F伏図 (S-1), p7 柱リスト (S-7), p13 軸組図 (S-13) | `e9b5225f841e58d1434127e0d179e45422d91a4246cf7c2b9175b37232daf985` |

### 전수 조사 후 제외한 페이지

- yokohama p5 杭伏図・杭リスト — 말뚝은 산정 스코프 밖 부재다.
- kani p42 (S-12) — 軸組図는 p40·p41과 동형이고 나머지는 S造 部材リスト다.
- kani p44 (S-14) — 별동 소도면 여럿이 한 장에 혼재해 코퍼스 대표성이 낮다.
- kani p45–48 — 解体撤去図로, 기설 건물의 도면이다.
- ojkk p5–7 — セルボイドスラブ 시공 표준·배근구분도이며 リスト 표가 아니다.


제2차 수집(2026-09-02·03)에서 제외한 페이지:

- karatsu 5·6 (基礎リスト·基礎詳細) — 基礎(フーチング)는 스코프 밖 부재. 14 (雑) — 부재 도면이 아니다
- fuji p16 基礎詳細図·基礎梁リスト, p19 軸組図(2) — 미전사(p17·p18·p20으로 대표성 충분)
- ina p8 이후 — 部材リスト가 p7 한 장이다
- saiki p3〜p7 — 伏図·軸組図는 別 파일(미입수)이고 이 파일은 リスト 2면＋기타
- tsu p23 部材リスト — S造 部材(柱·梁 강재)라 스코프 밖. p17〜p19 基礎·杭 상세 — 스코프 밖
- hirosaki p17 ボーリング柱状図, p20 基礎伏図(추정, 미확인) — RC リスト는 構造図1에 없다(別冊)
- shibata p8〜p10 大梁リスト1〜3 — 미전사(p7 柱リスト로 대표)

다운로드 URL (2026-08-12 수집 시점):

- ojkk: https://www.ojkk.or.jp/userfiles/files/nyusatu_akamiti/zumen6.pdf
- yokohama: https://www.city.yokohama.lg.jp/kanazawa/kusei/shiteikanrisha/kobo_kekka/20210330.files/0039_20190917.pdf
- kani: http://www.city.kani.lg.jp/secure/14358/zumentenkiku.pdf

다운로드 URL (2026-09-02·03 수집 시점, 제2차):

- karatsu: `http://karayaku.org/kaiei/入札関係書類/公告用資料/図面/構造図面/N.　<図面名>.pdf` — 번호 뒤가 **全角 공백**이다. 3.基礎伏図 / 4.基礎詳細図 / 7.1階柱芯線図 / 9.軸組図(1) / 10.軸組図(2). Git Bash의 curl은 일본어 인자를 깨뜨리므로 Python `urllib.parse.quote`로 받았다
- fuji: https://www.town.fujikawaguchiko.lg.jp/upload/file/kanri/kokuji/H22koukoku/chiikigentei/20107_sinnoohori_kenntiku_kanri.pdf
- ina: https://www.kkj.go.jp/d/?L=ja&A=bmFnYW5vL2luYV9jaXR5LzIwMjIvMjAyMjA2MjFfMDE0MjZfMDMucGRmCg== (nagano/ina_city/2022/20220621_01426_03.pdf)
- saiki: https://www.kkj.go.jp/d/?L=ja&A=c2VhcmNoL2VsaXMtcHJlZi1vaXRhLzIwMjAvMjAyMDA3MDNfMDc4MDdfMTAucGRmCg== (search/elis-pref-oita/2020/20200703_07807_10.pdf)
- tsu: https://www.info.city.tsu.mie.jp/_res/projects/default_project/_page_/001/013/722/003-2.pdf
- hirosaki: https://www.city.hirosaki.aomori.jp/jouhou/keiyaku/koukoku/8_A_kikyouokouzouzu1.pdf
- shibata: https://www.shibata-kouiki.jp/association/uploads/2-3.%E6%A7%8B%E9%80%A0%E5%9B%B3%E4%B8%80%E5%BC%8F.pdf

### 제2차 수집 도면의 특성 (파서·추출기가 걸리는 곳)

- **pdf.js CMap 미탑재면 텍스트 0건** — fuji(Acrobat Distiller 6, 비내장 MS-Gothic Identity-H)·shibata(iText/ARCDRAW, 90msp-RKSJ-H)는 `getDocument`에 `cMapUrl`·`cMapPacked`·`standardFontDataUrl`을 주지 않으면 모든 페이지가 0건이다. 경고도 없다. Node에서는 `cMapUrl`이 `file://` URL이 아니라 **파일시스템 경로 문자열**(`node_modules/pdfjs-dist/cmaps/`)이어야 한다(실측). 제품 `src/lib/import/pdf-text.ts`도 같은 옵션이 없어 브라우저에서도 같은 도면이 조용히 빈 결과가 됐다 — phase 36 step 0에서 고친다
- **겹쳐 그린 글자** — saiki는 모든 글자를 같은 자리에 최대 7번 겹쳐 그린다(太字 흉내). p1 16,289건·p2 15,267건이고 겹친 글자끼리 좌표 편차가 x·y 최대 0.48pt·w 0.017pt라 정확히 같은 좌표가 아니다(정확 일치 키로는 15,791건이 남는다)
- **/Rotate 90** — karatsu·fuji·saiki·tsu는 페이지 회전이 90이다. pdf.js viewport가 회전을 반영하므로 `toTextItems`의 좌표는 회전 후 좌상 원점이다
- **X·Y 접두 없는 通り芯 라벨** — ina(1·2·3 / A·B), fuji(E〜A / 1·2), shibata(1〜7 / A〜C, 別 블록 X1·X2·A'〜C'). 현행 `AXIS_LABEL_PATTERN`은 `[a-z]?[XY]\d+`뿐이라 전부 `通り芯ラベル未検出`이다
- **合計 없음·부분합 있음** — karatsu 伏図에는 合計이 없고 부분합(4,010·4,165)이 있다. 쉼표 없는 치수(hirosaki 8000·88000)도 있다
- **표제란** — 전 발주처 도면의 우하단 표제란에 설계사무소 실명·주소·電話가 있다(karatsu 平野建築設計事務所, tsu ジェイエイ津安芸, saiki 松井設計, hirosaki 佐藤総合計画・蟻塚設計共同体 등). 페이지별 제외 경계는 `title-block-exclusions.json`에 실측으로 둔다. 2차 22면의 경계와 같은 대역 표 내용 최대값은 위 표에 추가했다

2차 22면의 표제란 제외 경계와 같은 대역의 표 내용 최대값은 위 표에 추가했다. 생성된 22개 픽스처를 인접 텍스트로 재조립해 `/TEL|FAX|℡|電話|一級建築士|設計事務所|株式会社|共同体/`를 검사한 결과는 0건이며, 표제란 밖 注記에서의 예외도 없었다.

## 왜 이 코퍼스인가

- **발주처 상이 10곳**(1차 3곳 ＋ 2차 7곳: 唐津·富士河口湖·伊那·佐伯·津·弘前·新発田) — 포맷 변동(작성 사무소·CAD·PDF 생성기)이 실제로 존재함을 보장한다
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
