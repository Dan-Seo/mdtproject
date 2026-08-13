'use client'

import { AppShell } from '@/components/AppShell'
import { PlanEditor, StoryTabs } from '@/components/plan/PlanEditor'
import {
  TakeoffActions,
  TakeoffPane,
} from '@/components/quantity/TakeoffPane'
import { SectionTable } from '@/components/section/SectionTable'
import { SectionImport } from '@/components/section/SectionImport'
import { Viewer3D } from '@/components/viewer/Viewer3D'
import { ViewerTabs } from '@/components/viewer/ViewerTabs'

export default function Home() {
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
