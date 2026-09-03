# Step 5 (verify · gate): step 2〜4의 수정을 반증하라

## 배경

step 2〜4는 codex 구현이고 골든은 Claude 전사다. 고치지 않는다. 반증 성립이면 `refuted`
(`gate`라 뒤 문서 스텝이 돌지 않는다), 불성립이면 `completed`.

## 반증 항목

1. **골든 반증 가능성** — 격자 7·階高 3·リスト 5(＋ojkk-p4 対象外)의 골든 각각에서 값
   하나를 사본에서 바꿔 해당 테스트가 실패하는지 1회씩. 실패하지 않는 골든이 있으면 성립.
   원복 후 `git status` 확인.
2. **라벨↔좌표** — 격자 7면＋기존 14면의 모든 grid에서 `axes[i].positionPt`가 단조 증가
   하고 라벨 순서가 페이지 순서(X 왼→오, Y 위→아래)인지 원시 TextItem의 라벨 좌표로
   확인. 하나라도 어긋나면 성립.
3. **회귀** — 기존 14면의 `parseSectionLists` 셀 단위 결과가 main worktree와 같은가(ojkk-p4
   小梁 9·片持梁 3칸의 알려진 개선은 제외). 격자·階高의 기존 결과(`EXISTING_14`·기존 4면)도.
   한 칸이라도 다르면 성립.
4. **문턱 스윕** — `MIDPOINT_TOLERANCE_PT` 4·6·15·30·40에서 36면 격자 결과를 재라. T=4에서
   kani-p38·p39·yokohama-p6·p7의 `寸法欠落`이 재현되어야 한다(안 되면 값이 안 닿은 것 —
   다시 재라). T별 gridPages와 달라지는 면을 report에. 상수 원복.
5. **도면 특화** — `git diff main...HEAD -- src/lib/import`에 파일명·발주처·시트 분기,
   labels·spans를 `.reverse()`하는 분기, `process.env` 참조, 골든 한 면만 지나가는 상수가
   있으면 성립(줄 번호).
6. **레벨 라벨 순도** — 階高 3면＋기존 4면의 모든 `levels[].labels`에 `/^[A-Z]{1,3}\d/`
   (부재 부호)나 `▽|▲|△`가 있으면 성립.
7. **표제란** — 36면 `/TEL|FAX|℡|電話|一級建築士|設計事務所|株式会社|共同体/` 0건 재확인.
8. **2段筋·特記** — saiki 2段 셀 본수 0, ina 빈 STP 기본값 0 재확인.

## 하지 말 것

- 코드·골든·픽스처를 고치지 마라. 임시 변경은 원복하고 `git status`를 report에.
- `error`로 끝내지 마라 — 성립은 `refuted`, 불성립은 `completed`.
- `scripts/execute.py`를 실행하지 마라 — 재귀다. 하네스 프로세스를 죽이지 마라.

## 산출물

`phases/37-corpus-widen-2-close/step5-report.json`:

```json
{
  "verdict": "completed|refuted",
  "items": {
    "1_falsifiability": { "holds": false, "goldens_checked": 0, "mutated_tests_failed": 0 },
    "2_label_position": { "holds": false, "evidence": [] },
    "3_regression": { "holds": false, "evidence": [] },
    "4_sweep": { "holds": false, "midpoint_sweep": { "4": "", "6": "", "15": "", "30": "", "40": "" } },
    "5_specialization": { "holds": false, "evidence": [] },
    "6_level_labels": { "holds": false, "evidence": [] },
    "7_title_block": { "holds": false, "matches": 0 },
    "8_two_layer_and_defaults": { "holds": false, "evidence": [] }
  },
  "git_status_clean": true,
  "summary": "index.json summary와 같은 요지"
}
```
