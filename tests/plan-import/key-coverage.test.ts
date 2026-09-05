import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

type ClaimedPath = {
  path: string
  test: string
}

type ReferenceOnlyPath = {
  path: string
  reason: string
}

const GOLDEN_DIR = resolve(
  process.cwd(),
  'tests/fixtures/plan-import/expected',
)

/**
 * 골든의 값 필드와 이를 실제로 대조하는 테스트를 함께 선언한다.
 * 배열 원소는 인덱스가 아니라 `[]`로 표기한다.
 */
const CLAIMED: readonly ClaimedPath[] = [
  {
    path: 'blocks[].x.labels[]',
    test: 'tests/plan-import/corpus2.test.ts > 2차 7면 伏図 격자 골든',
  },
  {
    path: 'blocks[].x.spansMm[]',
    test: 'tests/plan-import/corpus2.test.ts > 2차 7면 伏図 격자 골든',
  },
  {
    path: 'blocks[].x.totalMm',
    test: 'tests/plan-import/corpus2.test.ts > 2차 7면 伏図 격자 골든',
  },
  {
    path: 'blocks[].y.labels[]',
    test: 'tests/plan-import/corpus2.test.ts > 2차 7면 伏図 격자 골든',
  },
  {
    path: 'blocks[].y.spansMm[]',
    test: 'tests/plan-import/corpus2.test.ts > 2차 7면 伏図 격자 골든',
  },
  {
    path: 'blocks[].y.totalMm',
    test: 'tests/plan-import/corpus2.test.ts > 2차 7면 伏図 격자 골든',
  },
  {
    path: 'elevations[].axis.labels[]',
    test: 'tests/plan-import/corpus2-elevation.test.ts > axis 골든 상호검증',
  },
  {
    path: 'elevations[].axis.spansMm[]',
    test: 'tests/plan-import/corpus2-elevation.test.ts > axis 골든 상호검증',
  },
  {
    path: 'elevations[].axis.totalMm',
    test: 'tests/plan-import/corpus2-elevation.test.ts > axis 골든 상호검증',
  },
  {
    path: 'elevations[].heightsBottomMm[]',
    test: 'tests/plan-import/corpus2-elevation.test.ts > levelsBottom·heightsBottomMm 꼬리 대조',
  },
  {
    path: 'elevations[].heightsMm[]',
    test: 'tests/plan-import/corpus2-elevation.test.ts > 階高 corpus 2 골든',
  },
  {
    path: 'elevations[].levelsBottom[]',
    test: 'tests/plan-import/corpus2-elevation.test.ts > levelsBottom·heightsBottomMm 꼬리 대조',
  },
  {
    path: 'elevations[].levels[]',
    test: 'tests/plan-import/corpus2-elevation.test.ts > 階高 corpus 2 골든',
  },
  {
    path: 'elevations[].title',
    test: 'tests/plan-import/corpus2-elevation.test.ts > 階高 corpus 2 골든',
  },
  {
    path: 'elevations[].titles[]',
    test: 'tests/plan-import/corpus2-elevation.test.ts > 階高 corpus 2 골든',
  },
  {
    path: 'heightsMm[]',
    test: 'tests/plan-import/corpus2-elevation.test.ts > 階高 corpus 2 골든',
  },
  {
    path: 'levelTexts[]',
    test: 'tests/plan-import/corpus2-elevation.test.ts > 階高 corpus 2 골든',
  },
]

