# Step 0 (verify · gate): Claude의 step 5 판정과 골든 추기를 반증하라

## 배경

phase 36 step 5(codex 검증)는 세 가지 반증으로 `refuted`를 냈다. Claude가 그것을
원문과 재대조해 `phases/36-corpus-widen-2/step5-adjudication.json`에 「반증 불성립」
판정을 썼고, 같은 근거로 `tests/fixtures/section-import/expected/ojkk-akamichi-p4-walls-slabs.json`의
小梁リスト·片持梁リスト에 `entries` 12건을 추기했다. **둘 다 Claude가 쓴 것**이라
codex가 반증해야 한다. 고치지 마라 — 어긋나면 `refuted`로 두고 무엇이 어긋났는지
적어라. 이 스텝은 `gate`라 `refuted`면 뒤 스텝이 돌지 않는다.

## 반증 항목

1. **회전 글리프 치수(판정 1·2)** — `tests/fixtures/section-import/textitems/fuji-p15.json`·
   `fuji-p17.json`의 items 중 `rot === -90`인 것을 **같은 x(±1pt)끼리 묶어 y 내림차순으로
   이어 붙인 문자열**을 만들어라(`verticalRuns`·`recoverRows`를 쓰지 말고 직접 —
   step 5가 그 함수로 놓친 것을 재검한다). p15에서 「2,500」「4,150」「3,000」「12,150」,
   p17에서 「2,500」이 그 문자열에 **없으면** 반증 성립. 있으면 판정서의 좌표
   (p15 x=133.2 열·x=119.0 열)와 일치하는지 좌표를 적어라.
2. **ojkk-p4 전사(골든 추기)** — `textitems/ojkk-p4.json`의 items를 y(±2pt)로 행 묶고
   x로 정렬해 `符号`·`断面寸法`·`上端筋`·`下端筋`·`あばら筋`·`腹筋` 행(小梁 y≈58·182·
   188·196·204·210, 片持梁 y≈256·438·444·452·458·466)을 복원하라. 골든 `entries`
   12건의 **모든 필드**(b·depth·上端筋·下端筋·あばら筋·腹筋, B2·CB1의 位置별 값,
   CB1의 断面寸法 둘)를 복원 행과 대조해 한 값이라도 다르면 반증 성립 — 파일·mark·
   필드·원문값을 적어라. 「-D10-@150」은 「D10@150」으로 읽는다(양끝 하이픈은 장식).
3. **회귀 변화의 범위(판정 4)** — `git worktree add --detach <임시경로> main`으로 main
   사본을 만들고, 기존 14면(kani-p38·39·40·41, ojkk-p2·3·4, yokohama-p6·7·8·9·13·14·15)의
   `parseSectionLists` 후보를 main과 HEAD에서 각각 덤프해 **셀 단위**로 diff하라
   (`raw.符号`는 HEAD가 새로 채우는 필드이니 제외). ojkk-p4 小梁 9칸·片持梁 3칸
   외에 바뀐 셀이 하나라도 있으면 반증 성립. 끝나면 worktree를 `git worktree remove`로
   지워라.
4. **스윕 3면의 성격(판정 5)** — fuji-p20·saiki-p2·shibata-p13의 items 문자열에
   「伏図」가 없고 「リスト」 또는 「軸組図」가 있는지 확인하라. 하나라도 伏図면 반증
   성립. (T=6 스윕 재실행은 step 5로 미룬다 — 이 시점의 격자 골든은 step 2가 고칠
   축 순서 때문에 의도적으로 실패 상태다. `tests/plan-import/corpus2*.test.ts`의 실패는
   이 스텝의 반증 근거가 아니다.)

## 하지 말 것

- 코드·골든·픽스처·판정서를 고치지 마라. 임시 변경은 원복하고 `git status`가 깨끗함을
  report에 적어라.
- `error`로 끝내지 마라 — 반증 성립은 `refuted`, 불성립은 `completed`.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## 산출물

`phases/37-corpus-widen-2-close/step0-report.json`:

```json
{
  "verdict": "completed|refuted",
  "items": {
    "1_rotated_glyphs": { "holds": false, "found": {}, "evidence": [] },
    "2_ojkk_p4_transcription": { "holds": false, "cells_checked": 0, "evidence": [] },
    "3_regression_scope": { "holds": false, "changed_cells": [], "evidence": [] },
    "4_sweep_pages": { "holds": false, "page_kinds": {} }
  },
  "git_status_clean": true,
  "summary": "index.json summary와 같은 요지"
}
```
