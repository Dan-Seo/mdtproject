/**
 * 도면 문자열의 정규화. `runs.ts`에서 갈라 낸 것뿐이고 구현은 그대로다 —
 * 취입 화면이 라벨 하나를 맞춰 보려고 파서 전체(runs.ts와 그것을 끄는
 * section-list/parse.ts)를 초기 로드에 끌고 오던 것을 끊기 위해서다.
 *
 * **구현은 하나뿐이어야 한다** (ADR-033: 断面リスト와 framing-plan이 같은
 * 정규화를 써야 문자열 완전 일치가 성립한다). 그래서 여기 한 곳에 두고
 * runs.ts는 이것을 다시 내보낸다 — normalize.test.ts가 동일성을 고정한다.
 */

/**
 * 하이픈류를 半角 '-'로 접는다. CP932 0x815C(全角ダッシュ)의 표준 매핑이 U+2014와
 * U+2015로 갈리므로 둘 다 넣는다 — 실물 도면(yokohama p13)은 U+2015를 쓴다.
 *
 * 長音符(ー U+30FC)는 넣지 않는다. 하이픈이 아니라 가나 글자라서, 접으면
 * 「コンクリート」가 「コンクリ-ト」가 되어 확정하지 못한 셀에 붙이는 원문 참고
 * 표시가 망가진다 — kani p38에 실제로 들어 있다.
 */
export function normalized(value: string): string {
  return value.normalize('NFKC').replace(/[‐‑‒–—―−]/g, '-')
}

export function compact(value: string): string {
  return normalized(value).replace(/\s+/g, '')
}