const REFERENCE_ONLY: readonly ReferenceOnlyPath[] = [
  {
    path: '$comment',
    reason: '독립 전사 방법과 변경 경위를 설명하는 주석이다.',
  },
  {
    path: 'blocks[].notes[]',
    reason: '블록별 판독 주석이며 파서 값의 기대값이 아니다.',
  },
  {
    path: 'blocks[].title',
    reason:
      '7개 grid 골든의 8개 title 중 도면 문자열 5건(예: 屋根伏図)과 전사자 주석 3건(예: 伏図(공통))이 섞여 있어 균일한 기대값으로 전체 대조할 수 없는 블록 설명 메타데이터다.',
  },
  {
    path: 'elevations[].levelsBottomNote',
    reason: '부분 전사 꼬리의 경위를 설명하는 주석이다.',
  },
  {
    path: 'elevations[].note',
    reason: '특정 계열의 원문 대조 메모이며 산출 기대값이 아니다.',
  },
  {
    path: 'levelNote',
    reason: '페이지 전체 레벨 전사의 주석이다.',
  },
  {
    path: 'notes[]',
    reason: '도면 판독 한계와 범위를 설명하는 주석이다.',
  },
  {
    path: 'source.cacheFile',
    reason: '원본 캐시 파일 식별자이며 파서 출력값이 아니다.',
  },
  {
    path: 'source.issuer',
    reason: '도면 발주처 메타데이터다.',
  },
  {
    path: 'source.page',
    reason: '원본 도면의 쪽 메타데이터다.',
  },
  {
    path: 'source.project',
    reason: '원본 프로젝트명 메타데이터다.',
  },
  {
    path: 'source.sha256',
    reason: '원본 무결성 확인용 해시다.',
  },
  {
    path: 'source.sheet',
    reason: '원본 도면명 메타데이터다.',
  },
  {
    path: 'source.transcribedAt',
    reason: '독립 전사 일자 메타데이터다.',
  },
]

function addValuePath(
  paths: Map<string, Set<string>>,
  valuePath: string,
  file: string,
): void {
  const files = paths.get(valuePath) ?? new Set<string>()
  files.add(file)
  paths.set(valuePath, files)
}

function collectValuePaths(
  value: JsonValue,
  currentPath: string,
  file: string,
  paths: Map<string, Set<string>>,
): void {
  if (Array.isArray(value)) {
    const arrayPath = `${currentPath}[]`
    if (value.length === 0) {
      addValuePath(paths, arrayPath, file)
      return
    }

    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        collectValuePaths(item, arrayPath, file, paths)
      } else {
        addValuePath(paths, arrayPath, file)
      }
    }
    return
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = currentPath ? `${currentPath}.${key}` : key
      if (child !== null && typeof child === 'object') {
        collectValuePaths(child, childPath, file, paths)
      } else {
        addValuePath(paths, childPath, file)
      }
    }
  }
}

function goldenValuePaths(): Map<string, Set<string>> {
  const paths = new Map<string, Set<string>>()
  const files = readdirSync(GOLDEN_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort()

  for (const file of files) {
    const golden = JSON.parse(
      readFileSync(resolve(GOLDEN_DIR, file), 'utf8'),
    ) as JsonValue
    collectValuePaths(golden, '', file, paths)
  }

  return paths
}

function listedPaths(entries: ReadonlyArray<{ path: string }>): Set<string> {
  return new Set(entries.map((entry) => entry.path))
}

describe('plan-import 골든 값 키 커버리지', () => {
  it('골든의 모든 값 경로가 대조 또는 명시적 참고 전용으로 등록된다', () => {
    const actual = goldenValuePaths()
    const claimed = listedPaths(CLAIMED)
    const referenceOnly = listedPaths(REFERENCE_ONLY)
    const covered = new Set([...claimed, ...referenceOnly])

    const unclaimed = [...actual.entries()]
      .filter(([path]) => !covered.has(path))
      .map(([path, files]) => ({ path, files: [...files].sort() }))
    expect(
      unclaimed,
      [
        'unclaimed value paths: make an explicit claim or report the field as blocked',
        ...unclaimed.map(({ path, files }) => `${path}: ${files.join(', ')}`),
      ].join('\n'),
    ).toEqual([])
  })

  it('등록한 경로는 실제 골든에 존재하고 두 목록이 겹치지 않는다', () => {
    const actual = goldenValuePaths()
    const claimed = listedPaths(CLAIMED)
    const referenceOnly = listedPaths(REFERENCE_ONLY)
    const stale = [...new Set([...claimed, ...referenceOnly])]
      .filter((path) => !actual.has(path))
      .sort()

    expect(
      stale,
      'CLAIMED/REFERENCE_ONLY contains a path absent from the golden',
    ).toEqual([])
    expect(
      new Set([...claimed].filter((path) => referenceOnly.has(path))),
      'a path cannot be both CLAIMED and REFERENCE_ONLY',
    ).toEqual(new Set())
  })
})

export { CLAIMED, REFERENCE_ONLY }
