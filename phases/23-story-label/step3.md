# Step 3: 階 필터의 壁·床板 폴백 ＋ 대장 갱신

**전제**: step 2가 `completed`. 진행 중 새로운 반증 사유가 나오면 `blocked`.

## 배경

ADR-035 §5. `src/lib/import/framing-plan/apply.ts`의 断面 필터는
`sectionStoryLabel`을 고르면 `storyLabel` 없는 断面을 전부 떨어뜨린다 —
壁リスト·スラブリスト 파서가 階를 읽지 않으므로 壁·床板 符号이 통째로
`断面未登録`이 되는 함정이다 (step 0에서 실행 반례 확인).

## 할 일 (테스트 먼저)

1. **재현 테스트 먼저** — `src/lib/import/framing-plan/apply.test.ts`에
   「断面の階를 골라도 `storyLabel` 없는 壁 断面이 반영된다」 테스트를
   추가하고, 수정 전에 실패하는 것을 확인한 뒤 고쳐라(report에 명시).
2. **폴백** — 符号의 후보 중 라벨 일치(원문 `===`) 断面이 있으면 그쪽만
   (기존 동작), **하나도 없으면 `storyLabel === undefined`인 断面으로
   폴백**한다. storyKey 정규화를 이 필터에 넣지 마라 — 선택지가 원문
   distinct 목록이다 (ADR-035 §6).
3. **테스트로 고정** — 최소:
   - 라벨 일치 断面이 있으면 무라벨 断面은 무시된다(기존 동작 유지).
   - 라벨 일치 0·무라벨 1 → 폴백 적용.
   - 라벨 일치 0·무라벨 복수 → `断面複数該当`.
   - 라벨 일치·불일치만 있고 무라벨 없음 → 기존과 동일(`断面未登録` 없음,
     일치 쪽 적용).
4. **대장 갱신** —
   - `CLAUDE.md`·`AGENTS.md` 도면 인식 행의 잔여에서 「階 라벨↔`Story`
     대응」 제거.
   - `docs/MILESTONES.md` 도면 인식 절: 끝난 것에 階 라벨↔Story 대응
     (ADR-035, phase 23)을 추가하고 남은 것에서 제거.
   - `src/domain/model/member.ts`의 `storyLabel` 주석에서 「제품의 Story와는
     아직 연결되지 않는다」를 현행(伏図 취입 화면이 정확 일치 자동 선택으로
     잇는다, ADR-035)으로 갱신 — **주석만이다. 코드 수정 금지.**

## 하지 말 것

- 壁リスト·スラブリスト 파서에 階 인식 추가 금지 — 실물 근거가 없다 (R10).
- `src/components/**` 수정 금지. 기존 골든·기존 테스트 기대값 수정 금지 —
  바꿔야 통과한다면 `blocked`.
- 배근 규준 수치 금지. `scripts/execute.py` 금지 — 재귀다.

## AC

- `npm run test`·`npx tsc --noEmit`·`npm run lint` 전체 통과.

## 산출물

`phases/23-story-label/step3-report.json`:
재현 테스트가 수정 전 실패했음을 명시, 폴백 규칙·대장 갱신 목록, 게이트 결과.
