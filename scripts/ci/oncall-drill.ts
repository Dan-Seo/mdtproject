// oncall 실검증(drill)용 파일 — 워크플로가 심었고 커밋되어 있지 않다.
//
// 아래 한 줄에 타입 오류가 있어 `npm run typecheck` 가 여기서 실패한다.
// 최소 수정으로 타입을 맞추고 **파일은 남길 것**. 파일을 지우면 main 대비 diff 가
// 비어 「수정 재검증 → 브랜치 푸시 → draft PR」 경로를 밟지 못한다 — 그 경로가
// 실제로 도는지 보는 것이 이 drill 의 전부다.
export const drillAnswer: number = 42
