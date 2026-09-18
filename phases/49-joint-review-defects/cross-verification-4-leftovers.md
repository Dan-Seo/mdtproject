# Verdict: Four Leftover Findings

- Repository: `C:\Users\emper\mdtproject`
- Base commit: `29ffe1b` (`feat(49-joint-review-defects): close the phase 48 review findings`) + working tree changes
- Target file evaluated against: `brief-v3-leftovers.md`
- Verdict date: 2026-09-18

---

## 1. `WorkPackageBoard` is unguarded

### Code & Trace Analysis
- **Site**: [`src/components/review/WorkPackageBoard.tsx:124-131`](file:///C:/Users/emper/mdtproject/src/components/review/WorkPackageBoard.tsx#L124-L131)
  ```typescript
  function addCurrentTarget(): void {
    if (!draft || !selection.memberId) return
    const target: ElementRef = viewerMode === 'joint'
      ? { kind: 'joint', columnMemberId: selection.memberId }
      : { kind: 'member', memberId: selection.memberId }
    if (draft.targets.some((candidate) => sameTarget(candidate, target))) return
    setDraft({ ...draft, targets: [...draft.targets, target] })
  }
  ```
- **Guards**: None. There is no call to `resolveJoint(project, selection.memberId)` in `WorkPackageBoard.tsx`. Unlike `ReviewPane.tsx:991-994, 1113`, the button `review.work.addCurrentTarget` ([`WorkPackageBoard.tsx:292-294`](file:///C:/Users/emper/mdtproject/src/components/review/WorkPackageBoard.tsx#L292-L294)) is never disabled when a joint cannot be resolved.
- **Trace through domain**:
  1. If `viewerMode === 'joint'` and `selection.memberId` is a girder (e.g. `G1`), a circular column, or a column with no attached girders, `addCurrentTarget()` appends `{ kind: 'joint', columnMemberId: selection.memberId }` into `draft.targets`.
  2. The draft form displays the target chip as `接合部: <id>` ([`WorkPackageBoard.tsx:95, 298-301`](file:///C:/Users/emper/mdtproject/src/components/review/WorkPackageBoard.tsx#L95-L301)).
  3. On `savePackage()` ([`WorkPackageBoard.tsx:133-163`](file:///C:/Users/emper/mdtproject/src/components/review/WorkPackageBoard.tsx#L133-L163)), `addPackage` commits the package to `review.packages`.
  4. In `WorkPackageBoard.tsx:376`, `const readiness = packageReadiness(pkg, review.items, current)` evaluates package status.
  5. In [`src/domain/review/readiness.ts:81-86`](file:///C:/Users/emper/mdtproject/src/domain/review/readiness.ts#L81-L86):
     ```typescript
     const packageTargets = elementRefTargets(pkg.targets, current.project)
     memberIds.push(...packageTargets.memberIds)
     addMissing(missingTargets, [...packageTargets.missing, ...packageTargets.unresolved])
     if (missingTargets.length > 0) {
       addBlocker(blockers, { entryId: null, kind: '対象部材なし', detail: 'パッケージの対象部材がありません' })
     }
     ```
  6. In [`src/domain/review/validity.ts:51-59`](file:///C:/Users/emper/mdtproject/src/domain/review/validity.ts#L51-L59):
     ```typescript
     if (ref.kind === 'joint') {
       const resolution = resolveJoint(project, ref.columnMemberId)
       if (resolution.status === 'unsupported') {
         missing.push(ref)
       } else {
         memberIds.push(...jointRebarMemberIds(project, resolution.joint))
       }
       continue
     }
     ```
     Because `resolveJoint` returns `{ status: 'unsupported', reason: ... }`, the target is placed into `missing`, which flows into `missingTargets`.
  7. In [`src/domain/review/readiness.ts:129-133`](file:///C:/Users/emper/mdtproject/src/domain/review/readiness.ts#L129-L133):
     ```typescript
     const state: ReadinessState = blockers.length > 0
       ? '準備未完'
       : exceptions.length > 0
         ? '準備完了（例外あり）'
         : '準備完了'
     ```
     Because `blockers` contains `{ entryId: null, kind: '対象部材なし', detail: 'パッケージの対象部材がありません' }`, `blockers.length > 0` is permanently true.
  8. **User-visible state and escape analysis**:
     - The package card permanently displays state badge `準備未完` (`data-package-state="準備未完"`, [`WorkPackageBoard.tsx:388`](file:///C:/Users/emper/mdtproject/src/components/review/WorkPackageBoard.tsx#L388)).
     - The blocker list permanently displays `対象部材なし: パッケージの対象部材がありません` (`data-blocker="対象部材なし"`, [`WorkPackageBoard.tsx:401-404`](file:///C:/Users/emper/mdtproject/src/components/review/WorkPackageBoard.tsx#L401-L404)).
     - Because `entryId` is `null`, this blocker is package-level, not associated with any checklist item. Even if all checklist entries are confirmed (`確認済`) or set to exceptions (`保留`/`除外`), the blocker cannot be cleared.
     - Even if the package contains other valid targets, `missingTargets.length > 0` remains true, keeping the blocker active.
     - Crucially, **the UI provides no target removal, no package editing, and no package deletion**: `updatePackage` is never exposed in the UI, and no `deletePackage` exists anywhere in the codebase.
     - Once saved, the user can **never** get out of `準備未完`. The work package is permanently locked in an incomplete state.
- **Comparison to ReviewPane defect**:
  - In `ReviewPane`, an invalid joint target permanently gave the `ReviewItem` a validity state of `再検討必要` (`対象なし: 対象を解決できません: joint`), preventing it from being cleanly confirmed.
  - In `WorkPackageBoard`, an invalid joint target permanently gives the `WorkPackage` a readiness state of `準備未完` (`対象部材なし: パッケージの対象部材がありません`), preventing it from reaching `準備完了` or `準備完了（例外あり）`.
  - Both bugs stem from the identical root cause: constructing `{ kind: 'joint', columnMemberId }` from raw selection without consulting `resolveJoint`. Both result in a permanent un-clearing terminal error state with no UI recovery path.

**Verdict: REAL DEFECT**

---

## 2. The selection overrides the finding

### Code & Trace Analysis
- **Site**: [`src/components/review/ReviewPane.tsx:997`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L997)
  ```typescript
  const openDraft = (finding?: geometryCheck.Finding, checkId?: string) => {
    const columnMemberId = sel.memberId ?? finding?.a.memberId ?? null
    if (columnMemberId === null || resolveJoint(project, columnMemberId).status !== 'joint') return
    const targets: ElementRef[] = [{ kind: 'joint', columnMemberId }]
    if (finding !== undefined) {
      targets.push(
        { kind: 'rebar', rebarId: finding.a.rebarId },
        { kind: 'rebar', rebarId: finding.b.rebarId },
      )
    }
  ```
- **Reachability in the product**:
  1. **How the finding is created**: The user selects column B (e.g. `1C1`), so `sel.memberId = '1C1'`. In `ReviewCheckSection`, `jointResolution` resolves joint `1C1` ([`ReviewPane.tsx:105-109`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L105-L109)). The user clicks `検査を実行` (`runCheck`, [`ReviewPane.tsx:182-193`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L182-L193)). `result` is stored in local React state (`useState`, [`ReviewPane.tsx:126`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L126)) and the findings table is displayed ([`ReviewPane.tsx:331-356`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L331-L356)).
  2. **Changing selection**: The user clicks another member in the 3D Viewer or any member list/chip, selecting column A (e.g. `1C2`) or a girder (e.g. `1G1`). This updates the store: `sel.memberId = '1C2'`.
  3. **Does `result` clear?** No. There is no `useEffect` or state reset tied to `sel.memberId` in `ReviewCheckSection` (lines 96-180). Nor does `ReviewCheckSection` unmount. The findings table from column B's check remains fully rendered and interactive.
  4. **What happens on finding row click?**
     - Table rows have `onClick={() => focusFinding(finding)}` ([`ReviewPane.tsx:342`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L342)).
     - In `focusFinding` ([`ReviewPane.tsx:195-211`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L195-L211)), it calls `setReviewFocus` and `setViewerMode('joint')`.
     - **It never calls `selectMember`**. It does not alter `sel.memberId`.
  5. **What happens on `検討項目にする` button click?**
     - The button has `onClick={() => onCreateItem(finding, result.checkId)}` ([`ReviewPane.tsx:351`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L351)).
     - `onCreateItem` calls `requestItem(finding, checkId)` ([`ReviewPane.tsx:1257-1261`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L1257-L1261)), setting React state `request`.
     - `ReviewItemsSection` catches `request` in `useEffect` and calls `openDraft(request.finding, request.checkId)` ([`ReviewPane.tsx:1014-1018`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L1014-L1018)).
     - At line 997, `const columnMemberId = sel.memberId ?? finding?.a.memberId ?? null`.
     - Because `sel.memberId` is `'1C2'` (column A), `??` evaluates immediately to `'1C2'`. `finding?.a.memberId` is completely ignored.
- **What the user sees**:
  - **Case 1: Column A is a resolvable column (`1C2`)**:
    - The draft opens with a title from column B's finding (`干渉候補: 1C1 D25 × 1G1 D25`), but `targets` contains `[{ kind: 'joint', columnMemberId: '1C2' }, { kind: 'rebar', rebarId: '1C1|...' }, { kind: 'rebar', rebarId: '1G1|...' }]`.
    - Once saved, the review item card displays target chip `接合部: 1C2` alongside `鉄筋: 1C1|...` and `鉄筋: 1G1|...` ([`ReviewPane.tsx:1174-1186`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L1174-L1186)).
    - Clicking `再現` (`replay(item)`, [`ReviewPane.tsx:1094-1104`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L1094-L1104)) re-selects column A (`1C2`) and aims the camera at column A's joint, not column B where the finding occurred.
    - `itemValidity` monitors fingerprints for both column A and column B; a model edit to column A marks this column-B finding stale (`再検討必要`).
  - **Case 2: Selected member A is a girder (`1G1`) or unsupported column**:
    - `resolveJoint(project, columnMemberId)` returns `{ status: 'unsupported', reason: '柱ではない' }`.
    - `openDraft` returns early on line 998 (`if (... || resolveJoint(...).status !== 'joint') return`).
    - The user clicks `検討項目にする` on a finding from column B and **absolutely nothing happens**. The draft does not open, no error or warning is shown, and the click is completely swallowed.
  - **Case 3: `finding.a` is a girder framing into column B**:
    - Even if `sel.memberId` were `null` (e.g. deselect), fallback `finding?.a.memberId` would be the girder ID `1G1`. `resolveJoint(project, '1G1')` returns `unsupported`, so `openDraft` also silently drops the request.

**Verdict: REAL DEFECT**

---

## 3. A retracted cause is still asserted in three places

### Examination of the Three Reported Locations

1. **`phases/49-joint-review-defects/step4.md:37-39`**:
   - **Quote**:
     ```markdown
     - 카메라 오라클(`cameraFingerprint`)을 픽셀 비교로 되돌리지 마라. 접합부 장면은 겹친 철근 면의
       z-fighting 때문에 같은 프레임을 두 번 그리지 못한다 — 실측 근거는
       `phases/48-joint-review-ui/step8-report.json#/desktop_host_run/repairs/1/measured`에 있다.
     ```
   - **Characterisation**: **States the cause as established fact.** In this specification prompt for step 4, the author explicitly commands the developer not to revert the camera oracle because "the joint scene cannot render the same frame twice because of z-fighting of overlapping rebar surfaces". It asserts the retracted causal explanation as factual justification for a design constraint.

2. **`phases/48-joint-review-ui/step8-report.json`**:
   - There are two relevant lines in this report:
     - **Line 628** (under `desktop_host_run/repairs/1/measured/cause`):
       - **Quote**:
         ```json
         "cause": "NOT ESTABLISHED. The report previously asserted z-fighting between coincident rebar surfaces as the cause. An independent cross-verification (Antigravity CLI, verdict at phases/48-joint-review-ui/step8-cross-verification-antigravity.md) refuted that as an after-the-fact story: no camera position was ever logged, so a slowly moving camera was never excluded by observation, only by argument. What IS measured is the operational fact below - under every tested condition no two consecutive frames were byte-identical, so a pixel-equality oracle could not settle. The cause remains open."
         ```
       - **Characterisation**: **Merely records history.** It explicitly retracts the z-fighting claim, states that the cause is "NOT ESTABLISHED", cites the Antigravity cross-verification refutation, and leaves the cause open.
     - **Line 660** (under `product_findings_for_followup/rebar_overlap/second_order_effect`):
       - **Quote**:
         ```json
         "second_order_effect": "Coincident surfaces z-fight, so no frame of the joint is byte-reproducible. Any future test that compares rendered frames of a joint will hit this."
         ```
       - **Characterisation**: **States the cause as established fact.** While line 628 was corrected to retract the cause, line 660 in the secondary section was missed and continues to state as fact that "Coincident surfaces z-fight, so no frame of the joint is byte-reproducible."

3. **`phases/48-joint-review-ui/index.json:83`**:
   - **Quote**:
     ```json
     "summary": "uc25 19/19 checks true on two consecutive runs and the seven regressions pass on a production build (BUILD_ID IV5UMpDB0S9L8kK-uCe2y); vitest 2032/2032, tsc and lint exit 0. Three test-side repairs, no product change: a declared 1440x900 viewport fixture, a raycast-based camera oracle replacing the pixel comparison (the joint scene never renders two byte-identical frames because coincident rebar surfaces z-fight - measured 11 distinct hashes in 11 captures, pointer held, cut plane at maximum), and base64 Buffer input matching the other e2e scripts. Details in step8-report.json under desktop_host_run."
     ```
   - **Characterisation**: **States the cause as established fact.** In the step 8 summary, it asserts as fact: `"(the joint scene never renders two byte-identical frames because coincident rebar surfaces z-fight ...)"`.

### Repository-wide Search (`z-fight` and `coincident`)
- `phases/48-joint-review-ui/step8-correction.md:144-145`:
  `"... src/lib/review/geometry-check.ts lists 「大梁の交差部で上下関係を持たない（同じ高さに描く）」, so coincident surfaces z-fight and the depth-test winner is undefined per frame."`
  -> **States cause as fact** (original author's repair document prior to cross-verification).
- `phases/48-joint-review-ui/step8-cross-verification-antigravity.md:42`:
  -> **Records history** (quotes the claim in order to refute it).
- `phases/49-joint-review-defects/step4-report.json:17`:
  `"... both stated the z-fighting cause that the phase 48 cross-verification retracted. The measurement they cite stands; the cause is recorded as not established ..."`
  -> **Records history** (describes the cleanup of test comments).
- `tests/e2e/uc25-joint-review.js:356-360, 411-412`:
  `"Why the frames differ is not established. An earlier revision of this comment blamed z-fighting between coincident rebar surfaces. An independent cross-verification refuted that as fitted after the fact ..."`
  -> **Records history** (cleanly updated in commit `29ffe1b`).
- `src/components/viewer/Viewer3D.tsx:681`:
  `"// 그리드보다 살짝 아래 — z-fight 방지"`
  -> **Unrelated**: pertains to the shadow plane geometry position beneath the ground grid.
- `src/lib/import/framing-plan/parse.test.ts:30` and `phases/42-plan-grid-soundness/step1-report.json:2933, 2989`:
  -> **Unrelated**: refers to "coincident adjacent axes" in framing plan grid tests.

### Judgment
The factual claim that statements asserting the retracted cause remain in those three files is true (specifically in `step4.md:38`, `index.json:83`, and `step8-report.json:660`). However, calling this an active software defect is **OVERSTATED**:
1. In `phases/48-joint-review-ui/step8-report.json`, line 628 is the authoritative `cause` field and explicitly retracted the claim, citing the cross-verification. Line 660 is an un-updated secondary field in an informational followup section.
2. In executable code and tests (`tests/e2e/uc25-joint-review.js:356-360, 412`), the comments have already been sanitized to record the cause as open and refuted.
3. `step4.md` and `index.json` are frozen phase-bookkeeping and prompt artifacts. They have zero execution impact, zero test impact, and zero end-user impact.

**Verdict: OVERSTATED (The causal claim was indeed left unedited in `step4.md:38`, `index.json:83`, and `step8-report.json:660`, but the primary report at `step8-report.json:628` already authoritatively retracted it, and all executable test comments in `tests/e2e/uc25-joint-review.js` were already corrected; this is documentation residue in closed phase files with zero runtime or user impact)**

---

## 4. Does the ReviewPane fix leave any other way in?

### Code Search across `src/`
Searching for all constructions of `{ kind: 'joint', ... }` (and all `ElementRef` construction sites) across all files in `src/`:
1. [`src/components/review/ReviewPane.tsx:997-999`](file:///C:/Users/emper/mdtproject/src/components/review/ReviewPane.tsx#L997-L999):
   ```typescript
   const columnMemberId = sel.memberId ?? finding?.a.memberId ?? null
   if (columnMemberId === null || resolveJoint(project, columnMemberId).status !== 'joint') return
   const targets: ElementRef[] = [{ kind: 'joint', columnMemberId }]
   ```
   - **Guarded**: Line 998 explicitly evaluates `resolveJoint(project, columnMemberId).status !== 'joint'` and aborts if unresolvable. Additionally, line 1113 disables the manual draft button when `jointUnavailableReason !== null`.
   - While line 997 suffers from the selection override defect (Finding 2) and line 998 will silently abort if `columnMemberId` is unresolvable, **it is impossible for an unsupported joint ElementRef to be constructed at this site**.
2. [`src/components/review/WorkPackageBoard.tsx:126-128`](file:///C:/Users/emper/mdtproject/src/components/review/WorkPackageBoard.tsx#L126-L128):
   ```typescript
   const target: ElementRef = viewerMode === 'joint'
     ? { kind: 'joint', columnMemberId: selection.memberId }
     : { kind: 'member', memberId: selection.memberId }
   ```
   - **Unguarded**: Fully analyzed in Finding 1.
3. **Any other sites in `src/`?**
   - **None.** Every other occurrence of `'joint'` or `ElementRef` in `src/`:
     - Validates incoming data structure: `src/domain/review/state.ts:114` (`validateElementRef`).
     - Declares types: `src/domain/review/types.ts:7` (`ElementRef = | { kind: 'joint'; columnMemberId: string }`).
     - Reads/inspects targets: `src/domain/review/validity.ts:51`, `src/domain/review/readiness.ts:81`, `src/components/review/ReviewPane.tsx:699, 707`, `src/components/review/WorkPackageBoard.tsx:81, 95, 105`.
     - Test fixtures: `src/components/review/ReviewPane.test.tsx:762`, `src/domain/review/validity.test.ts:46, 67, 93`.

### Judgment
If the reviewer's finding was that the `ReviewPane` fix left other unguarded backdoor paths within `ReviewPane` or across the product (beyond `WorkPackageBoard`), that finding is **WRONG**:
- Within `ReviewPane.tsx`, line 998 strictly guards line 999 against constructing any unresolvable joint ElementRef.
- Outside `ReviewPane.tsx`, `WorkPackageBoard.tsx:127` is the single other construction site in the entire codebase (Finding 1).
- No third site exists anywhere in `src/`.

**Verdict: WRONG (Within `ReviewPane.tsx`, line 998 strictly prevents unresolvable joint element references from being constructed; across all of `src/`, `WorkPackageBoard.tsx:127` is the only other site and no additional construction sites exist)**

---

## Summary & Ranking of Real Defects

Two of the four findings are real defects, one is an overstated documentation cleanup issue, and one is wrong.

### Ranking by Likelihood of User Impact:
1. **Rank 1 (Highest likelihood)**: **Finding 2 (`ReviewPane.tsx` selection overrides finding)**
   - *Why*: Direct core workflow impact during interactive review. When a user runs a geometry check on a joint, sees findings in the table, and clicks around in 3D to inspect surrounding members or other columns, the selection `sel.memberId` changes without clearing the findings table. Clicking `検討項目にする` then either silently drops the click (if a beam/unsupported member was clicked) or creates an item cross-wired to the wrong joint (targeting column A's joint while citing column B's rebars). Users performing spatial inspection alongside check triage will naturally hit this.
2. **Rank 2 (Lower likelihood)**: **Finding 1 (`WorkPackageBoard.tsx` unguarded joint target)**
   - *Why*: Work package creation is a secondary administrative workflow. It requires the user to be in `viewerMode === 'joint'`, select an unsupported member (such as a girder), open `WorkPackageBoard`, and click `+ 選択中の部材を追加`. However, when hit, its consequence is severe: it creates an un-editable, un-deletable work package permanently stuck in `準備未完` with `対象部材なし`.
