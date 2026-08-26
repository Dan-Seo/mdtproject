# Step 0 (verify): ADR-035의 전제를 반증하라

**역할**: 이 스텝은 검증 전용이다. `docs/ADR.md`의 **ADR-035**를 읽고, 그것이
딛고 선 아래 전제들을 코드로 **반증**하라. 고치지 마라 — 대상 코드를 한 줄도
수정하지 않는다. 반증이 성립하면 status를 **`refuted`**로 두고 무엇이
어긋났는지 적어라(반증 성립은 정상 종결이다). 전제가 전부 버티면 `completed`.

## 반증 대상 전제

1. **(silent-default)** `src/components/plan/PlanImport.tsx`의 대상 Story
   드롭다운은 기본값이 `stories[0]?.id`로 조용히 들어가며, 따라서 stories가
   비어 있지 않는 한 `階未指定` 거부(`src/lib/import/framing-plan/apply.ts`)는
   현행 UI에서 도달 불가다.
2. **(wall-slab-trap)** 壁リスト·スラブリスト 파서(`src/lib/import/section-list/parse.ts`의
   `parseWallBlock`·`parseSlabBlock`)는 階 행을 읽지 않으므로 壁·床板
   `Section.storyLabel`은 항상 undefined다. 따라서 伏図 취입에서 断面の階
   (`sectionStoryLabel`)를 고르면 壁·床板 符号은 전부 `断面未登録`으로
   탈락한다 — **실행 반례로 확인하라** (applyFramingPlan을 직접 호출하는
   스크립트나 테스트로).
3. **(title-raw)** `PlanBlock.title`은 도면 원문 그대로이고, framing-plan
   파서는 제목에서 階를 추출하지 않는다.
4. **(pattern-coverage)** `STORY_PATTERN`(`section-list/parse.ts`)은
   `RF`·`R階`·`〈n〉F`·`〈n〉階`만 인식한다 — `B1F`·`地下〈n〉階`·`PH`·`塔屋`는
   미인식이다.
5. **(story-shape)** `Story`(`src/domain/model/project.ts`)에는 레벨 필드가
   없고 `stories` 배열 순서(아래→위)가 곧 층 레벨이며, Story를 사람이
   생성·개명하는 UI는 없다.
6. **(raw-equality)** 断面 매칭 키 (符号, 種別, 階)와 断面の階 필터의 비교는
   전부 원문 `===`이고, `RF`와 `R階`가 서로 다른 문자열로 취급되는 현행이
   기존 테스트로 고정되어 있다 — 그 테스트의 파일·행을 특정하라.

## 하지 말 것

- 대상 코드 수정 금지. 새 파일은 검증 스크립트·본 report만.
- `scripts/execute.py` 금지 — 재귀다.

## 산출물

`phases/23-story-label/step0-report.json`:
전제별 `{id, status: upheld|refuted, evidence[]}`와 종합 `verdict`, `summary`.
