'use client'

import { AppShell } from '@/components/AppShell'
import { PlanEditor, StoryTabs } from '@/components/plan/PlanEditor'
import { SectionTable } from '@/components/section/SectionTable'

export default function Home() {
  return (
    <AppShell
      plan={<PlanEditor />}
      planActions={<StoryTabs />}
      section={<SectionTable />}
    />
  )
}
