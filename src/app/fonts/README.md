# 自己ホストするサブセットフォント

`next/font/google` は Google Fonts が配る **latin サブセット丸ごと**を落とす。この製品の
ラテン文字は数値・呼び名（`D25`・`SD345`・`Fc24`）と単位くらいで、画面の大半を占める
日本語・韓国語はそもそもこの2書体に無く OS のフォントへ落ちている。つまり latin サブセット
のうち実際に描かれない字形（ラテン拡張のアクセント付き文字など）に転送バイトを払っていた。

そこで Google Fonts の `text=` サブセット API で**この製品が使う字だけ**に絞った可変フォントを
取得し、`next/font/local` で自己ホストする。実測（lighthouse, desktop, `next start`）:

| ファイル | 変更前（latin サブセット） | 変更後（text サブセット） |
| --- | ---: | ---: |
| Inter | 48,732 B | 36,856 B |
| JetBrains Mono | 31,640 B | 28,268 B |

## 収録した字

- ASCII 印字可能文字 U+0020–U+007E（利用者が打つ案件名・符号はここに収まる）
- 製品が実際に出す記号のみ: U+00A0 U+00A3 U+00A5 U+00A7 U+00AB U+00B0–U+00B3 U+00B7
  U+00BB U+00D7 U+00F7 U+2010–U+2015 U+2018–U+2019 U+201C–U+201D U+2022 U+2026 U+2030
  U+2039–U+203B U+20AC U+2122 U+2191 U+2193 U+2212 U+2215

`—`（U+2014、単位質量未入力の欄）と `·`・`×`・`−`・`…`・`§`・`°`・`※` は src 全体を走査して
実際に使われていることを確認した字だ。ここに無い字（アクセント付きラテン文字など）は
**字が消えるのではなく OS のフォントで出る** — 日本語・韓国語と同じ扱いになる。
新しい記号を UI に足すときはこの一覧にも足すこと。足し忘れても壊れはしないが、
その字だけ別の書体で出る。

## 取得方法（再現手順）

```
https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap&text=<上の字>
https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..700&display=swap&text=<上の字>
```

返る CSS の `src: url(...)` を1つずつ落として `*.woff2` として置いた。可変フォント
（`font-weight: 400 700`）のままなので、太さは 400・600・700 とも従来どおり出る。

## ライセンス

いずれも SIL Open Font License 1.1 で、全文を `Inter-OFL.txt`・`JetBrainsMono-OFL.txt` に
同梱している。**元の書体の改変（サブセット化）を行っている** — OFL の予約名は使っておらず、
再配布に必要な著作権表示とライセンス全文はこのディレクトリに揃えてある。

- Inter — Copyright (c) 2016 The Inter Project Authors, https://github.com/rsms/inter
- JetBrains Mono — Copyright 2020 The JetBrains Mono Project Authors,
  https://github.com/JetBrains/JetBrainsMono
