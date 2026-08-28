import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const REMEDIATION =
  'CLAUDE.md와 docs/MILESTONES.md·docs/RISKS.md의 대장을 확인하고, 이 테스트의 명시적 매핑표와 양쪽 문서를 함께 갱신하라.'

type MilestoneMapping = {
  claudeRow: string
  milestonesName: string
}

// 이름이 비슷하다는 이유로 대응시키지 않는다. 문서의 실제 행을 사람이 직접 짝지은 표다.
const MILESTONE_MAPPING: readonly MilestoneMapping[] = [
  { claudeRow: 'M0 스파이크', milestonesName: 'M0' },
  { claudeRow: 'M1 워킹 스켈레톤', milestonesName: 'M1' },
  { claudeRow: 'M2 룰팩', milestonesName: 'M2' },
  { claudeRow: 'M3a 단일 스팬 大梁·뷰어', milestonesName: 'M3a' },
  { claudeRow: 'M3b 다스팬·継手', milestonesName: 'M3b' },
  { claudeRow: 'M3c 고유 상세', milestonesName: 'M3c' },
  { claudeRow: '도면 인식(로컬)', milestonesName: '도면 인식(로컬)' },
  { claudeRow: 'ST-Bridge 취입', milestonesName: 'ST-Bridge 취입' },
  {
    claudeRow: '부재 확장(耐震壁·床板)',
    milestonesName: '부재 확장(耐震壁·床板)',
  },
  {
    claudeRow: '일본 고유 형태·제품',
    milestonesName: '일본 고유 형태·제품 확장',
  },
  {
    claudeRow: 'M4 재방문·내역서·PDF·glTF',
    milestonesName: 'M4',
  },
  { claudeRow: 'M5 한국 실무자 UX 리뷰', milestonesName: 'M5' },
]

function parsePipeCells(line: string): string[] | undefined {
  if (!line.trim().startsWith('|') || !line.trim().endsWith('|')) {
    return undefined
  }

  return line
    .trim()
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function parseClaudeMilestones(markdown: string): Array<{
  name: string
  status: string
}> {
  const lines = markdown.split(/\r?\n/)
  const headerIndex = lines.findIndex(
    (line) => line.trim() === '| | 상태 | 남은 것 |',
  )

  expect(
    headerIndex,
    `CLAUDE.md의 마일스톤 표를 찾지 못했다. ${REMEDIATION}`,
  ).toBeGreaterThanOrEqual(0)

  const rows: Array<{ name: string; status: string }> = []
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith('|')) break

    const cells = parsePipeCells(line)
    if (!cells || cells.length !== 3 || cells[0] === '') continue
    rows.push({ name: cells[0], status: cells[1].replaceAll('**', '') })
  }

  return rows
}

function parseMilestonesCheckboxes(markdown: string): Array<{
  checked: boolean
  name: string
}> {
  const rows: Array<{ checked: boolean; name: string }> = []

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\s*- \[([ xX])\] \*\*(.+?)\*\*(?:\s+—|\s*$)/)
    if (!match) {
      if (/^\s*- \[[ xX]\]/.test(line)) {
        expect(
          match,
          `docs/MILESTONES.md의 체크박스 행에서 굵은 이름을 읽지 못했다: ${line}. ${REMEDIATION}`,
        ).not.toBeNull()
      }
      continue
    }

    rows.push({ checked: match[1].toLowerCase() === 'x', name: match[2] })
  }

  return rows
}

function parseClaudeRiskTable(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/)
  const headerIndex = lines.findIndex(
    (line) => line.trim() === '| | 상태 | 한 줄 |',
  )

  expect(
    headerIndex,
    `CLAUDE.md의 열린 리스크 표를 찾지 못했다. ${REMEDIATION}`,
  ).toBeGreaterThanOrEqual(0)

  const ids: string[] = []
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith('|')) break

    const cells = parsePipeCells(line)
    if (cells && cells.length === 3 && /^R\d+$/.test(cells[0])) {
      ids.push(cells[0])
    }
  }

  return ids
}

function extractRiskIds(markdown: string): string[] {
  return [...new Set(markdown.match(/R\d+/g) ?? [])]
}

