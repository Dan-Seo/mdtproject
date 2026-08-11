# PROGRAM — Lighthouse 성능 최적화 루프

karpathy/autoresearch의 `program.md` 대응. **사람이 편집하는 지침 파일**이다.
최적화 에이전트는 매 라운드 이 파일을 먼저 읽고, 여기 적힌 규약만 따른다.

## 목표

**목적함수: Lighthouse Performance 점수 (mobile 프리셋, 워밍업 1회 폐기 후 5회 중앙값).**

**제약조건: desktop 점수가 100에서 내려가면 안 된다.**

**타이브레이크: 위 둘이 동률이면 `bundleBytes`(`.next/static` JS 총 바이트)가 작은 쪽이 낫다.**

목적함수가 mobile인 이유는 desktop이 이미 천장이기 때문이다. 2026-08-11 실측:

| | desktop | mobile |
| --- | --- | --- |
| score | **100** (개별 런 `[100,100,100]`, 분산 0) | 82 ~ 86 |
| TBT | 46 ms | **540 ms** |
| LCP | 590 ms | 1958 ~ 2858 ms |
| FCP | 371 ms | 1509 ms |

desktop 점수로는 기울기가 0이라 루프가 개선을 감지할 수 없다. mobile은 18점의 여유가 있고
TBT 540ms라는 명확한 레버가 있다. 다만 이 제품은 데스크톱 CAD 도구이므로 mobile은
**계측 신호일 뿐 타깃 환경이 아니다** — 그래서 desktop 100이 제약으로 붙는다.

측정 대상은 로컬 프로덕션 빌드(`next build` → `next start`)의 `/` 한 페이지다.
개발 서버(`next dev`)는 측정하지 않는다 — 숫자가 의미 없다.

### 노이즈 구조 — 점수보다 TBT를 믿어라

같은 트리를 5회-중앙값으로 두 번 측정한 결과(2026-08-11):

| 지표 | 측정 1 | 측정 2 | 흔들림 |
| --- | --- | --- | --- |
| score | 83 | 83 | 0 (개별 런은 76~85) |
| FCP | 1509.006 | 1508.912 | ~0.1 ms |
| **TBT** | **556** | **555** | **~1 ms** |
| LCP | 2409 | 2859 | ~450 ms |
| bundleBytes | 2428118 | 2428118 | 0 |

**점수 노이즈는 거의 전부 LCP에서 온다.** TBT·FCP·bundleBytes는 사실상 결정적이다.
그리고 mobile 점수를 깎고 있는 것이 바로 TBT 555ms다. 따라서 판정은 점수 단독이 아니라
**TBT를 1차 신호로** 쓴다. 점수만 보면 노이즈에 휘둘려 진짜 개선을 기각하게 된다.

워밍업 런을 버리기 전에는 중앙값 흔들림이 16점이었다 — 하네스가 1회차를 폐기하는 이유가
이것이다. 3회에서 5회로 늘린 것도 같은 이유다(3회일 때 86/82, 5회일 때 83/83).

## 편집해도 되는 것 (허용 범위: 빌드·로딩 계층)

- `next.config.ts` — 번들러 옵션, `modularizeImports`, `transpilePackages`, 실험 플래그
- `src/app/layout.tsx` — 폰트 로딩 전략(`display`, `preload`, subset), `<head>` 리소스 힌트
- `src/app/page.tsx`, `src/components/**` — **로딩 방식만**: `next/dynamic`, `React.lazy`, `Suspense` 경계, 코드 스플리팅
- `three.js` import 형태 — 네임스페이스 import를 개별 심볼 import로 바꿔 트리셰이킹 확보
- `src/app/globals.css` — 사용되지 않는 CSS 제거, critical CSS 순서
- `package.json` 의 빌드 관련 스크립트·의존성

## 편집하면 안 되는 것

1. **`scripts/perf/` 전체.** 평가 기준을 바꿔서 점수를 올리는 것은 부정이다.
2. **화면에 보이는 동작·레이아웃.** 3D 뷰어를 클릭 전까지 안 띄우기, 패널 숨기기 같이
   사용자가 체감하는 흐름이 바뀌는 변경은 이번 범위 밖이다. `dynamic()`으로 청크를
   분리하되 초기 화면에 나타나는 것은 그대로 나타나야 한다.
