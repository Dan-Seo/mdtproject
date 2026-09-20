# Step 3: `active` を正直にする — stale な pairKey を画面から見えるようにする

phase 51 step 1 は解除ボタンの `if (!active) return` を外し、stale な `filter.pairKey` を**消せる**ようにした。独立レビュー `phases/51-filter-stale-pairkey/step3-review.md` の MAJOR 指摘1は、それが欠陥の半分しか閉じていないと指摘する。**残り半分をここで閉じる。**

## 残っている欠陥(レビューが実測で辿った経路)

1. 検査を実行し、`ReviewPane.tsx:262-268` の select でペア P を選ぶ。
2. 別案件を読み込む。`PlanImport.tsx:720` が `loadProject` を呼ぶが、`PlanImport` は `planActions`(`src/app/page.tsx:42`)にあり検討タブでも常設。`setResult` は `runCheck`(`ReviewPane.tsx:451`)からしか呼ばれず、部分木の key は `result.checkId`(`:573`)なので view は mount したまま、`filter.pairKey === P` が残る。
3. 画面は一見正常になる: select は `all`、件数は `N / N件`、解除ボタンは `aria-disabled="true"`(`:299`)。**画面のどこにも解除を促すものがなく、状態を直せる唯一のコントロールが「やることは無い」と表示している。**
4. 最初の案件に戻すと P が `availablePairs` に復帰し、**利用者が何もしていないのにペア絞り込みが再適用され、所見表が黙って少なく表示される。**

step1 はこの害を 事実 節に書きながら、直す対象をクリア可能性だけに絞った。step1-report.json の `chosen_fix` は「最小」と述べるが、この残りには触れていない。

## 直すもの — 1式だけ

`src/components/review/ReviewPane.tsx:186` の `active` を、正規化後だけでなく **state と表示のズレ** も見るようにする。レビューが提示した最小形:

```ts
const active = isFilterActive(effectiveFilter) || filter.pairKey !== safePairKey
```

これで既定状態は不変(`filter.pairKey === 'all' === safePairKey` ⇒ `active === false`)、stale 状態では解除ボタンが**光る** — つまり ARIA の契約(`aria-disabled` は「反応しない」を意味する)も同時に回復し、stale な状態が利用者から**見える**ようになる。

実装者はこの形を採ってもよいし、同じ2点(可視性と ARIA の整合)を満たす別の形を採ってもよい。採った理由を `step3-report.json` に書け。effect を足す形にするなら、前値と同じとき同じ参照を返して無限ループを避けること。

**壊してはならないもの:**

- 既定状態で `filterFindings` が **元の配列参照** を返すこと(`src/lib/review/finding-filter.ts:164-166`)。
- 既定状態の `[data-testid='review-findings']` の DOM が現行と同一であること。デスクトップ実機で `main` とハッシュ一致まで取ってある(`phases/50-review-filter/step6-desktop-acceptance.md`)。
- `ReviewPane.test.tsx:863`(既定状態で `aria-disabled === 'true'`)。
- HTML の `disabled` 属性を付けるな — `ReviewPane.test.tsx:968` が不在を固定しており、phase 50 の R2-B1 はフォーカスが `<body>` に飛ぶことを理由にこの形を選んでいる。
- step 1 が入れた2本のテストの**意図**。片方は下記のとおり期待値が変わる。

## テスト

### 1. 既存テストの期待値をこの変更に合わせる(唯一の許される書き換え)

`ReviewPane.test.tsx:932` は stale 状態で `aria-disabled === 'true'` を表明している。これは step 1 の scope を転写したもので、レビュー指摘4がこの一行を「次の修正を壊す」と名指ししている。**この変更の後、stale 状態では `'false'` が正しい。**

期待値をひっくり返すだけで済ませるな。同じ箇所に「**なぜ** stale 状態でボタンが活性でなければならないか」— 利用者がこの状態を直せるための唯一の入口だから — をコメントで残せ。

これは「通らないテストを通すために期待値を書き換える」ことの例外にあたる。挙動の変更が意図されたものであり、その意図をレビューが独立に導いたからだ。**他のどの表明も書き換えるな。**

### 2. stale 状態で解除ボタンが活性になる(この step の反証テスト)

新規テスト。step 1 の `clears a stale pair key after loading another project` と同じ手順で stale 状態を作り、**解除を押す前に** 表明する:

- 解除ボタンの `aria-disabled` が `'false'`
- select の表示は `'all'`(表示上の正規化は据え置き)
- 件数表示は全件(`N / N件`)

`active` を元の式に戻すと落ちること、そして `}, 20000)` を付けること(698行を描くので。同ファイル `:831` に先例がある)。

**`step3-report.json` の `mutations` には、実際に戻して走らせた出力を貼れ。** 打ち直すな — step 1 の report はここを言い換えてしまい、レビュー指摘6になっている。Vitest の `toBe` は受け取り側を先に出す形で表示される。

### 3. 既定状態は動かない

既存の `keeps the default filter state unchanged when reset is clicked` が守る。ただしレビュー指摘7: `:949` で掴んだ `findingsTable` を `:964` で使い回しているため、部分木が remount しても検知できない。**クリック後に `screen.getByTestId` で取り直すよう直せ。** 表明の意味は変えない。

## Acceptance Criteria

```bash
npx vitest run src/components/review
npx tsc --noEmit && npm run lint && npx vitest run && npm run test:golden
```

`npm run lint` の警告は **2件が既定**(`phases/49-joint-review-defects/step1-report.json:50`)。3件目を出すな。

`npx vitest run` は `ReviewPane.test.tsx` の `targets the checked joint, not the current selection, when an item comes from a finding` が host 負荷で 20000ms を超えて落ちることがある。**これは未変更 main でも落ちる既知のもので、この step の担当ではない**(`phases/51-filter-stale-pairkey/step2-ci-parity.md`)。落ちた場合は report にそう記録し、そのテストを触るな。

## 산출물

`step3-report.json`:

```json
{
  "chosen_fix": "採った式と、可視性・ARIA整合の2点をどう満たすか",
  "changed_files": [],
  "tests_added": [],
  "tests_amended": [{ "test": "...", "from": "...", "to": "...", "why": "..." }],
  "mutations": [
    { "mutation": "active を元の式に戻す", "failing_test": "...", "observed": "実際の出力を貼る" }
  ],
  "default_state_unchanged": "既定で filterFindings が元配列参照を返すことをどう確かめたか",
  "known_host_failure": "上記の既知テストが落ちたかどうか",
  "paths_verified": [
    "src/components/review/ReviewPane.tsx",
    "src/components/review/ReviewPane.test.tsx"
  ]
}
```

## 禁止事항

- `src/lib/review/finding-filter.ts` を触るな。必要なのは呼び出し側の1式だ。
- `tests/e2e/**` を触るな。`uc25-joint-review.js`・`uc26-findings-filter.js` は実機受入の基準だ。
- `src/lib/review/geometry-check.ts`・`src/lib/store.ts`・viewer 配下を触るな。
- 解除ボタンに `onKeyDown` を足すな。空表示に `role="status"` を足すな。
- §テスト1 で名指しした一行以外、既存の表明を消すな・緩めるな。
