VERDICT: REFUTED

# Phase 49-1 — Findings Table Filter: Independent Falsification, Round 2

Reviewer: independent (did not author the plan, did not write round 1, will not implement).
Checkout: `632bead fix(49-joint-review-defects): close the cross-verification findings`.
Method: every `file#Lnnn` in the revised plan re-read at that line in this checkout. Round-1 findings
re-tested against the revision rather than against the original. No file edited except this one.
No build, test, or browser run — every place that limits a claim is marked.

Round 1's B3 and M1/M2/M5, and the algorithmic half of B1, are genuinely closed (§ "Confirmed fixed").
Two of the repairs are asserted but unsound, and the two headline repairs (B2's remount and M4's focus
cleanup) actively destroy each other.

---

## BLOCKERS

### R2-B1. The M3 "focus-safe reset" fix does not keep focus, and the test the plan prescribes cannot detect that

Plan L202:

> Reset button is unconditionally rendered in the DOM with `disabled={!isFilterActive(filter)}`.
> **When activated by keyboard, focus remains on the button instead of falling to `<body>`.**

Implemented at plan L387 (`disabled={!active}`) with `onClick={() => setFilter(defaultFindingFilterState())}`
(plan L389).

Activating the button by keyboard sets the filter to default → `active` becomes `false` → the button that
currently holds focus is given `disabled` in the same commit. The HTML focus fixup rule requires a user
agent to un-focus an element that stops being focusable; Chrome and Firefox both move focus to the body.
The outcome is **identical** to the conditional render round 1 rejected in M3 — the only thing that changed
is that the element stays in the DOM while unfocused. The plan states the opposite as a resolved property.

Worse, the check the plan writes for it is green on the broken implementation. Plan L675:

> Verify focus remains on the reset button (it does not unmount, M3).

That runs in `ReviewPane.test.tsx`, i.e. jsdom. jsdom does not implement the focus fixup rule — it refuses
`focus()` on a disabled element but does not blur an element that becomes disabled. So the assertion passes
while the product is broken in every real browser. This is exactly the non-falsifiable verification
`CLAUDE.md` 개발 프로세스 ③ forbids (「검증 항목은 **틀렸을 때 실패하는 것**이어야 한다」), and it is the
second time in this phase that a green AC would certify a defect (cf. the phase-7 precedent named in the
same CLAUDE.md paragraph).

**Failure scenario:** tab to the reset button in a 698-row findings table, press Enter. Filter resets,
`document.activeElement === document.body`, the keyboard user is returned to the top of the document.
`ReviewPane.test.tsx` reports PASS.

**Minimal fix:** keep the button focusable and carry the state in ARIA, not in `disabled`:
`aria-disabled={!active}` plus `onClick={() => { if (!active) return; setFilter(defaultFindingFilterState()) }}`.
Then the assertion becomes a real one — assert `document.activeElement` is still the button **and** its
`aria-disabled` flipped to `"true"`. If the plan prefers to keep `disabled`, it must delete the focus claim
at L202 and delete the assertion at L675 rather than leave a test that cannot fail.

---

### R2-B2. B2's remount destroys M4's guarantee — `focusedFindingId` lives inside the component that B2 remounts, so a re-check leaves `reviewFocus` permanently dangling

The two repairs were designed independently and are mutually destructive.

- B2's repair puts the state inside a subtree keyed on the check: `<ReviewFindingsView key={result.checkId} …>`
  (plan L228), so **a new `checkId` unmounts and remounts it**, resetting all of its `useState`.
- M4's repair puts the focus bookkeeping inside that same subtree:
  `const [focusedFindingId, setFocusedFindingId] = useState<string | null>(null)` (plan L269), and clears the
  store only from a `useEffect` guarded by `focusedFindingId !== null` (plan L285-L290).

`reviewFocus` is **not** component state — it is global store state (`src/lib/store.ts:153-154`,
`src/components/review/ReviewPane.tsx:205`, read by `src/components/viewer/Viewer3D.tsx:1837` and surfaced as
`data-review-focus` at `:2343`). It survives the remount. `focusedFindingId` does not.

