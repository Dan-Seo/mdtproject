# Step 1: 解除できない stale な `filter.pairKey` を閉じる

phase 50 の独立レビューが2回とも開いたまま残した MINOR を閉じる。**この step は挙動の修正が1箇所、テストが2本だけだ。** フィルターの設計そのものは `phases/50-review-filter/step1-plan.md` で4回の反証を通っている — 作り直すな。

## 事実(両レビューが実測で確認した機構)

`src/components/review/ReviewPane.tsx`:

- `:181` `const safePairKey = availablePairs.includes(filter.pairKey) ? filter.pairKey : 'all'`
- `:184-186` `effectiveFilter` は `safePairKey` で作り直される
- `active` は `isFilterActive(effectiveFilter)` で決まる
- `:298-302` 解除ボタン: `aria-disabled={!active}` と `onClick={() => { if (!active) return; setFilter(defaultFindingFilterState()) }}`

`availablePairs` から選択中の `filter.pairKey` が消えると `safePairKey` が `'all'` に落ち、`effectiveFilter` は既定と等しくなり、`active` が `false` になる。**画面は正しい**(select は `all`、件数は `N / N件`)。しかし `filter.pairKey` には古い文字列が残り続け、`if (!active) return` により解除ボタンでは消せない。その鍵が後で `availablePairs` に戻ると、利用者が何もしていないのにペア絞り込みが復活する。

到達経路(`phases/50-review-filter/step5-post-edit-review.md` 指摘7が確認済み):
`PlanImport`・`StbImport` は `src/app/page.tsx:39-45` の `planActions` にあり、どの内訳書タブでも左ペインに常設されている。つまり **検討タブに居たまま別案件を読み込める**。`result` は `ReviewCheckSection` の state で `setResult` の呼び出し元は `runCheck` だけ(`ReviewPane.tsx:453`)なので、案件が変わっても `result` は残り、`ReviewFindingsView` の `key={result.checkId}` も変わらない。`memberKinds` は `[project.members]` で再計算されるので `availablePairs` だけが入れ替わる。

## 直すもの — 1箇所だけ

解除ボタンが「実際に設定されている状態」を必ず消せるようにする。手段は実装者が選び、選んだ理由を `step1-report.json` に書け。

想定される最小手は `:300` の `if (!active) return` を外して常に `setFilter(defaultFindingFilterState())` させることだが、それが唯一解だとは言っていない。`filter.pairKey` を `safePairKey` に寄せる effect で state 側を整える手もある。**どちらを採るにせよ次を壊すな**:

- `aria-disabled` の表示は今のまま(`!active`)。**HTML の `disabled` 属性を付けるな** — phase 50 の R2-B1 は「無効化するとフォーカスが `<body>` に飛ぶ」を理由にこの形を選んでいる。
- 既定状態で `filterFindings` が **元の配列参照** を返すこと(`src/lib/review/finding-filter.ts:164-166`)。
- 既定状態の `[data-testid='review-findings']` の DOM が現行と同一であること。これはこの phase 全体が乗っている保証で、デスクトップ実機で `main` とハッシュ一致まで取ってある(`phases/50-review-filter/step6-desktop-acceptance.md`)。
- effect を足す場合、`setFilter` が毎レンダー走る形にするな(無限ループ)。前値と同じなら同じ参照を返すこと。

## テスト(先に書く) — `src/components/review/ReviewPane.test.tsx`

既存の `describe('Finding Filter')` の中に追加する。**698行の表を描くので `}, 20000)` を付けろ**(同ファイル `:831` に先例と理由がある)。

### 1. 別案件を読み込んだあと、解除が stale な `pairKey` を消す

これがこの step の反証テストだ。**修正を戻すと落ちること**を確認して `step1-report.json` に書け。落ちないならテストが間違っている。

1. 検査を実行し、`availablePairs` の具体的な1つ(`select.options[1].value`、`'all'` でないことを表明する)を選ぶ。
2. その時点で `useAppStore.getState()` のフィルター状態ではなく **コンポーネントの見た目** を観察する: 行数が全件より厳密に少ない。
3. `act()` で別の案件を読み込み、`availablePairs` から今の鍵が消える状況を作る。`loadProject` を使うか、`updateProject` で `members` の `kind` 構成を変えるかは実装者が決めてよい。**`result` が残ったままであること**(`review-findings` が依然として存在し行数が0でない)を表明してから先へ進め — ここが崩れると経路が再現できていない。
4. 解除ボタンを押す。
5. 表明: 押したあとフィルターは既定状態である。**`select.value === 'all'` だけでは不十分だ** — 修正前からそう見えている。「元の鍵が `availablePairs` に戻ったときにペア絞り込みが復活しない」ことを見る表明を書け。例えば元の案件を読み直して行数が全件に戻ることを見る。どう書くにせよ、**修正前に落ちる表明**でなければならない。

### 2. 無効状態の解除クリックが既定状態を壊さない

`phases/50-review-filter/step5-post-edit-review.md` 指摘10 が、既存の `ReviewPane.test.tsx:898-900` は guard を消しても通る(＝反証力ゼロ)と指摘している。guard を外すならこの2行は守りとして機能しなくなる。**既定状態で解除を押しても、行数・チップの `aria-pressed`・`select.value`・`aria-disabled` が一つも動かない**ことを表明しろ。

## Acceptance Criteria

```bash
npx vitest run src/components/review
npx tsc --noEmit && npm run lint && npx vitest run && npm run test:golden
```

`npm run lint` の警告は **2件が既定** だ(`phases/49-joint-review-defects/step1-report.json:50` — stash して再実行して確認済み)。3件目を出すな。

## 산출물

`step1-report.json`:

```json
{
  "chosen_fix": "どちらを採ったか、なぜか",
  "changed_files": [],
  "tests_added": [],
  "mutations": [
    { "mutation": "採用した修正を元に戻す", "failing_test": "どのテストが落ちたか(名前)", "observed": "実際の失敗メッセージ" }
  ],
  "default_state_unchanged": "既定状態で filterFindings が元配列参照を返すことをどう確かめたか",
  "paths_verified": [
    "src/components/review/ReviewPane.tsx",
    "src/components/review/ReviewPane.test.tsx"
  ]
}
```

`mutations` は**実際に戻して走らせた結果**を書け。予想を書くな。

## 禁止事項

- `src/lib/review/finding-filter.ts` の `filterFindings`・`matchesFindingFilter` の意味を変えるな。必要なのは呼び出し側の1箇所だ。
- `tests/e2e/**` を触るな。`uc25-joint-review.js`・`uc26-findings-filter.js` は実機受入の基準で、この step の対象ではない。
- `src/lib/review/geometry-check.ts`・`src/lib/store.ts`・viewer 配下を触るな。
- 解除ボタンに `onKeyDown` を足すな(phase 50 R4-B1)。空表示に `role="status"` を足すな。
- 既存の表明を消すな・緩めるな。既存テストが落ちたら実装が違う。
- 通らないテストを通すために期待値を書き換えるな。