3. **`src/domain/` 과 `src/rulepack/`.** 루트 `CLAUDE.md`의 CRITICAL 규칙이 그대로 적용된다.
   특히 규준 수치를 `.ts`에 쓰는 것, 룰팩 `source`/`confidence` 제거는 금지.
4. **테스트 파일 — 비동기 적응만 허용(2026-08-11 waiver).**
   최적화가 동기 경계를 비동기 경계로 바꾸면 기존 테스트가 그 사실만으로 깨진다. 이때
   `getByTestId` → `findByTestId`, `act`로 rAF flush 같이 **비동기 경계에 맞추는 수정**은
   허용한다. 단언 자체는 그대로 둔다.

   여전히 금지: 단언 삭제·완화, `skip`/`todo` 처리, 기대값을 결과에 맞춰 고치기.
   판별 기준 — 수정 후에도 **그 테스트가 원래 잡던 회귀를 여전히 잡는가**. 아니면 금지다.

## 게이트 — 측정 전에 반드시 통과해야 한다

```
npm run typecheck
npm run test
npm run lint
```

셋 중 하나라도 실패하면 그 변경은 **점수와 무관하게 폐기**한다. 되돌리고 다음 후보로 간다.
게이트를 우회하거나 완화하지 않는다.

## 라운드 규약

한 라운드는 정확히 **하나의 변경**만 다룬다. 두 개를 같이 넣으면 어느 쪽이 효과를 냈는지 알 수 없다.

```
1. 후보 하나를 고르고 구현한다
2. 게이트 실행 → 실패면 되돌리고 라운드 종료(폐기로 기록)
3. node scripts/perf/measure.mjs --label "<후보이름>" --preset mobile --runs 5
4. 제약 검사: node scripts/perf/measure.mjs --label "<후보이름>-desktop" \
              --preset desktop --runs 3 --no-build
     desktop < 100 → 점수와 무관하게 revert
5. 판정 — 위에서부터 순서대로, 먼저 걸리는 것을 적용:
     desktop < 100                                   → revert (제약 위반)
     score >= best.score + 3                         → keep (점수 명백 개선)
     score >= best.score - 1 이고 TBT <= best.TBT-25 → keep (TBT는 σ≈1ms라 25ms면 노이즈 밖)
     score/TBT가 노이즈 안이고 bundleBytes -20kB 이상 → keep (타이브레이크)
     그 외                                            → 스냅샷에서 되돌림(revert)
6. journal.jsonl에 남은 기록과 판정 근거를 함께 보고한다
```

판정에서 LCP는 쓰지 않는다. σ가 450ms라 어떤 방향으로든 근거가 되지 못한다.

### 스냅샷 규약 (revert 기구)

`git checkout`으로 되돌리면 **앞선 라운드에서 채택된 개선까지 같이 날아간다.** 그래서
"현재까지의 최선(best-so-far)"을 파일 스냅샷으로 들고 다닌다. 커밋은 하지 않는다 —
실험 이력이 git 히스토리를 오염시키지 않게 한다.

```
BEST=<scratchpad>/best        # src/, next.config.ts, package.json

라운드 시작 : (편집은 작업트리에 직접 한다)
keep 판정   : rm -rf $BEST && mkdir -p $BEST && cp -r src next.config.ts package.json $BEST/
revert 판정 : rm -rf src && cp -r $BEST/src src && cp $BEST/next.config.ts $BEST/package.json .
```

`src/`는 전부 git에 추적되고 있으므로 스냅샷이 깨져도 `git checkout -- src`로 HEAD까지는
복구된다. 스냅샷 디렉터리가 실제로 존재하는지 확인하고 나서 `rm -rf`를 실행할 것.

4단계는 `--no-build`를 쓴다. 3단계가 이미 빌드했고 트리가 그대로이므로 다시 빌드하면
같은 산출물을 만드느라 시간만 쓴다.

## 정지 조건

**3라운드 연속으로 keep이 없으면 정체(plateau)로 판정하고 루프를 끝낸다.**

정체로 끝날 때는 시도했으나 기각된 후보들을 이유와 함께 남긴다 — 다음 사람이 같은 것을
다시 시도하지 않게 하는 것이 이 로그의 목적이다.

## 기록

