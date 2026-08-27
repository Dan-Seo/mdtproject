import { describe, expect, it } from 'vitest'

import type { ColumnSection, GirderSection } from '@/domain/model/member'
import {
  beamDepthAbove,
  columnEnds,
  findSection,
  girderRun,
  type Project,
} from '@/domain/model/project'
import type { Rebar } from '@/domain/model/rebar'
import { aggregateQuantity } from '@/domain/quantity'
import { createStressProject } from '@/domain/model/stress-project'
import { generateColumnRebar } from '@/domain/rebar/column'
import { generateGirderRebar } from '@/domain/rebar/girder'
import { jpMlitRulePack } from '@/rulepack'

import { buildingLayout } from '@/lib/viewer/building'

/**
 * useTakeoff.ts의 buildTakeoff와 같은 부재 순회다. 부하 시험 픽스처는 항상
 * 성립하는 균일 형상이므로 미성립 부재(MemberUnsupportedError) 처리는 생략한다 —
 * 여기서 던져지면 픽스처 자체가 잘못됐다는 신호이므로 테스트가 그대로 실패해야 한다.
 */
function generateAllRebar(project: Project): Rebar[] {
  const rebars: Rebar[] = []
  const processedGirderMemberIds = new Set<string>()

  for (const member of project.members) {
    if (member.kind === '大梁' && processedGirderMemberIds.has(member.id)) {
      continue
    }

    const section = findSection(project, member.sectionId)
    const story = project.stories.find(({ id }) => id === member.storyId)
    if (!story) throw new Error(`Story not found: ${member.storyId}`)

    if (member.kind === '柱') {
      rebars.push(
        ...generateColumnRebar(
          {
            member,
            section: section as ColumnSection,
            story,
            beamDepthAbove: beamDepthAbove(project, member),
            ends: columnEnds(project, member),
          },
          jpMlitRulePack,
        ),
      )
      continue
    }

    const run = girderRun(project, member)
    for (const runMember of run.members) {
      processedGirderMemberIds.add(runMember.id)
    }
    rebars.push(
      ...generateGirderRebar(
        { run, section: section as GirderSection },
        jpMlitRulePack,
      ),
    )
  }

  return rebars
}

describe('createStressProject at building-view scale (R4)', () => {
  it('reaches on the order of 10,000 rebar instances in one story', () => {
    const project = createStressProject({
      xSpanCount: 4,
      ySpanCount: 3,
      storyCount: 1,
    })

    const rebars = generateAllRebar(project)
    const layout = buildingLayout(project, rebars, new Set())

    // R4: "층당 철근 1만 개 규모". InstancedMesh.setMatrixAt 호출 수와 직결되는
    // 실제 렌더 인스턴스 수(RebarInstance)를 기준으로 삼는다 — 정확히 10,000일
    // 필요는 없고, 그동안 미측정이던 자릿수(수천~수만)에 실제로 들어오는지가 목적이다.
    console.log(`building-view rebar instances (1 story): ${layout.rebar.length}`)
    expect(layout.rebar.length).toBeGreaterThanOrEqual(8000)
    // ADR-040: 닫힌 帯筋이 4세그먼트에서 6세그먼트가 되어, 같은 스트레스
    // 입력의 층당 렌더 인스턴스가 13,557까지 늘었다. 이는 성능 예산 완화가
    // 아니라 의도한 135°フック 余長 형상을 새 대역에 반영한 것이다.
    expect(layout.rebar.length).toBeLessThanOrEqual(16000)
  })

  // dev-browser로 측정한 실제 편집→재렌더 지연(약 120~190ms)이 rebuildScene의
  // 동기 실행시간(약 7~9ms)보다 훨씬 크다는 게 나왔다 — buildTakeoff가 project를
  // 통째로(멤버 단위 캐시 없이) 다시 도는 게 그 격차의 원인인지 여기서 분리해서 잰다.
  it('profiles buildTakeoff-equivalent recomputation cost at stress scale', () => {
    const project = createStressProject({
      xSpanCount: 4,
      ySpanCount: 3,
      storyCount: 1,
    })

    const time = (label: string, fn: () => void, iterations = 5): number[] => {
      const samples: number[] = []
      for (let i = 0; i < iterations; i += 1) {
        const start = performance.now()
        fn()
        samples.push(performance.now() - start)
      }
      samples.sort((left, right) => left - right)
      console.log(
        `${label}: median=${samples[Math.floor(iterations / 2)].toFixed(2)}ms ` +
          `min=${samples[0].toFixed(2)}ms max=${samples[iterations - 1].toFixed(2)}ms`,
      )
      return samples
    }

    let rebars: Rebar[] = []
    const rebarSamples = time('generateAllRebar', () => {
      rebars = generateAllRebar(project)
    })
    console.log(`rebar entity count: ${rebars.length}`)

    const quantitySamples = time('aggregateQuantity', () => {
      aggregateQuantity(project, rebars, jpMlitRulePack)
    })

    const layoutSamples = time('buildingLayout', () => {
      buildingLayout(project, rebars, new Set())
    })

    // 정말 무너진 게 아닌지만 잡는 느슨한 상한이다 — 정확한 수치는 콘솔 로그를 본다.
    expect(Math.max(...rebarSamples)).toBeLessThan(2000)
    expect(Math.max(...quantitySamples)).toBeLessThan(2000)
    expect(Math.max(...layoutSamples)).toBeLessThan(2000)
  })
})