So: focus a finding → enter a clearance basis → run the check again. `checkId` is a hash of
`{version, member fingerprints, checkConditions, regionMm}` (`src/lib/review/geometry-check.ts:397-402`), and
`checkConditionsFingerprint` covers `settings`, so the clearance change produces a new `checkId` → remount →
`focusedFindingId` is back to `null` → the effect's guard is false → **`setReviewFocus(null)` is never called,
for the rest of the session.** The joint viewer keeps highlighting the two segments of a finding from the
previous check, with a label built from the previous check's bars, and nothing can ever clear it. Select a
different 柱 and re-check and the marker is now pointing at bars that are not even in the displayed joint.

The plan asserts the opposite twice — §1.4 item 5 (plan L207-L210) and Risk 4 (plan L746-L749), which closes
with «*Abandonment Criterion: None; easily handled by reactive state synchronization.*» Round 1's M4 asked for
an explicit decision; the plan made one and then placed it in the one scope where it cannot hold.

**Failure scenario:** run check → click any finding row (`[data-review-focus='1']` appears, per
`tests/e2e/uc25-joint-review.js:886-887`) → type `26` into 鉄筋のあき → 検査を実行. New `checkId`, table
repopulates, `[data-review-focus='1']` still set, 3D still highlighting the old pair, no row in the new table
corresponds to the highlight, and no filter change will ever clear it because `focusedFindingId` is `null`.

**Minimal fix:** lift the focus bookkeeping out of the remounting subtree. Hold `focusedFindingId` in
`ReviewCheckSection` (which is *not* keyed and does not remount on a new `checkId`) and pass it plus its setter
into `ReviewFindingsView`; then the M4 effect sees a live id across the remount and clears `reviewFocus` when
the finding stops matching. Additionally clear on a genuinely new check: in `runCheck`, call
`setReviewFocus(null)` / `setFocusedFindingId(null)` whenever the produced `checkId` differs from the current
`result?.checkId`. (A cleanup on `ReviewFindingsView` unmount is a cheaper alternative and is e2e-safe —
Scenario 7 at `tests/e2e/uc25-joint-review.js:906-936` and Scenario 14 at `:1105-1143` read cards and
findings text, never `data-review-focus` — but it also clears focus on a plain tab switch, which is a
behaviour change the plan has not chosen.)

The plan must also say which of the two it wants, because the remount and the effect currently answer the
same question differently.

---

## MAJOR

### R2-M1. M6 is not closed — the guard does not bind `ALL_FINDING_KINDS` to `FindingKind`, so a fourth kind is silently hidden by default with no "filter is active" signal

Plan L20-L31 declares the array and the guard as two independent literals:

```ts
export const ALL_FINDING_KINDS: readonly FindingKind[] = ['干渉候補','あき不足候補','接触'] as const
const _exhaustivenessGuard: Record<FindingKind, true> = { 干渉候補: true, あき不足候補: true, 接触: true }
```

Nothing derives one from the other. Round 1's M6 fix text asked for a guard «keyed off the array»; §2 item 1
(plan L440) and §1.2 (plan L14) both claim M6 is resolved by this.

Walk the failure: add a fourth member to `FindingKind` (`src/domain/review/types.ts:48`). The `Record` fails to
compile → the implementer adds `新種: true` to the `Record` → **it compiles** → `ALL_FINDING_KINDS` still has
three entries → `defaultFindingFilterState()` (plan L46-L52) seeds `kinds` with three → every finding of the
new kind is filtered out **in the default state**, no chip exists to turn it back on, and `isFilterActive`
(plan L59-L66) reports `false` because `filter.kinds.size (3) === ALL_FINDING_KINDS.length (3)` and every
member of the three-element array is present. The reset button is `disabled`, the count reads N/N, and a
whole class of findings is invisible in a tool whose purpose is to surface them. That is M6's stated failure
mode, unchanged.

The repo already has the correct idiom: `src/components/viewer/palette.ts:5`
(`} as const satisfies Record<RebarZone['kind'], string>`).

