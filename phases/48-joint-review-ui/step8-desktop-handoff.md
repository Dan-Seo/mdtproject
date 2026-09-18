# Step8 desktop handoff — WIP / HOLD

This commit transfers unfinished work, not Step8 or Phase48 acceptance.
Branch: `feat-48-joint-review-ui`. Repository: `Dan-Seo/mdtproject`.

## Start here
- Read `step8.md`, `step8-correction.md`, `step8-report.json`, and `tests/e2e/README.md`.
- Steps 1–7 are in preceding commits. Step8 remains `error`; Steps9–11 remain pending.
- The checked-in report contains historical Jetson observations, not verification on the desktop or this handoff commit.

## Validated correction
The original null-threshold findings table contained no positive gaps, making the original threshold setup impossible. A separately reviewed test-side correction derives the adjacent-hoop witness from ordinary fixture inputs: pitch minus nominal diameter. It preserves positive-clearance insufficiency caused by user input, without changing product/core code or fitting expected values to results.
Sol validation: `01a0b040-9817-7502-83e3-f161c9a205f7`.
Luna implementation: `01a0b049-18e2-7113-b160-8fe18db7522a`.
Opus review: `b792a4e1-49d3-40f6-8479-dc95cbb2bf5c`, correction PASS / full Step8 HOLD.
The report records the actual browser witness (87mm gap, low86/high88).

## Remaining blocker and next work
The full UC25 run stops at Scenario7 camera-change evidence. Do not weaken that assertion or the check-ID/findings/verdict invariance requirements. Constant WebGL canvas readback did not establish a product defect; nonblank compositor screenshots changed even in a no-drag control. Screenshot inequality alone is therefore not a valid replacement.
Independently validate a bounded capture/interaction oracle (joint-canvas identity, fixed geometry ROI, nonblank frames, no-drag stability, trusted pointer input, auto-rotation/damping). Keep any test/spec repair separately justified and independently reviewed before amendment. No product core changes in Step8.
Also address the Opus low-arm-liveness recommendation in the report, without altering the original semantic purpose.
Then run the complete 19 checks and seven specified browser regressions against a production build, followed by required host tests/review. Keep Steps9–11 blocked on their actual prerequisites; do not declare phase success.

## Evidence portability
`step8-report.json` embeds key historical observations and the independent review. Its `.git/phase48-run/...` links point to Jetson-local raw artifacts: Git push does NOT transfer these. Original failures remain preserved on Jetson; the original Step8 spec is also accessible via the parent commit. Do not claim the raw artifacts exist on the desktop. Retrieve separately from Jetson if further inspection is required.
Local Claude settings and raw execution transcripts are deliberately excluded from this transfer.

## Delivery boundary
User requested commit/push for desktop continuation, not PR creation, merge, or deployment. No active worker is being handed over. Avoid concurrent Jetson/desktop editing. Repository automation can auto-merge a ready PR; use draft only if later authorized and inspect automation again.
