# Phase 49 — 交差検証 (cross-verification)

「만든 쪽이 자기 것을 승인하지 않는다」(CLAUDE.md 개발 프로세스). 이 phase는 Claude가 직접
구현했으므로(사용자 지시), 승인은 다른 에이전트가 한다. 사용자 지시에 따라 **Antigravity CLI**를
bypermissions 프로파일로 Herdr pane 넷에 띄워 각각 다른 범위를 **반증만** 하게 했다 — 고치라고
하지 않았다. 고치게 하면 검증자가 구현자가 되어 교차가 무너진다.

| # | 범위 | 판정 | 결과 파일 |
|---|---|---|---|
| 1 | phase 49 전체 diff (주장 A–E) | A–E SURVIVES, 범위 밖 지적 4건 | `cross-verification-1-whole-phase.md` |
| 2 | 새로 넣은 C7 카메라 가드 | SURVIVES(가드 자체는 건전), **C7 반증 자체를 반증** | `cross-verification-2-c7-guard.md` |
| 3 | 새 진단(diagnostics) 체크 | 주장 4개 중 **3개 REFUTED** | `cross-verification-3-diagnostics.md` |
| 4 | 남은 지적 4건 | 2건 REAL DEFECT, 1건 OVERSTATED, 1건 WRONG | `cross-verification-4-leftovers.md` |

## 뒤집힌 것 — C7

step 0은 C7을 `refuted`로 적고 가드를 만들지 않았다. 근거는 「OrbitControls는 target을 중심으로
회전하므로 왼쪽 드래그로는 접합부가 화면 밖으로 나갈 수 없다」였고, **이 전제가 틀렸다.**
검증자 2가 `OrbitControls.js:1677-1687`을 줄 단위로 인용했다 — 왼쪽 드래그라도 Shift·Ctrl·Meta가
눌려 있으면 **회전이 아니라 pan**이고, `enablePan`은 기본값 `true`이며 `Viewer3D.tsx:1969-1970`은
`enableDamping`만 설정한다. 원래의 반증 실험은 수식어 키를 누르지 않아 회전 경로만 밟았으므로,
찾던 상태에 도달할 수가 없었다. 측정은 진짜였고 일반화가 틀렸다.

확인은 실험으로 했다. `mut6-uc25.js`(Shift pan 6회)는 다섯 점 전부를 비우고 가드를 걸리게 한다.
그 전에 시도한 M5(Shift pan 1회, 캔버스 폭의 2.2배)는 **통과했다** — 반증 실패다. 계측해 보니
pan 한 번은 시야를 大梁(대들보) 쪽으로 옮겼을 뿐이어서 4/5가 여전히 철근을 물고 있었다.
한 번의 반증 실패는 가드가 죽었다는 증거가 아니다.

## 고친 것

1. **C7 가드** (`tests/e2e/uc25-joint-review.js`) — 드래그 **양쪽** 지문이 최소 한 점은
   철근을 물어야 하고, 달라진 점이 철근을 무는 점이어야 한다. 처음에 하한을 3점으로 잡았다가
   되돌렸다 — 커버리지는 走行(주행)이 아니라 **호출 위치**가 정한다. `perturbViewer`는 두 곳에서
   불리고 앞쪽은 정상 주행에서도 1/5, 뒤쪽은 4/5이며(두 번 주행 모두 같은 값), 3으로 두니
   20/20 통과하던 주행이 막혔다. 실측값은 매 주행 `UC25 CAMERA_ORACLE` 줄로 찍힌다.
2. **`WorkPackageBoard`** — 검증자 1·4가 함께 지적. `ReviewPane`만 고치고 이쪽은 같은 결함이
   그대로였다. `resolveJoint`가 `unsupported`면 「現在の選択を追加」(현재 선택을 추가) 버튼을
   막고 도메인이 준 이유를 그대로 보여준다.
3. **`openDraft`의 대상 혼선** — 검증자 4가 Rank 1로 올린 것. 지적 F(기둥 B)를 검토항목으로
   만들 때 화면에서 기둥 A가 선택돼 있으면 항목이 A를 가리켰다. 이제 지적이 자기 기둥을 넘긴다.
4. **진단 체크의 구멍 셋** — 감시하지 않던 첫 세션, `clearStore()` 앞에서 비우던 순서,
   읽어도 비우지 않아 같은 에러를 두 번 세던 누산기.

## 고치지 않고 기록만 한 것

- **검증자 3의 Claim 3(REFUTED)**: 이 진단 체크가 잡을 수 있는 실제 제품 회귀는 거의 없다.
  `src/`의 클라이언트 코드에 `console.error`가 사실상 없고(유일한 한 곳은 서버측 oncall 라우트),
  치명적 예외는 이 체크에 닿기 전에 앞 시나리오에서 이미 실패시킨다. 남는 것은 서드파티 잡음과
  조용한 async rejection이다. 체크는 두되 **값이 낮다는 사실을 함께 남긴다** —
  `step4-report.json#/known_limits_of_the_new_diagnostics_check`.
- **끝단 오라클 한계**: 앞 시나리오가 던지면 이 체크의 대입문에 도달하지 못해 진단이 보고되지 않는다.
- **행 단위 해상도**: `tooltipFromHit`는 개별 철근이 아니라 내역 행(`row:${line.id}`)을 키로 잡으므로,
  같은 部材·役割·径(부재·역할·지름)의 다른 철근으로 바뀐 것은 오라클에 보이지 않는다. 다섯 점이
  모두 그렇게 움직이면 「카메라가 안 움직였다」는 거짓 차단이 날 수 있다.
- **얼어붙은 렌더러**: 뷰어가 멈춘 채 툴팁만 남으면 두 지문이 같아져 앞쪽 가드에 걸린다 — 차단은
  되지만 원인은 이 오라클이 알려주지 못한다.
- **검증자 4의 지적 3(OVERSTATED)**: 철회된 z-fighting 원인이 닫힌 phase 문서 세 곳에 사실처럼
  남아 있던 것. 런타임 영향은 없지만 읽는 사람이 사실로 받는다 — 세 곳 모두 이번에 고쳤다
  (`phases/48-joint-review-ui/index.json`, 같은 곳 `step8-report.json`의 `second_order_effect`,
  `phases/49-joint-review-defects/step4.md`).

## 검증자 4가 반증한 것

「`ReviewPane` 수정이 다른 진입로를 남겼는가」는 **WRONG**. `src/` 전체에서 `kind: 'joint'`를
만드는 곳은 `ReviewPane.tsx:998`과 `WorkPackageBoard.tsx:127` 둘뿐이고, 전자는 막혀 있었으며
후자는 이번에 막았다. 세 번째 경로는 없다.

## 실행 조건

Antigravity CLI(`agy`), bypermissions 프로파일, Herdr pane `wE:p2`·`wE:p3`·`wE:p4`에서 병렬.
네 에이전트 모두 **읽기 전용**으로 지시했고 레포에 쓴 것은 없다. 각 지시문은 세션 스크래치패드의
`brief-v1-c7guard.md`·`brief-v2-diagnostics.md`·`brief-v3-leftovers.md`이며 레포에는 넣지 않았다.