**Fix:** make the array a projection of the table —
`const KIND_TABLE = { 干渉候補: true, あき不足候補: true, 接触: true } satisfies Record<FindingKind, true>;`
`export const ALL_FINDING_KINDS = Object.keys(KIND_TABLE) as readonly FindingKind[]`. One declaration, the
union enforces it, and the unused-variable warning in R2-m2 disappears with it.

### R2-M2. §6.3's performance AC names no baseline — the baseline half of it cannot fail, and a recorded baseline exists uncited

Plan L707-L711:

> - `sample.check_ms <= 3000` … `stress5.check_ms <= 3000` … `budget_met === true`
> - Report measured `check_ms` for both projects **against pre-change baselines**.

Round 1's B1 fix item (3) asked for the AC to run `uc25-perf.js` on both projects «against the **recorded**
pre-change baseline». The plan kept the phrase and dropped the record. There is no number, no file, and no
instruction to capture one before the change, so "against pre-change baselines" is unfalsifiable — a run that
regresses `stress5.check_ms` from 551 to 2900 satisfies every stated criterion.

The baseline exists and the plan does not cite it:
`phases/48-joint-review-ui/step9-report.json#/perf_browser/sample/check_ms` = **96** and
`#/perf_browser/stress5/check_ms` = **551**, measured under the conditions recorded at
`#/perf_browser/conditions`, with `#/perf_browser/budget_met` = true. `CLAUDE.md` requires exactly this
(「픽스처에는 출처 쪽·표를 함께 적을 것 — 사후 대조의 유일한 단서다」).

That report also records something the plan should carry forward: `#/perf_browser/spread_note` and
`#/perf_browser/individual_samples_over_budget/stress5` show two *individual* stress5 samples already at or
past budget (a 3034 ms `compare_ms` against 3000, a 765 ms `tab_switch_ms` against 500). The gate is the
median (`tests/e2e/uc25-perf.js:205-208`), so this is not a blocker, but the plan's `budget_met === true`
criterion inherits a known-marginal measurement and says nothing about it.

**Fix:** write the two baseline numbers and their JSON pointers into §6.3, and state the regression threshold
explicitly (e.g. "fail if `stress5.check_ms` exceeds 2× the 551 ms baseline, even if under 3000").

*Not verified:* I did not run `uc25-perf.js`. On the algorithm alone the fix looks ample — `memberKinds` is
built in `ReviewCheckSection` (plan L217-L220), which is already mounted when 検査を実行 is clicked, so the
`O(members)` Map build is **outside** the `measureCheck` window (`tests/e2e/uc25-perf.js:127-136`), and the work
that *is* inside is `extractAvailablePairs` + `filterFindings` at `O(findings)` against a 96 ms / 551 ms
baseline under a 3000 ms budget. See also R2-m9 on the memo dependency.

### R2-M3. The filter's vocabulary does not exist anywhere in the table it filters, and the rationale for collapsing it is mis-cited

`barMemberRole` (plan L104-L110) builds pair labels from `member.kind` — `柱`/`大梁`
(`src/domain/model/member.ts:90,205,477`) — and `normalizeRoleGroup` (plan L84-L95) collapses
`上端筋`/`下端筋`/`上端カットオフ筋`/`下端カットオフ筋` into `主筋`. So the dropdown offers `大梁主筋 × 柱帯筋`.

The table those options filter shows neither token. `formatBarRef` (`src/components/review/ReviewPane.tsx:79-83`)
renders **section marks and raw roles** — `G1 / 上端筋 / D25 / #0`, `C1 / 帯筋 / D13 / #1`. A user who selects
`大梁主筋` gets rows that say `上端筋` and never says `大梁` or `主筋` anywhere. Nothing in the plan bridges the
two vocabularies, and the collapse is one-way: filtering to just `上端筋 × 帯筋` — the natural question at a
接合部 — is not expressible.

The stated justification is wrong on its own terms. Plan L81-L82:

> (matching `GirderMainRow` domain terminology and `viewer.layer.main`)

