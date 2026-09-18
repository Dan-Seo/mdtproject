# Step8 SPEC_DEFECT correction — bounded and unaccepted

This is the independently validated correction for the Step8 test/spec defect. It is not
Step8 acceptance, a product change, or permission to run the host browser gates.

## Preserved original failure

The archived original specification is auditable at
`.git/phase48-run/step8-before-spec-correction/phases/48-joint-review-ui/step8.md`; its
SHA256 is recorded in
`.git/phase48-run/step8-before-spec-correction/manifest.json`. The original full browser
failure, initial DOM probe, and clearance blocker remain unchanged at:

- `.git/phase48-run/browser-step8-1789662484080595265/receipt.json`
- `.git/phase48-run/browser-step8-1789662709634825985/receipt.json`
- `.git/phase48-run/step8-clearance-blocker.json`
- diagnosis session `95a93280-f4ca-424d-8ffc-24dd7aca8e4a`

The original Scenario 5 setup is reproduced verbatim here so the impossible premise is
not lost:

> 5. あき 값 입력(4의 표에서 읽은 **최소 양수 clearance＋1** — 고정값 금지)→blur → 재실행 → `あき不足候補` ≥1, 「利用者入力」 표기. `checkId1`·`findings1` 기록, `checkId1 !== checkId0`.

The preserved original run observed 698 findings with kinds `干渉候補` and `接触`, finite
clearances from `-25` through `0`, and zero positive rows. Therefore Scenario 5 could not
obtain its required input from Scenario 4. That run remains a failure; the corrected
script has not been treated as a rerun of it.

## Independent validation before amendment

The local proposal `.git/phase48-run/step8-corrective-plan-v2.md` was independently
validated before this amendment by Sol thread
`01a0b040-9817-7502-83e3-f161c9a205f7`; the read-only verdict is `VALIDATED` in
`.git/phase48-run/step8-sol-review.md`. That review validates only this same-scope test
oracle. It does not validate browser acceptance and performed no browser or product edit.

The source-backed facts used by the review are:

- `src/lib/review/geometry-check.ts:361-373` emits `あき不足候補` only for a positive
  geometric clearance below a non-null user clearance basis; the null-basis branch can
  emit clash/contact findings but cannot emit the required clearance finding.
- `src/domain/model/sample-project.ts:29-42` defines the sample C1 as a `柱` with
  `hoop: { size: 'D13', pitch: 100, ... }`. The file itself labels these as M1 sample
  user-input facts, not regulation values.
- `src/components/section/SectionTable.tsx:776-805` exposes the ordinary controls whose
  labels are `C1 帯筋 径` and `C1 帯筋 ピッチ`.
- `src/domain/rebar/column.ts:349-364` carries the user hoop size and pitch into the
  generated `帯筋`; `src/domain/rebar/stirrup-layout.ts:56-66` lays out the first and
  subsequent positions from the input pitch.
- `src/lib/viewer/geometry.ts:1006-1019` expands placements in `barIndex` order, while
  `src/lib/viewer/building.ts:413-425` assigns per-bar `segmentIndex`. The browser DOM
  formatter at `src/components/review/ReviewPane.tsx:79-83` exposes only mark, role, size,
  and bar index. Thus the oracle deliberately identifies the unordered C1 `帯筋` `D13`
  `#0`/`#1` row class and never claims a segment index.
- `src/components/review/ReviewPane.tsx:218-235` commits the ordinary clearance input
  on blur and includes the visible scope; `:345-350` renders kind, the two visible bar
  references, one-decimal gap, basis, and optional exclusion text. These are the only DOM
  fields used by the correction.

The independent geometric argument is elementary fixture evidence, not a product threshold:
corresponding straight segments on adjacent repeated hoops have centerline separation
`p`, nominal radii `d/2`, and nominal surface gap `g = p - d`. The review also established
that every segment pair in the two bar-index row class has gap at least `g`, while a
corresponding pair reaches `g`. Consequently `g - 1` forbids that clearance row class and
 `g + 1` requires at least one positive witness. No display radius, finding-derived value,
 calibration search, fallback, or saved-project input is used.
The ±1 mm bracketing margin is a test choice only; it is not a product or regulatory
threshold.

## Bounded amendment

Only these tracked paths are in scope:

- `tests/e2e/uc25-joint-review.js`
- `tests/e2e/README.md`
- `phases/48-joint-review-ui/step8.md`
- this file
- `phases/48-joint-review-ui/step8-report.json`
- `phases/48-joint-review-ui/index.json`

The corrected Scenario 5:

1. Reads exactly one ordinary `C1 帯筋 径` and `C1 帯筋 ピッチ` control without disturbing
   the existing X-Ray keyboard-focus/hover path or selected joint.
2. Requires the synthetic facts `D13` and `100`, parses the nominal designation, computes
   `g = p - d`, and fails on non-finite values or `g <= 1`.
3. Preserves the null run's existing `checkId0`, `findings0`, three verdicts, and 継手位置
   assertion, adding only the no-`あき不足候補` assertion.
4. Runs `low = g - 1` through the ordinary clearance input blur path. It requires a new
   check ID and zero `あき不足候補` rows for the exact unordered C1/#0/#1 row class; it
   makes no claim about other insufficiency rows.
5. Runs `high = g + 1` through the same ordinary input. It requires a check ID distinct
   from both earlier IDs and an unexcluded matching row with kind `あき不足候補`, display
   gap exactly `g.toFixed(1)`, positive gap below high, and basis containing `利用者入力`,
   the entered high value, and the visible scope.
6. Assigns the high result to the existing `checkId1`, `findings1`, and `verdicts1`
   references used by the unchanged viewer-pose invariance check. Scenario 6 and Scenario 8
   retain their original first-row actions; the witness is not retargeted.
7. Emits a separate `UC25 CLEARANCE_ORACLE` console record containing fixture inputs,
   derived thresholds, pair labels, gap, provenance, exclusion state, and all three IDs.

The script keeps exactly the original 19 top-level checks. Missing or duplicate controls,
fixture drift, malformed rows, changed-pair IDs, a forbidden low witness, or a missing/
excluded/wrong high witness throws and leaves the runtime acceptance closed. The pure
`evaluateClearanceOracle` predicate is a test oracle only; it does not touch `src`, a
production store, or browser state.

## Verification boundary

Static syntax and a bounded standalone Node harness exercise the exact predicate source.
Those checks are recorded in `step8-report.json` and are not browser output. The corrected
script has not been run with a browser, server, build, or daemon in this correction turn.
The report therefore keeps runtime checks null, preserves the original failed receipt
references, and labels the corrected runtime `not_run_host_browser`. Host sequential build,
browser, seven-regression, typecheck/lint, screenshot review, and independent review gates
remain pending.
