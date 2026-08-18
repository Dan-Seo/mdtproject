import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'

import { parseSectionLists } from '@/lib/import/section-list/parse'
import type { TextPage } from '@/lib/import/section-list/types'
import { toTextItems } from '@/lib/import/textitems'

/**
 * 로컬 전용 통합 테스트 — 검증 도면 PDF는 커밋하지 않으므로 CI에서는 통째로
 * 건너뛴다(`.cache/`가 비어 있다). 그래도 여기 있어야 하는 이유가 있다:
 * 커밋된 TextItem 픽스처는 개인정보(관리건축사 실명·연락처) 때문에 **표제란을 떼고**
 * 만들어진다. 그래서 표제란의 図面名称(「梁リスト」)이 리스트 타이틀로 오인되는
 * 실패를 픽스처 계층은 원리상 볼 수 없다 — 실물에서는 ojkk p3의 2F 블록 7칸이
 * 조용히 사라졌다(issue #33). 그 눈먼 구간을 덮는 것은 이 테스트뿐이다.
 *
 * 도면 준비: tests/fixtures/section-import/SOURCES.md의 입수처에서 받아 `.cache/`에 둔다.
 */

const cacheDirectory = resolve(process.cwd(), '.cache')

interface RealPage {
  cacheFile: string
  page: number
  fixture: string
  /** 그 페이지에서 읽히는 리스트와 칸 수 — 표가 중간에서 잘리면 줄어든다 */
  lists: Array<[string, number]>
}

const pages: RealPage[] = [
  {
    cacheFile: 'dwg-ojkk-zumen6.pdf',
    page: 2,
    fixture: 'ojkk-p2.json',
    lists: [['柱リスト', 19]],
  },
  {
    // 32는 눈으로 전사한 expected/ojkk-akamichi-p3-girders.json의 칸 수다
    cacheFile: 'dwg-ojkk-zumen6.pdf',
    page: 3,
    fixture: 'ojkk-p3.json',
    lists: [['大梁リスト', 32]],
  },
  {
    cacheFile: 'dwg-yokohama.pdf',
    page: 13,
    fixture: 'yokohama-p13.json',
    lists: [
      ['柱断面リスト', 15],
      ['小梁断面リスト', 13],
    ],
  },
  {
    cacheFile: 'dwg-yokohama.pdf',
    page: 14,
    fixture: 'yokohama-p14.json',
    lists: [['大梁断面リスト', 16]],
  },
  {
    cacheFile: 'dwg-kani-kids.pdf',
    page: 38,
    fixture: 'kani-p38.json',
    lists: [['地中梁リスト', 1]],
  },
]

const available = pages.filter(({ cacheFile }) =>
  existsSync(resolve(cacheDirectory, cacheFile)),
)

function expectedSha256(cacheFile: string): string {
  const sources = readFileSync(
    resolve(process.cwd(), 'tests/fixtures/section-import/SOURCES.md'),
    'utf8',
  )
  const row = sources
    .split(/\r?\n/u)
    .find((line) => line.includes(`\`${cacheFile}\``))
  const sha256 = row?.match(/`([a-f\d]{64})`/u)?.[1]

  if (!sha256) throw new Error(`SHA-256 not found in SOURCES.md: ${cacheFile}`)
  return sha256
}

async function realTextPage(cacheFile: string, page: number): Promise<TextPage> {
  const data = readFileSync(resolve(cacheDirectory, cacheFile))
  // 로컬 파일이 바뀌었는데 테스트가 통과하면 무엇을 쟀는지 알 수 없다
  expect(createHash('sha256').update(data).digest('hex')).toBe(
    expectedSha256(cacheFile),
  )

  const task = getDocument({ data: new Uint8Array(data), useWorkerFetch: false })
  const document = await task.promise

  try {
    const pdfPage = await document.getPage(page)
    try {
      const viewport = pdfPage.getViewport({ scale: 1 })
      const content = await pdfPage.getTextContent()
      return {
        widthPt: viewport.width,
        heightPt: viewport.height,
        // 좌표 변환은 프로덕션 추출기와 공유한다 (src/lib/import/pdf-text.ts)
        items: toTextItems(
          content.items.filter(
            (item): item is Extract<typeof item, { str: string }> =>
              'str' in item,
          ),
          viewport.transform,
        ),
      }
    } finally {
      pdfPage.cleanup()
    }
  } finally {
    await task.destroy()
  }
}

function fixtureTextPage(file: string): TextPage {
  const fixture = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'tests/fixtures/section-import/textitems', file),
      'utf8',
    ),
  ) as { page: { widthPt: number; heightPt: number }; items: TextPage['items'] }

  return {
    widthPt: fixture.page.widthPt,
    heightPt: fixture.page.heightPt,
    items: fixture.items,
  }
}

function summary(page: TextPage) {
  return parseSectionLists(page).map((parsed) => ({
    listKind: parsed.listKind,
    issue: parsed.issue,
    marks: parsed.candidates.map(
      ({ mark, storyLabel }) => `${mark}/${storyLabel ?? '-'}`,
    ),
    confirmed: parsed.candidates.filter(({ issues }) => issues.length === 0)
      .length,
  }))
}

describe.skipIf(available.length === 0)(
  'section-import against the unredacted drawings (local only)',
  () => {
    it.each(available)(
      '$cacheFile p$page reads the same lists as its redacted fixture',
      async (spec) => {
        // 표제란이 있고 없고로 결과가 갈리면 안 된다 — 갈리는 순간 사용자가 보는
        // 것(실물)과 CI가 보는 것(픽스처)이 다른 제품이 된다
        expect(summary(await realTextPage(spec.cacheFile, spec.page))).toEqual(
          summary(fixtureTextPage(spec.fixture)),
        )
      },
      60_000,
    )

    it.each(available)(
      '$cacheFile p$page reads every cell of every list',
      async (spec) => {
        // 위 대조는 양쪽이 함께 퇴행하면 통과한다 — 실측 칸 수를 따로 박는다.
        // 표제란이 표를 끊으면 리스트 수가 늘고 칸 수가 줄어 여기서 걸린다
        const parsed = parseSectionLists(
          await realTextPage(spec.cacheFile, spec.page),
        )

        expect(
          parsed.map(({ listKind, candidates }) => [
            listKind,
            candidates.length,
          ]),
        ).toEqual(spec.lists)
      },
      60_000,
    )
  },
)