There is no `viewer.layer.main`. The real thing is `roleToLayer` at `src/lib/viewer/geometry.ts:78-95`, and it
maps **seven** roles to `'main'` — the five the plan lists plus `腹筋` (`:92`) and `縦筋` (`:94`).
`normalizeRoleGroup` maps neither, so a 大梁腹筋 finding (腹筋 is shipped — M3c 고유 상세 완료) produces the pair
token `大梁腹筋` while the cited authority would put it in `主筋`. The design may well be right; the citation
does not support it. `GirderMainRow` (`src/domain/model/member.ts:124-134`) is a counts record with no role
vocabulary at all and supports nothing here.

**Fix:** either (a) key the pair on what the table already prints — `${sectionMarkLabel(...)} / ${ref.role}`,
reusing `formatBarRef`'s first two segments so the dropdown and the rows say the same thing — or (b) keep the
kind+group collapse and say in the plan why the coarser axis is the useful one, citing
`src/lib/viewer/geometry.ts:78-95` accurately (including that `腹筋`/`縦筋` are deliberately *not* folded in).

---

## MINOR

### R2-m1. `review.check.filter.title` is specified in both locales and rendered nowhere

§2 item 5 (plan L469) says "Add **8** new i18n keys", §3 (plan L493) lists `review.check.filter.title`
= `指摘の絞り込み` / `지적 필터`, usage "Section title / group context". The JSX (plan L316-L431) renders seven:
`.kind` (L322), `.pair` (L353, L355), `.pair.all` (L359), `.hideExcluded` (L375), `.itemsUnit` (L382),
`.reset` (L390), `.empty` (L426). The eighth is orphaned — it was the `aria-label` for the `role="region"`
that m4 correctly removed (plan L212-L213), and the key survived the removal. Drop it, or use it as a visible
`<h4>` for the bar.

### R2-m2. `_exhaustivenessGuard` is an unread module-scope binding — a lint warning, not a compile error

`eslint-config-next/typescript.js` sets `@typescript-eslint/no-unused-vars` to `1` (warn), and `npm run lint`
is bare `eslint .` (`package.json:11`) with no `--max-warnings`, so this warns rather than fails. `tsconfig.json`
sets no `noUnusedLocals`, so `tsc` is silent. It is still noise that the R2-M1 fix removes for free.

### R2-m3. `ReviewPane.test.tsx:829` is a comment, not an assertion, and §6.2 turns it into a hard-coded oracle

Plan L624, under the heading «§5.3 … Existing Assertions Constraining the Design»:

> **Line 829:** Confirms sample project geometry check produces 698 finding rows.

`src/components/review/ReviewPane.test.tsx:829` is
`// 検査を実行して 698 件の所見表を描き、そのうえで項目を作り直す分だけ重い。` — a comment explaining why the
test above it carries a `20000` ms timeout (`:831`). It asserts nothing and constrains nothing. Round 1's m2
described it correctly as corroboration; the revision promoted it to an assertion.

The number itself is fine (`phases/48-joint-review-ui/step8-report.json#/original_failure/observed_table/rowCount`
= 698, kinds `{干渉候補: 106, 接触: 592}`). What follows from the promotion is not: §6.2 item 1 (plan L669)
prescribes «Verify table row count equals **698**», where every existing test in the file derives the count
from the oracle instead — `ReviewPane.test.tsx:167` is
`expect(findings.querySelectorAll('tbody tr')).toHaveLength(expected.findings.length)` with `expected` from
`directGeometryCheck()` (`:196`, `:205`, `:272`). Hard-coding 698 into a new test breaks that convention and
drifts silently the first time the sample project changes. Use `directGeometryCheck().findings.length`.

### R2-m4. `phases/48-joint-review-ui/step8-report.json#/original_failure` is an archived *failing* run and §5.4/§6.2 quote it flatly

That object carries `"status": "unchanged_archived_failure"` and `"acceptance": false`; the 106/592 split is
the table observed during the failure that step 8 went on to fix. The totals agree with
`ReviewPane.test.tsx:829` so I have no reason to doubt the numbers, and round 1 said the same. But a spec
handed to codex that cites a `original_failure` pointer as current fact (plan L626-L628, L694) should say
that it is the preserved pre-fix observation, per `phases/48-joint-review-ui/step8-correction.md`.

