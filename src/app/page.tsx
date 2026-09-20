'use client'

import dynamic from 'next/dynamic'

import { AppShell } from '@/components/AppShell'
import { PlanEditor, StoryTabs } from '@/components/plan/PlanEditor'
import {
  TakeoffActions,
  TakeoffPane,
} from '@/components/quantity/TakeoffPane'
import { SectionTable } from '@/components/section/SectionTable'
import { LazyPlanImport } from '@/components/plan/LazyPlanImport'
import { LazyStbImport } from '@/components/stb/LazyStbImport'
import { LazySectionImport } from '@/components/section/LazySectionImport'
import { ViewerExportButton } from '@/components/viewer/ViewerExportButton'
import { ViewerTabs } from '@/components/viewer/ViewerTabs'
import { ReviewTabs } from '@/components/review/ReviewTabs'
import { useProjectPersistence } from '@/lib/hooks/useProjectPersistence'
import { useAppStore } from '@/lib/store'

// three.js가 초기 블로킹 JS의 절반 이상이다. 청크를 갈라 하이드레이션 경로에서 뺀다.
// ssr은 기본값(true)을 유지한다 — false로 두면 프리렌더 마크업에서 뷰어 페인이
// 통째로 빠져 화면에 보이는 것이 달라진다. import는 마운트 시점에 곧바로 걸린다.
const Viewer3D = dynamic(() =>
  import('@/components/viewer/Viewer3D').then((module) => module.Viewer3D),
)

// 検討·作業 페인은 초기 표시가 아니다 — 既定 탭은 内訳書이고, 이 둘은 사용자가
// 탭을 누른 뒤에야 마운트된다. 그래서 청크를 가르면 초기 로드에서 통째로 빠진다
// (domain/review·lib/review 가 여기로 따라간다). 마운트 시점에 곧바로 받는
// 지연 로드와 달리, 이쪽은 조작이 있어야 받으므로 전송 바이트가 실제로 줄어든다.
const ReviewPane = dynamic(() =>
  import('@/components/review/ReviewPane').then((module) => module.ReviewPane),
)
const WorkPackageBoard = dynamic(() =>
  import('@/components/review/WorkPackageBoard').then((module) => module.WorkPackageBoard),
)

export default function Home() {
  // 前回の案件を戻し、以後の編集を自動保存する (docs/UX.md §4 段階5)。
  // 復元中も画面はサンプル案件で動く — 待たせない (§4.2)。
  useProjectPersistence()
  const takeoffTab = useAppStore(({ takeoffTab }) => takeoffTab)

  return (
    <AppShell
      plan={<PlanEditor />}
      planActions={
        <>
          <StoryTabs />
          <LazyPlanImport />
          <LazyStbImport />
        </>
      }
      section={<SectionTable />}
      sectionActions={<LazySectionImport />}
      viewer={<Viewer3D />}
      viewerActions={
        <>
          <ViewerTabs />
          <ViewerExportButton />
        </>
      }
      takeoff={
        takeoffTab === '内訳書' ? <TakeoffPane /> : takeoffTab === '検討' ? <ReviewPane /> : (
          <WorkPackageBoard />
        )
      }
      takeoffActions={<><ReviewTabs /><TakeoffActions /></>}
    />
  )
}
