'use client'

import dynamic from 'next/dynamic'

import { AppShell } from '@/components/AppShell'
import { PlanEditor, StoryTabs } from '@/components/plan/PlanEditor'
import {
  TakeoffActions,
  TakeoffPane,
} from '@/components/quantity/TakeoffPane'
import { SectionTable } from '@/components/section/SectionTable'
import { SectionImport } from '@/components/section/SectionImport'
import { ViewerTabs } from '@/components/viewer/ViewerTabs'
import { useProjectPersistence } from '@/lib/hooks/useProjectPersistence'

// three.js가 초기 블로킹 JS의 절반 이상이다. 청크를 갈라 하이드레이션 경로에서 뺀다.
// ssr은 기본값(true)을 유지한다 — false로 두면 프리렌더 마크업에서 뷰어 페인이
// 통째로 빠져 화면에 보이는 것이 달라진다. import는 마운트 시점에 곧바로 걸린다.
const Viewer3D = dynamic(() =>
  import('@/components/viewer/Viewer3D').then((module) => module.Viewer3D),
)

export default function Home() {
  // 前回の案件を戻し、以後の編集を自動保存する (docs/UX.md §4 段階5)。
  // 復元中も画面はサンプル案件で動く — 待たせない (§4.2)。
  useProjectPersistence()

  return (
    <AppShell
      plan={<PlanEditor />}
      planActions={<StoryTabs />}
      section={<SectionTable />}
      sectionActions={<SectionImport />}
      viewer={<Viewer3D />}
      viewerActions={<ViewerTabs />}
      takeoff={<TakeoffPane />}
      takeoffActions={<TakeoffActions />}
    />
  )
}
