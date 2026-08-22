import type { MemberClass, Section } from '../model/member'
import type { RuleHit, RulePack } from './types'

/**
 * 表5.3.6 のかぶり厚さセルを特定する共通条件 — 생성기(column.ts)와
 * 집계기(quantity/index.ts)가 반드시 같은 셀을 봐야 하므로 단일 출처로 둔다.
 * 地上躯体のみを扱う (基礎・地中部材は ADR-005 でスコープ外) — 土に接しない。
 */
export function coverConditions(
  section: Section,
): Record<string, string | boolean> {
  const cell = {
    memberKind: section.kind,
    soilContact: false,
    finish: section.finish,
  }

  // 表5.3.6 の「スラブ、耐力壁以外の壁」行は仕上げの有無だけで分かれ、屋内・
  // 屋外の区別を持たない — 同じ表の「柱、梁、耐力壁」行と構造が違う。だから
  // 床板は exposure を入力に持たず、ここでも渡さない (ADR-028)。
  return section.kind === '床板'
    ? cell
    : { ...cell, exposure: section.exposure }
}

function matches(
  ruleConditions: Record<string, string | number | boolean>,
  queryConditions: Record<string, unknown>,
): boolean {
  return Object.entries(ruleConditions).every(
    ([name, value]) => queryConditions[name] === value,
  )
}

export function lookupRule(
  pack: RulePack,
  key: string,
  conditions: Record<string, unknown>,
): RuleHit {
  const candidates = pack.entries.filter(
    (entry) => entry.key === key && matches(entry.conditions, conditions),
  )

  if (candidates.length === 0) {
    throw new Error(
      `Rule not found: ${key} for ${JSON.stringify(conditions)}`,
    )
  }

  const specificity = Math.max(
    ...candidates.map((entry) => Object.keys(entry.conditions).length),
  )
  const mostSpecific = candidates.filter(
    (entry) => Object.keys(entry.conditions).length === specificity,
  )

  if (mostSpecific.length !== 1) {
    throw new Error(
      `Rule lookup is ambiguous: ${key} for ${JSON.stringify(conditions)}`,
    )
  }

  return mostSpecific[0]
}

/**
 * 같은 key의 행 전부를 `orderBy` 조건값의 오름차순으로 돌려준다.
 *
 * 区分表(（３）梁2))처럼 **행의 개수와 순서 자체가 규준**인 룰에 쓴다. 코드가
 * 「区分은 3개」라고 알면 룰팩을 바꿔도 코드가 따라오지 않으므로, 조회 쪽이
 * 표 전체를 읽는다.
 */
export function lookupRuleSeries(
  pack: RulePack,
  key: string,
  orderBy: string,
): RuleHit[] {
  const rows = pack.entries.filter((entry) => entry.key === key)

  if (rows.length === 0) {
    throw new Error(`Rule series not found: ${key}`)
  }

  return [...rows]
    .map((entry) => {
      const order = entry.conditions[orderBy]
      if (typeof order !== 'number') {
        throw new Error(
          `Rule ${key} must carry a numeric ${orderBy} condition to be ordered`,
        )
      }
      return { entry, order }
    })
    .sort((left, right) => left.order - right.order)
    .map(({ entry }) => entry)
}

export function lookupMarkup(
  pack: RulePack,
  memberClass: MemberClass | string,
): RuleHit {
  return lookupRule(pack, 'markup.rate', { memberClass })
}
