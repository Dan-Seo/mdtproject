'use client'

import { create } from 'zustand'

import { createSampleProject } from '@/domain/model/sample-project'
import {
  memberGroupKey,
  type Project,
} from '@/domain/model/project'

export interface Selection {
  group: string | null
  memberId: string | null
}

export type Locale = 'ja' | 'ko'

/** 3D 페인의 페인-로컬 탭 (DESIGN.md §7): 部材 = 선택 부재 1개, 建物 = 전 부재 */
export type ViewerMode = 'member' | 'building'

export type ViewerLayer = 'main' | 'hoop' | 'concrete'

export interface AppState {
  project: Project
  sel: Selection
  hoverRowId: string | null
  locale: Locale
  activeStoryId: string
  viewerMode: ViewerMode
  viewerLayers: Record<ViewerLayer, boolean>
  selectMember(memberId: string): void
  selectGroup(groupId: string, memberId: string): void
  setHoverRow(rowId: string | null): void
  setLocale(locale: Locale): void
  setActiveStory(storyId: string): void
  setViewerMode(mode: ViewerMode): void
  toggleViewerLayer(layer: ViewerLayer): void
  updateProject(updater: (project: Project) => Project): void
}

function findMember(project: Project, memberId: string) {
  const member = project.members.find(({ id }) => id === memberId)

  if (!member) {
    throw new Error(`Member not found: ${memberId}`)
  }

  return member
}

const initialProject = createSampleProject()

/**
 * 첫 화면에서 3D 페인이 비어 있지 않도록 대표 柱를 미리 선택한다 (docs/UX.md §4.1).
 */
function initialSelection(project: Project): Selection {
  const member = project.members.find(({ kind }) => kind === '柱')
  if (!member) return { group: null, memberId: null }

  return { group: memberGroupKey(project, member), memberId: member.id }
}

const initialSel = initialSelection(initialProject)

export const useAppStore = create<AppState>((set) => ({
  project: initialProject,
  sel: initialSel,
  hoverRowId: null,
  locale: 'ja',
  activeStoryId:
    initialProject.members.find(({ id }) => id === initialSel.memberId)
      ?.storyId ?? initialProject.stories[0].id,
  viewerMode: 'member',
  viewerLayers: { main: true, hoop: true, concrete: true },
  selectMember(memberId) {
    set(({ project }) => {
      const member = findMember(project, memberId)
      return {
        sel: {
          group: memberGroupKey(project, member),
          memberId: member.id,
        },
        activeStoryId: member.storyId,
      }
    })
  },
  selectGroup(groupId, memberId) {
    set(({ project }) => {
      const member = findMember(project, memberId)
      return {
        sel: { group: groupId, memberId: member.id },
        activeStoryId: member.storyId,
      }
    })
  },
  setHoverRow(rowId) {
    set({ hoverRowId: rowId })
  },
  setLocale(locale) {
    set({ locale })
  },
  setActiveStory(storyId) {
    set({ activeStoryId: storyId })
  },
  setViewerMode(mode) {
    set({ viewerMode: mode })
  },
  toggleViewerLayer(layer) {
    set(({ viewerLayers }) => ({
      viewerLayers: {
        ...viewerLayers,
        [layer]: !viewerLayers[layer],
      },
    }))
  },
  updateProject(updater) {
    set(({ project }) => ({ project: updater(project) }))
  },
}))

// R4 성능 측정 하네스(dev-browser)가 스토어에 대용량 Project를 주입할 방법이
// 필요하다. 도면 데이터가 든 전체 상태라 프로덕션 빌드에는 노출하지 않는다.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  ;(window as Window & { __kijunStore?: typeof useAppStore }).__kijunStore =
    useAppStore
}