모든 측정은 `scripts/perf/journal.jsonl`에 append된다. 이 파일은 지우지 않는다.

---

## 1차 루프 결과 (2026-08-11) — 정체로 종료

베이스라인 mobile 84 / TBT 520 → **최종 mobile 85 / TBT 484 / First Load JS 283→135 kB**.
채택 1건, 기각 7건. 3라운드 연속 keep 없음 + 후보 목록 소진으로 종료.

### 채택

- **`next/dynamic`으로 `Viewer3D` 분리** (`src/app/page.tsx`). First Load JS 283→135 kB,
  TBT 520→484. `ssr`은 기본값(true) 유지 — `false`로 두면 프리렌더 마크업에서 뷰어 페인이
  빠져 화면이 달라진다. 실브라우저로 3D 렌더·数量·출처 고지 정상 확인.

### 기각 — 다시 시도하지 말 것

| 후보 | 결과 | 이유 |
| --- | --- | --- |
| 실린더 156개 템플릿 캐싱 | TBT 520→523 | Node 실측 3.44ms vs 복제 4.57ms. **복제가 더 느리다** |
| `sceneKey` 이펙트 rAF 분리 | TBT 484→**563** | 태스크 분할이 렌더 루프 첫 프레임과 겹쳐 악화 |
| `TakeoffPane` 추가 dynamic | TBT 484→**511** | FLJS는 135→114 kB로 줄지만 청크 경계 비용이 더 크다 |
| `experimental.inlineCss` | score 85→81 | 단독 베이스라인에선 소폭 이득, R4 위에선 손해 |
| 죽은 Tailwind 출력 제거 | 84 / 485 | 구분 불가. (`bundleBytes`는 `.js`만 세므로 CSS를 못 잡는다) |
| `rebarSegments` 이중 전개 제거 | 미측정 기각 | 제거 대상이 3.44ms 미만인데, R1이 3.44ms 제거로 TBT가 안 움직임을 이미 보였다 |
| 폰트 preload 수동 주입 | 기각 | 프리렌더에 preload가 없는 건 `next-font-manifest-plugin`이 경로를 `/`로 매칭하는데 Windows는 `\`인 **로컬 빌드 한정 현상**. Vercel(Linux)에선 이미 정상. 하네스만 최적화하게 된다 |

### 근거가 확인된 사실 (재조사 불필요)

- **desktop은 이미 만점**이고 개별 런 분산도 0이다. desktop 점수로는 기울기가 없다.
- **LCP는 손댈 대상이 아니다.** 관측 LCP == 관측 FCP(단일 엔트리, 푸터 `<span>`). journal의
  LCP−FCP 갭은 정확히 RTT의 정수배(mobile 150ms×n, desktop 40ms×n)로 Lantern 시뮬레이션
  산물이다. canvas는 LCP 후보 타입이 아니다.
- **exceljs는 이미 지연 로드**된다(`await import`, 933 kB 청크가 매니페스트에 없음). 초기 비용 0.
- **`import * as THREE`는 트리셰이킹을 막지 않는다.** three가 `sideEffects`를 선언해 이미 25% 제거됨.
  `optimizePackageImports`는 오히려 1 kB 악화.
- **폰트 2종은 실제로 렌더에 쓰인다**(런타임 `document.fonts` 확인). 제거 불가.
  `display:swap`·`adjustFontFallback`은 이미 기본값으로 켜져 있다(CLS 0.001의 이유).
- **112 kB 폴리필은 `noModule`**이라 크롬이 받지 않는다.
- **프레임워크 런타임 청크가 TBT 175ms**를 차지한다 — 범위 내에서 못 줄이는 바닥.

### 다음 루프를 위한 경고

측정값이 예측을 크게 벗어나면 **먼저 하네스를 의심할 것.** 1차 루프에서 TBT가 555→21ms로
붕괴하고 점수가 83→93으로 뛴 적이 있는데, 원인은 최적화가 아니라 낡은 서버가 포트를 붙들고
있어 청크가 400을 뱉고 하이드레이션이 통째로 실패한 것이었다. **기능이 죽을수록 점수가 오른다.**
`assertBuildIsServed`가 이제 이 상황에서 측정을 중단시킨다. 5회 측정의 분산이 0이면 의심할 것 —
JS가 실행되지 않는 페이지는 완벽하게 결정적이다.
