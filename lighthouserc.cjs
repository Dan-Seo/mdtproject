// 브라우저 실측 회귀 게이트 (npm run lighthouse). main push의 ci.yml에서만 돈다.
//
// @lhci/cli는 devDependencies에 정확한 버전으로 고정한다 — npx로 되돌리지 말 것.
// 리뷰가 양쪽으로 한 번씩 지적한 지점이라 결론을 여기 남긴다 (PR #12 minor / PR #13 minor).
// npx는 최상위 버전만 핀하고 전이 의존은 실행 시점 semver 해석이라 무결성 해시가 없다.
// 차단 게이트를 좌우하는 코드가 락파일 밖에 있는 쪽이, npm ci 표면이 넓어지는 쪽보다 나쁘다.
// (PR #13이 제안한 `npm audit --audit-level=high` CI 게이트는 지금 넣으면 main이 즉시
//  깨진다 — exceljs 전이 의존에 high 3건이 이미 있다. 별건으로 다룰 것.)
//
// 게이트를 거는 원칙 — **러너 속도에 흔들리지 않는 값에만 error를 건다.**
// main CI가 실패하면 oncall.yml이 헤드리스 에이전트를 깨워 API 토큰을 쓴다. 타이밍
// 지표(TBT·LCP·performance 점수)는 2코어 공유 러너에서 실행마다 수십 %씩 흔들리므로,
// 여기에 error를 걸면 회귀가 없는데도 main이 붉어지고 사고 대응이 헛돈다.
// 그래서 타이밍은 warn(리포트에만 남음), **전송 바이트 수와 접근성처럼 결정적인 값**에만
// error를 건다. 바이트 수는 러너와 무관하고 번들이 커지면 반드시 늘어난다 — 이게 래칫이다.
//
// 아래 숫자는 전부 **실측값 + 여유(약 5%)**다. 추정치가 아니다.
// 측정: 2026-08-12, lighthouse 12.8.2, preset=desktop, 프로덕션 빌드를 localhost에서.
//   da48de3(M3b): performance 91 / a11y 96 / BP 96 / SEO 90 · script 300,297 B · total 408,138 B
//   ↓ a11y 결함 4건 수정 후 (이 커밋)
//   performance 92 / accessibility 100 / best-practices 100 / seo 100
//   script 300,249 B (9 요청) · font 89,512 B (2) · total 409,043 B (15 — icon.svg 640 B 추가)
//   LCP 692ms · TBT 242ms
//
// **타이밍 임계값은 러너 실측으로 잡는다 — 로컬 값으로 잡으면 매번 울려 경고가 벽지가 된다.**
// 같은 커밋을 GitHub 2코어 러너에서 3회(run 31598974988):
//   performance 0.67 / 0.69 / 0.69   TBT 17,743 / 15,840 / 15,715 ms
// 로컬 대비 TBT가 65배다. 하드웨어 차이만으로는 설명되지 않는다 — 러너에는 GPU가 없어
// WebGL이 SwiftShader 소프트웨어 래스터라이저로 돌기 때문이다. 즉 이 TBT는 사용자가
// 겪는 지연이 아니라 **GPU 없는 최악 조건의 값**이다. 절대값을 사용자 체감으로 읽지 말 것.
// 같은 러너 위에서의 상대 회귀 신호로만 쓴다 — 그래서 error가 아니라 warn이다.
//
// 값을 **올릴 때는 근거를 함께 적을 것** — 래칫은 한 방향으로만 조여야 의미가 있다.
// 최적화로 값이 내려가면 그 자리에서 예산도 같이 조인다.
//
// ── 2026-08-20 재산정 (script 315,000 → 337,000 / count 10 → 13 / total 430,000 → 457,000)
// 러너 실측(3회 동일값). 앞 판은 run 32250937490(08-19 12:06, 마지막 초록),
// 뒤 판은 run 32333928288:
//   script 314,550 B (9 요청) → 320,965 B (12)   total 428,146 B (15) → 435,719 B (19)
//   TBT 중앙값 18,791ms → 14,729ms
// 늘어난 6,415 B의 출처는 셋이고 전부 설명된다:
//   - #48 three 청크 분리 +3,905 B — Viewer3D(869)·three 유틸(981)·dynamic 로더(121)로
//     갈라지며 요청이 3개 늘었다. 그 대가로 TBT가 22% 내려갔다(−4,062ms). 전송 바이트를
//     주고 블로킹 시간을 산 것이라 되돌리지 않는다 — 이 래칫이 막으려는 「무심코 커짐」이
//     아니다.
//   - #50 R9①(柱主筋 최상단 先端 계상) +211 B
//   - #6 PostHog 계측 +2,299 B — global-error 청크(999 B)와 부트 엔트리 증가분이다.
//     SDK 자체는 동적 청크로 갈라져 초기 로드에 없다(ADR-020).
// 앞 판의 여유는 script 450 B·total 1,854 B뿐이었다 — 래칫이 조여진 게 아니라 다음
// 변경이 무엇이든 깨지는 상태였고, 실제로 세 PR이 연달아 넘겼다. 새 값은 같은 방식
// (실측 + 약 5%)으로 다시 잡았다.
//
// ── 2026-08-20 조이기 (font 95,000 → 85,000 / total 457,000 → 448,000)
// #49(폰트 wght 축을 400·600·700으로 좁힘)가 머지된 뒤의 러너 실측이다.
// run 32344630194, 3회 전부 동일값:
//   font 89,512 B → 80,372 B (−9,140)   total 435,719 B → 426,732 B (−8,987)
//   script 320,965 B (12 요청) 불변 — 이 변경은 script를 건드리지 않는다.
// 위의 재산정은 값을 올리는 쪽이었고 이건 내리는 쪽이다. 최적화로 실측이 내려가면
// 예산도 그 자리에서 같이 조인다 — 안 조이면 그만큼이 다음 회귀의 침묵 구간이 된다.
// 여유는 앞 판과 같은 비율로 뒀다: font +5.8%, total +5.0%.
// 이 예산이 지키는 것 — JetBrains Mono에 굵기 하나를 더 얹으면 9,140 B가 도로
// 늘어 font 예산을 넘는다. 즉 wght 목록이 조용히 넓어지는 것을 이 줄이 잡는다.
//
// ── 2026-08-22 M4 실측 (예산은 그대로 — 안에 들어왔다)
// 로컬 next start + lighthouse CLI(desktop). 러너가 아니므로 절대값은 러너 이력과
// 직접 비교하지 않고, 넘었는지만 본다:
//   script 330,484 B (12 요청)  font 80,372 B (2)  total 438,461 B (19)
// 앞 판 대비 script +9,519 B. 내용은 재방문 경로(persist·useProjectPersistence·
// ProjectActions)와 인쇄 경로(TakeoffPrint)다. **exceljs·GLTFExporter는 초기 로드에
// 없다** — 둘 다 동적 import라 요청 수가 12로 불변인 것이 그 증거다. 남은 여유는
// script 6,516 B·total 9,539 B이므로, 다음에 초기 로드로 무엇을 끌어오든 여기서 걸린다.
module.exports = {
  ci: {
    collect: {
      // 빌드 산출물을 그대로 잰다 — dev 서버는 번들이 달라 회귀 계측에 쓸 수 없다.
      startServerCommand: 'npx next start -p 3000',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 60000,
      url: ['http://localhost:3000'],
      // 중앙값을 쓰기 위한 최소 홀수. 타이밍 warn의 노이즈를 줄인다.
      // LHCI_RUNS로 낮출 수 있다 — autoresearch의 내부 루프가 쓴다. 바이트 지표는
      // 실행마다 완전히 동일하므로(3회 실측 428148/314550 동일) 1회면 충분하고,
      // 3회는 타이밍 warn의 중앙값을 위한 것이라 언덕오르기에는 필요 없다.
      // 기본값은 3 그대로다 — main CI 게이트의 동작은 바뀌지 않는다.
      numberOfRuns: Number(process.env.LHCI_RUNS) || 3,
      settings: {
        // 이 제품은 데스크톱 전용 3D 툴이다 — 모바일 프리셋으로 재면 관계없는 값이 나온다.
        preset: 'desktop',
        chromeFlags: '--headless=new --no-sandbox --disable-gpu',
      },
    },
    assert: {
      // preset을 상속하지 않는다 — lighthouse:recommended는 이 앱과 무관한 감사까지 실패시킨다.
      assertions: {
        // ── 결정적(러너 무관) → error ─────────────────────────────────
        // 셋 다 실측 1.00이다. 만점에서 조이면 어떤 회귀든 첫 칸에서 걸린다 —
        // 내려갈 여지를 남겨두면 그만큼은 조용히 나빠진다.
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],

        // 번들 래칫. 실측 + 약 5% 여유 — three.js를 무심코 초기 로드에 더 끌어오면 걸린다.
        // 값의 근거와 2026-08-20 재산정·조이기 이력은 파일 상단에 있다.
        'resource-summary:script:size': ['error', { maxNumericValue: 337000 }],
        'resource-summary:script:count': ['error', { maxNumericValue: 13 }],
        'resource-summary:font:size': ['error', { maxNumericValue: 85000 }],
        'resource-summary:total:size': ['error', { maxNumericValue: 448000 }],

        // ── 러너 노이즈에 흔들림 → warn (리포트에만 남는다) ──────────────
        // 러너 실측 중앙값(0.69 / 15,840ms)에 여유를 준 값이다. 로컬 값(0.91 / 242ms)으로
        // 잡으면 회귀가 없어도 매번 울린다.
        'categories:performance': ['warn', { minScore: 0.65 }],
        'total-blocking-time': ['warn', { maxNumericValue: 20000 }],
        // LCP는 러너에서도 예산 안에 들어왔다 — GPU 없는 조건에서도 초기 표시는 빠르다.
        'largest-contentful-paint': ['warn', { maxNumericValue: 1500 }],
      },
    },
    upload: {
      // temporary-public-storage는 리포트를 외부에 공개한다 — 쓰지 않는다.
      // 리포트는 워크플로 아티팩트로만 남긴다.
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
}
