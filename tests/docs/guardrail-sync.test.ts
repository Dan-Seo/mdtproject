import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, it } from 'vitest'

const REMEDIATION =
  'AGENTS.md의 본문을 CLAUDE.md에서 다시 생성하라. 한쪽만 고치면 codex가 낡은 규칙을 받는다'

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

it('AGENTS.md가 자체 헤더 뒤에 CLAUDE.md 본문 전체를 그대로 담는다', () => {
  const agentsPath = resolve(process.cwd(), 'AGENTS.md')
  const claudePath = resolve(process.cwd(), 'CLAUDE.md')

  expect(
    existsSync(agentsPath),
    `AGENTS.md 파일이 없습니다. ${REMEDIATION}`,
  ).toBe(true)
  expect(
    existsSync(claudePath),
    `CLAUDE.md 파일이 없습니다. ${REMEDIATION}`,
  ).toBe(true)

  const agents = normalizeNewlines(readFileSync(agentsPath, 'utf8'))
  const claude = normalizeNewlines(readFileSync(claudePath, 'utf8'))
  const claudeTitleEnd = claude.indexOf('\n')

  expect(
    claudeTitleEnd,
    `CLAUDE.md 제목 줄 뒤에 본문이 없습니다. ${REMEDIATION}`,
  ).toBeGreaterThan(0)

  const claudeTitle = claude.slice(0, claudeTitleEnd)
  const claudeBody = claude.slice(claudeTitleEnd + 1)

  expect(
    claudeTitle,
    `CLAUDE.md 제목이 Markdown H1 규약을 따르지 않습니다. ${REMEDIATION}`,
  ).toMatch(/^# \S/)
  expect(
    claudeBody.length,
    `CLAUDE.md 본문이 비어 있습니다. ${REMEDIATION}`,
  ).toBeGreaterThan(0)
  expect(
    agents.endsWith(claudeBody),
    `AGENTS.md와 CLAUDE.md의 본문이 다릅니다. ${REMEDIATION}`,
  ).toBe(true)

  const agentsHeader = agents.slice(0, agents.length - claudeBody.length)
  const headerLines = agentsHeader.split('\n')
  const noticeLines = headerLines.slice(2, -1)

  expect(
    headerLines[0],
    `AGENTS.md 제목이 CLAUDE.md 제목과 다릅니다. ${REMEDIATION}`,
  ).toBe(claudeTitle)
  expect(
    headerLines[1],
    `AGENTS.md 제목과 사본 고지 사이의 빈 줄이 없습니다. ${REMEDIATION}`,
  ).toBe('')
  expect(
    headerLines.at(-1),
    `AGENTS.md 사본 고지와 본문 사이의 빈 줄이 없습니다. ${REMEDIATION}`,
  ).toBe('')
  expect(
    noticeLines.length,
    `AGENTS.md에 사본 고지가 없습니다. ${REMEDIATION}`,
  ).toBeGreaterThan(0)
  expect(
    noticeLines.every((line) => line.startsWith('> ')),
    `AGENTS.md 사본 고지가 Markdown 인용문 규약을 따르지 않습니다. ${REMEDIATION}`,
  ).toBe(true)
  expect(
    noticeLines.join('\n'),
    `AGENTS.md 사본 고지가 CLAUDE.md를 가리키지 않습니다. ${REMEDIATION}`,
  ).toContain('`CLAUDE.md`')
  expect(
    noticeLines.join('\n'),
    `AGENTS.md 헤더가 사본임을 고지하지 않습니다. ${REMEDIATION}`,
  ).toContain('사본')
})
