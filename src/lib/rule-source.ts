import type { RuleHit } from '@/domain/rules/types'

/**
 * 출처 표시는 PDL1.0 준거의 법적 의무다 (CLAUDE.md). 룰 유래 수치를 보여주는
 * 화면이 여럿이므로 표기 형식을 여기 하나로 둔다 — 화면마다 따로 적으면
 * 같은 근거가 화면마다 다르게 보인다.
 */
export function sourceLabel(rule: RuleHit): string {
  return [rule.source.short, rule.source.section].filter(Boolean).join(' ')
}

export function sourceTooltip(rule: RuleHit): string {
  const edition = rule.source.edition ? `（${rule.source.edition}）` : ''
  const location = [
    `${rule.source.doc}${edition}`,
    rule.source.section,
    rule.source.page === null ? null : `${rule.source.page}頁`,
  ]
    .filter(Boolean)
    .join(' ')
  const note = rule.source.url
    ? rule.note
    : `原文URL未確保 — ${rule.note}`

  return [
    `${rule.label} ＝ ${rule.expr}`,
    location,
    // 등급마다 다른 말이 붙어야 한다 — 「원문에 없다」와 「원문에 있는데
    // 검토가 1인이다」를 같은 문구로 덮으면 등급을 나눈 의미가 없다.
    rule.confidence === 'inferred'
      ? '⚠ 原文に値なし（推論）—'
      : rule.confidence === 'transcribed'
        ? '△ 原文明示・独立検討待ち（R6）—'
        : null,
    note,
  ]
    .filter(Boolean)
    .join('\n')
}