### R2-m5. §4.6's remount-invariance claim is false for a same-input re-run — and Scenario 7 is exactly that case

Plan L531-L532:

> Because `<ReviewFindingsView>` is keyed by `result.checkId`, **any new check run** (or remount following tab
> switching as in Scenario 7) instantiates fresh state with `defaultFindingFilterState()`.

`checkId` is a content hash of `{version, member fingerprints, checkConditions, regionMm}`
(`src/lib/review/geometry-check.ts:397-402`). Re-running with nothing changed returns the **same** `checkId` —
that is precisely what Scenario 7 asserts (`tests/e2e/uc25-joint-review.js:919-927`, `value.checkId === checkId1`).
The key does not change, React does not remount, and the filter survives. Scenario 7 gets its default state
from the ReviewPane tab remount that clears `result` entirely (`:908-918`), not from the key. The parenthetical
conflates two different mechanisms and the "any new check run" half is wrong.

Behaviourally this leaves a reset rule the user cannot see: the filter clears iff an opaque hash moved.
Re-run with a changed clearance → filter clears; re-run to refresh → filter persists. Either is defensible;
silently alternating is not. State which one is intended and correct L531.

### R2-m6. The reconciliation and `isFilterActive` read different pair keys, so they can disagree

`isFilterActive` tests `filter.pairKey !== 'all'` (plan L61) while the table is filtered by `safePairKey`
(plan L277, L283). In the one state the reconciliation exists for — a `pairKey` that is no longer in
`availablePairs` — they disagree: `filterFindings` passes everything (effectivePairKey `'all'`), the count
reads 698 / 698, the `<select>` shows `すべてのペア`, and the reset button is nevertheless **enabled** because
`filter.pairKey` is still the stale string. Harmless, but it means the two B2 repairs are not consistent with
each other. Reconcile once and feed the result to both: compute `safePairKey`, then
`isFilterActive({ ...filter, pairKey: safePairKey })`.

Note that with the `key={result.checkId}` remount in place this state is nearly unreachable — `availablePairs`
depends on `result.findings` and `memberKinds`, both fixed for a mounted instance except when `project` changes
without changing the joint's fingerprints. The "defense in depth" is therefore close to dead code; that is a
reason to make it consistent, not a reason to keep it unexamined.

### R2-m7. §6.2 item 3's B2 test selects a pair the plan never shows exists, and its one falsifying assertion is not the one it names

Plan L676-L680 instructs: select `柱帯筋 × 柱帯筋`, enter 26 mm, re-run, «Verify pair select shows `すべてのペア`
and table is not empty». Two problems. (a) Nothing in the plan establishes that `柱帯筋 × 柱帯筋` appears in the
sample project's `availablePairs`; if it does not, the step is unexecutable and codex will substitute a pair of
its own choosing — the implementer picking the oracle. (b) Entering a clearance basis only *adds*
`あき不足候補` findings (`tests/e2e/uc25-joint-review.js:772` vs `:837`), so the previously selected pair almost
certainly still exists in the new result; "table is not empty" therefore passes with **or without** the fix.
The only assertion that falsifies is "pair select shows `すべてのペア`". Say so, and derive the pair to select
from `extractAvailablePairs` at runtime rather than naming a literal.

### R2-m8. `localeCompare` with no locale argument decides the canonical pair-key order, and §6.1 asserts the literal result

`findingPairKey` sorts the two role tokens with `left.localeCompare(right)` (plan L123) and
`extractAvailablePairs` sorts the option list the same way (plan L139). §6.1 item 5 (plan L651-L652) asserts the
literal string `柱主筋 × 大梁主筋`. Collation for CJK under the host default locale is not fixed across
Node/ICU builds and the browser, so that literal is an environment-dependent assertion. Symmetry (the property
that actually matters) holds regardless. Either pin the collator (`localeCompare(right, 'ja')`) or assert
symmetry and membership instead of the literal ordering.

