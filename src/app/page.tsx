'use client'

import { AppShell } from '@/components/AppShell'
import { PlanEditor, StoryTabs } from '@/components/plan/PlanEditor'
import { TakeoffPane } from '@/components/quantity/TakeoffPane'
import { SectionTable } from '@/components/section/SectionTable'
import { Viewer3D } from '@/components/viewer/Viewer3D'

export default function Home() {
  return (
    <AppShell
      plan={<PlanEditor />}
      planActions={<StoryTabs />}
      section={<SectionTable />}
      viewer={<Viewer3D />}
      takeoff={<TakeoffPane />}
    />
  )
}
