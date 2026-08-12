// 브라우저 실측 회귀 게이트 (npm run lighthouse). main push의 ci.yml에서만 돈다.
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
module.exports = {
  ci: {
    collect: {
      // 빌드 산출물을 그대로 잰다 — dev 서버는 번들이 달라 회귀 계측에 쓸 수 없다.
      startServerCommand: 'npx next start -p 3000',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 60000,
      url: ['http://localhost:3000'],
      // 중앙값을 쓰기 위한 최소 홀수. 타이밍 warn의 노이즈를 줄인다.
      numberOfRuns: 3,
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
        'resource-summary:script:size': ['error', { maxNumericValue: 315000 }],
        'resource-summary:script:count': ['error', { maxNumericValue: 10 }],
        'resource-summary:font:size': ['error', { maxNumericValue: 95000 }],
        'resource-summary:total:size': ['error', { maxNumericValue: 430000 }],

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