### R2-m9. `memberKinds` is memoised on `[project]`, which is coarser than it needs to be

Plan L217-L220: `useMemo(() => new Map(project.members.map((m) => [m.id, m.kind])), [project])`. `project` is
replaced on every edit, including 断面 `b` commits — which is what `measureCompare`
(`tests/e2e/uc25-perf.js:139-165`) times against a 3000 ms budget whose stress5 median is already 925 ms with
one sample at 3034 ms (`phases/48-joint-review-ui/step9-report.json#/perf_browser/spread_note`). The rebuild is
`O(members)` over a 4×3×5 fixture (`scripts/perf/stress-fixture.ts:19-20`), i.e. a few hundred entries, so the
magnitude is negligible — but `[project.members]` is both tighter and free, since a section edit leaves the
`members` array reference untouched.

### R2-m10. The remount throws away every `<tr>` DOM node, so a row that holds keyboard focus loses it on re-check

Today `setResult` reconciles the table by `key={finding.id}` (`src/components/review/ReviewPane.tsx:344`) and
React reuses the `<tr>` nodes for findings present in both results, so a focused row (`tabIndex={0}`, `:345`)
keeps DOM focus. With `key={result.checkId}` on the wrapper (plan L228) the whole subtree is destroyed and
rebuilt, and focus falls to `<body>`. This is the same failure round-1 M3 raised for the reset button,
re-introduced one level up by the B2 fix. Small in practice — you must leave the table to press 検査を実行 —
but the plan claims focus-safety as a resolved property and this is an unacknowledged regression against it.

### R2-m11. Two citation ranges still point one element away from the line that carries the claim

- Plan L550 heads the block «Lines 257–263 (`readFindingRows` & `parseFindingRows` — line numbers verified, m1)».
  The quoted range is now correct for `readFindingRows` (`tests/e2e/uc25-joint-review.js:257-263` ✓, m1 fixed).
  But the constraint the plan derives from it — «asserts every `tbody tr` has at least 6 cells» — lives at
  `:107` (`if (!Array.isArray(cells) || cells.length < 6) return null`) inside `parseFindingRow`, with the throw
  at `:127`. Neither line is in the cited range. Cite `:106-112` for the rule.
- Plan L614 labels «Lines 251–255 (`budgetMet`)». `budgetMet` is `tests/e2e/uc25-perf.js:253-255`; `:251` is
  `const stress5 = await measureProject(...)`. Content correct.

### R2-m12. §3's i18n guard citation overstates what the test covers

Plan L489: domain terms «`干渉候補`, `あき不足候補`, `接触`, `柱`, `大梁`, `主筋` … guarded by
`src/lib/i18n.test.ts:50-57`». That test (`translates UI labels without translating domain terms`) asserts
`t('ko', 'domain.column')` etc. for six `domain.*` **keys**. `干渉候補`/`あき不足候補`/`接触` are never keys —
they are `FindingKind` values rendered raw (`ReviewPane.tsx:349`, plan L361) — and nothing guards them. The
*behaviour* is right and matches `CLAUDE.md:20`; only the claim that a test enforces it is false.

---

## Ground round 1 opened that the revision still leaves open

Recorded so the next round does not mistake these for new.

1. **Empty `result.findings`.** The empty notice is gated on `result.findings.length > 0` (plan L425), so a
   check that legitimately finds nothing renders a table with a caption, an empty `tbody`, a "0 / 0件"
   summary and no message — the same silent state M2 objected to, in the one case M2's condition excludes.
   `verdictFor` has a `未対象` path (`src/lib/review/geometry-check.ts:246-256`) that can produce it.
2. **Two live regions announce at once.** The always-mounted count `<span role="status" aria-live="polite">`
   (plan L381) and the newly-inserted `<p role="status">` (plan L425) both fire on the transition to zero rows.
   A live region that is *inserted* rather than updated is also unreliable in NVDA/JAWS. The count alone would
   carry the announcement.
