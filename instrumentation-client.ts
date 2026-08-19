// Next.js가 모든 페이지에서 자동으로 로드하는 관례 파일이다. 실제 초기화·
// 스크러빙·capture 래퍼는 src/lib/telemetry.ts에 있다 — 이 파일에서
// posthog-js를 직접 다루면 이 파일을 import하는 다른 진입점이 없어도
// 이 파일 자체가 정적 로드 대상이라 SDK를 초기 번들에 끌고 들어온다.
export { posthogInit } from '@/lib/telemetry'