function assertExactItems(
  actual: readonly string[],
  expected: readonly string[],
  message: string,
): void {
  expect(actual.length, message).toBe(expected.length)
  expect([...new Set(actual)].sort(), message).toEqual(
    [...new Set(expected)].sort(),
  )
}

describe('문서 대장 동기화', () => {
  const claude = readFileSync(resolve(process.cwd(), 'CLAUDE.md'), 'utf8')
  const milestones = readFileSync(
    resolve(process.cwd(), 'docs/MILESTONES.md'),
    'utf8',
  )
  const risks = readFileSync(resolve(process.cwd(), 'docs/RISKS.md'), 'utf8')

  it('마일스톤 표와 체크박스가 명시적 매핑 및 상태를 공유한다', () => {
    const claudeRows = parseClaudeMilestones(claude)
    const milestoneRows = parseMilestonesCheckboxes(milestones)
    const mappingClaudeNames = MILESTONE_MAPPING.map((item) => item.claudeRow)
    const mappingMilestoneNames = MILESTONE_MAPPING.map(
      (item) => item.milestonesName,
    )

    assertExactItems(
      mappingClaudeNames,
      [...new Set(mappingClaudeNames)],
      `테스트 매핑표의 CLAUDE.md 이름이 중복되었다. ${REMEDIATION}`,
    )
    assertExactItems(
      mappingMilestoneNames,
      [...new Set(mappingMilestoneNames)],
      `테스트 매핑표의 docs/MILESTONES.md 이름이 중복되었다. ${REMEDIATION}`,
    )
    assertExactItems(
      claudeRows.map((row) => row.name),
      mappingClaudeNames,
      `CLAUDE.md 마일스톤 행이 매핑표와 다르다. 새 항목을 추가하거나 이름을 바꾸면 매핑표를 명시적으로 갱신하라. ${REMEDIATION}`,
    )
    assertExactItems(
      milestoneRows.map((row) => row.name),
      mappingMilestoneNames,
      `docs/MILESTONES.md 체크박스가 매핑표와 다르다. 새 항목을 추가하거나 이름을 바꾸면 매핑표를 명시적으로 갱신하라. ${REMEDIATION}`,
    )

    for (const mapping of MILESTONE_MAPPING) {
      const claudeRow = claudeRows.find((row) => row.name === mapping.claudeRow)
      const milestoneRow = milestoneRows.find(
        (row) => row.name === mapping.milestonesName,
      )

      expect(claudeRow, `매핑된 CLAUDE.md 행이 없다: ${mapping.claudeRow}. ${REMEDIATION}`).toBeDefined()
      expect(milestoneRow, `매핑된 docs/MILESTONES.md 행이 없다: ${mapping.milestonesName}. ${REMEDIATION}`).toBeDefined()

      const normalizedStatus = claudeRow!.status.trim()
      if (milestoneRow!.checked) {
        expect(
          normalizedStatus,
          `${mapping.claudeRow}: 체크된 항목은 CLAUDE.md에서 완료여야 한다. ${REMEDIATION}`,
        ).toBe('완료')
      } else {
        expect(
          ['진행 중', '미착수'],
          `${mapping.claudeRow}: 체크되지 않은 항목은 진행 중 또는 미착수여야 한다. ${REMEDIATION}`,
        ).toContain(normalizedStatus)
      }
    }
  })

  it('두 리스크 대장이 같은 번호 집합을 가진다', () => {
    const risksMdIds = extractRiskIds(risks)
    const claudeMdIds = parseClaudeRiskTable(claude)

    // R번호의 상태 문언은 문서마다 경위·보강 문구가 달라 원래 다르다.
    // 여기서 상태까지 비교하면 정상적인 대장 갱신도 깨져 다음 사람이 검사를 지우게 된다.
    assertExactItems(
      risksMdIds,
      claudeMdIds,
      `docs/RISKS.md와 CLAUDE.md 열린 리스크 표의 R번호가 다르다. 상태 문언은 비교하지 말고 번호 집합을 먼저 맞춰라. ${REMEDIATION}`,
    )
  })
})