3. **`hideExcluded` inverts an existing guarantee without noting it.** `ReviewPane.test.tsx:189-201`
   («adds default exclusions **without removing** excluded findings») exists because excluded findings are kept
   visible with a 除外 badge (`ReviewPane.tsx:354`). The new toggle lets a user hide them. That is allowed —
   ADR-049 결정 6 (`docs/ADR.md:1075`) is about 未検査, not 除外, and the `review-unchecked` list is outside the
   filter — but the plan does not acknowledge the tension, and §6.2 has no test that the toggle defaults off
   beyond the passthrough case.
4. **Keyboard order and the chips' group semantics.** Chips are `<button aria-pressed>` in a `role="group"`
   (plan L320-L349), which is fine, but nothing specifies tab order relative to the table, and a three-button
   toggle group with no roving tabindex puts three stops between the user and the 698-row table on every pass.
   Not a defect; unspecified.

---

## Round-1 findings I confirm are genuinely fixed — do not redo these

1. **B3 (fabricated `CLAUDE.md` quote) — fixed.**
   `grep -rn "Pure domain logic\|stays out of components" CLAUDE.md AGENTS.md docs/ phases/` now returns only
   round 1's own report (`step1-falsification.md:109,111`). The replacement at plan L6 is accurate: `docs/ADR.md:1074`
   is ADR-049 결정 5 and does contain 「검토 UI는 `Project`의 断面·配筋 값을 바꾸지 않는다」; `CLAUDE.md:24` is
   quoted verbatim. The `src/lib/review/` placement argument at plan L8 is true —
   `geometry-check.ts`, `segment-distance.ts`, `joint-layout.ts`, `xray.ts` all live there.
2. **B1's algorithmic half — fixed.** `memberKinds: ReadonlyMap<string,string>` threads through
   `barMemberRole`/`findingPairKey`/`extractAvailablePairs`/`matchesFindingFilter`/`filterFindings`
   (plan L104-L190); the `project.members.find` scan is gone; the work inside `measureCheck` is `O(findings)`.
   `uc25-perf.js` is now a named constraining artifact (§5.2, plan L601-L616) with `BUDGET_MS` at `:31-36` ✓,
   `measureCheck` at `:127-136` ✓, `budgetMet` at `:253-255` (plan says 251-255, see R2-m11), and §6.3 runs it
   on both projects. Only the baseline half is unresolved — R2-M2.
3. **M1 (reset predicate) — fixed.** `isFilterActive` (plan L59-L66) is structural. Deselecting `あき不足候補`
   on the initial check (0 occurrences per `step8-report.json#/original_failure/observed_table/kinds`;
   `tests/e2e/uc25-joint-review.js:772`) now returns `true`. The count-comparison proxy is gone.
4. **M2 (empty state) — fixed for the case it covers.** `<p role="status" data-testid="review-findings-empty">`
   is a sibling **after** the table (plan L424-L428), outside `[data-testid='review-findings']`. No placeholder
   `<tr>` enters `tbody`, so `parseFindingRow`'s 6-cell rule (`tests/e2e/uc25-joint-review.js:107`) is safe.
   See open-ground item 1 for the `result.findings.length === 0` gap.
5. **M5 (row actions under an active filter) — fixed.** §6.2 item 7 (plan L693-L698) asserts identity, not
   counts: `reviewFocus.point` against the first *接触* finding and `review.items[0].finding.id`. The premise
   holds — findings are sorted 干渉候補(0) → あき不足候補(1) → 接触(2) by `findingOrder`
   (`src/lib/review/geometry-check.ts:242-244`, applied at `:393-395`), so `expected.findings[0]` is indeed
   `干渉候補` and the first visible row under `kinds = {接触}` is a different object.
6. **m1 (off-by-one) — fixed.** `readFindingRows` is `tests/e2e/uc25-joint-review.js:257-263` and the plan now
   quotes it at those numbers.
7. **m3 (blanket `t()` claim) — fixed.** Plan L489 now reads "UI chrome strings go through `t(locale, …)`;
   domain terms are preserved in original Japanese", matching `ReviewPane.tsx:349` and `:280`. (The test
   citation attached to it is wrong — R2-m12 — but the claim itself is now true.)
8. **m4 (nested region) — fixed.** Plan L212-L213: the outer `<div data-testid="review-findings-filter">` is a
   plain div; only the chip group keeps `role="group"`. No second named region inside
   `<section aria-labelledby="review-check-title">` (`ReviewPane.tsx:218`).
9. **m5 (`barMemberRole` fallback) — fixed.** `memberKinds.get(ref.memberId) ?? ref.memberId` (plan L108)
   matches `formatBarRef`'s fallback at `src/components/review/ReviewPane.tsx:81`. Note the plan's comment
   "matching `ReviewPane.tsx:81`" is true of the *fallback* only — the found branch of `formatBarRef` yields a
   section mark, not `member.kind`. That divergence is R2-M3, not a fallback defect.
10. **m2 (uncited 698/106) — mostly fixed.** §5.4 (plan L626-L628) and §6.2 item 7 (plan L694) now carry the
    JSON pointer, and §6.2 items 1/7 say which run they mean ("initial check without clearance"). Residual
    problems are R2-m3 (hard-coding) and R2-m4 (the pointer is a failure archive).
11. **Round 1's nine unrefuted claims still hold against the revision.** I re-checked the ones the revision
    could have broken:
    - No test or e2e reads a container broader than `[data-testid='review-findings']` for the findings text
      (`uc25-joint-review.js:249`), and no prefix selector (`[data-testid^=…]`) in `tests/e2e/` matches
      `review-findings-filter` or `review-findings-empty`.
    - The three chip labels are rendered outside the table, and the only assertions on those strings are
      `ReviewPane.test.tsx:161,184`, both scoped to `screen.getByTestId('review-findings')`, and
      `uc25-joint-review.js:763,772,837`, all reading `text("[data-testid='review-findings']")`. No collision.
    - RTL `getByRole('button', { name })` is exact-match; `干渉候補`/`あき不足候補`/`接触`/`フィルターを解除`
      collide with none of the 21 button names queried in `ReviewPane.test.tsx`.
    - Adding two `role="status"` nodes does not break `AppShell.test.tsx:90` (singular `getByRole('status')`) —
      the filter bar only exists once a check has run, which that test does not do — nor
      `uc7-source-and-formula.js:53`, which takes the first `[role='status']` and `AppShell.tsx:121` precedes it.
    - `JointLayout` (`src/lib/review/joint-layout.ts:22`), `Locale`/`ViewerMode`/`AppState`
      (`src/lib/store.ts:23,26,30`) and `ReviewState` (`src/domain/review/types.ts:137`) are all exported, so the
      `ReviewFindingsViewProps` interface (plan L245-L256) is constructible; they are new imports in
      `ReviewPane.tsx`, which currently imports none of them (`:1-55`).
    - `member.kind` is `'柱'|'大梁'|'耐震壁'|'床板'` (`src/domain/model/member.ts:4,90,205,277,355,477`), so the
      Map's value type is assignable to `ReadonlyMap<string,string>`; all five roles named in `normalizeRoleGroup`
      exist in `RebarRole` (`src/domain/model/rebar.ts:4-12`).
    - i18n: `ja.json` and `ko.json` both hold 506 keys; no existing key begins `review.check.filter`; the only
      near-neighbour is `review.items.filterRecheck`. Parity is enforced solely by `src/lib/i18n.test.ts:19`.

## Not verified

- No build, test, or browser was run. R2-B1's browser behaviour is the HTML focus fixup rule, not a
  measurement; the jsdom half is from jsdom's known non-implementation of it, which I did not execute.
  R2-M2's perf reasoning is a code-path argument against the recorded 96 ms / 551 ms baseline, not a run.
- I did not re-derive the 698 / 106 / 592 split from `runGeometryCheck`; it is consistent across
  `step8-report.json#/original_failure/observed_table` and the comment at `ReviewPane.test.tsx:829`.
- I did not confirm whether `柱帯筋 × 柱帯筋` is among the sample project's pairs (R2-m7) — that is the point
  of the finding.
