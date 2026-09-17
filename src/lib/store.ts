'use client'

import { create } from 'zustand'

import { createSampleProject } from '@/domain/model/sample-project'
import {
  memberGroupKey,
  type Project,
} from '@/domain/model/project'
import { emptyReviewState } from '@/domain/review/state'
import type {
  ClipState,
  ReviewState,
  ViewerPose,
} from '@/domain/review/types'
import type { Point3, Segment } from '@/lib/viewer/geometry'

export interface Selection {
  group: string | null
  memberId: string | null
}

export type Locale = 'ja' | 'ko'

/** 3D 페인의 페인-로컬 탭 (DESIGN.md §7): 部材 = 선택 부재 1개, 建物 = 전 부재 */
export type ViewerMode = 'member' | 'building' | 'joint'

export type ViewerLayer = 'main' | 'hoop' | 'concrete'

export interface AppState {
  project: Project
  review: ReviewState
  sel: Selection
  hoverRowId: string | null
  locale: Locale
  activeStoryId: string
  viewerMode: ViewerMode
  viewerLayers: Record<ViewerLayer, boolean>
  viewerClip: ClipState
  viewerPose: ViewerPose | null
  requestedViewerPose: ViewerPose | null
  reviewFocus: {
    point: Point3
    segments: [Segment, Segment]
    label: string
  } | null
  takeoffTab: '内訳書' | '検討' | '作業'
  selectMember(memberId: string): void
  selectGroup(groupId: string, memberId: string): void
  setHoverRow(rowId: string | null): void
  setLocale(locale: Locale): void
  setActiveStory(storyId: string): void
  setViewerMode(mode: ViewerMode): void
  toggleViewerLayer(layer: ViewerLayer): void
  setViewerClip(clip: ClipState): void
  setViewerPose(pose: ViewerPose | null): void
  requestViewerPose(pose: ViewerPose | null): void
  setReviewFocus(focus: AppState['reviewFocus']): void
  setTakeoffTab(tab: AppState['takeoffTab']): void
  updateProject(updater: (project: Project) => Project): void
  setReview(updater: (review: ReviewState) => ReviewState): void
  loadProject(project: Project, review?: ReviewState): void
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

/** 選択が指す部材の階。指す部材が無ければ最初の階に戻す。 */
function storyOf(project: Project, selection: Selection): string {
  return (
    project.members.find(({ id }) => id === selection.memberId)?.storyId ??
    project.stories[0].id
  )
}

export const useAppStore = create<AppState>((set) => ({
  project: initialProject,
  review: emptyReviewState(),
  sel: initialSel,
  hoverRowId: null,
  locale: 'ja',
  activeStoryId: storyOf(initialProject, initialSel),
  viewerMode: 'member',
  viewerLayers: { main: true, hoop: true, concrete: true },
  viewerClip: { enabled: false, axis: 'x', ratio: 0.5 },
  viewerPose: null,
  requestedViewerPose: null,
  reviewFocus: null,
  takeoffTab: '内訳書',
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
  setViewerClip(clip) {
    set({ viewerClip: clip })
  },
  setViewerPose(pose) {
    set({ viewerPose: pose })
  },
  requestViewerPose(pose) {
    set({ requestedViewerPose: pose })
  },
  setReviewFocus(focus) {
    set({ reviewFocus: focus })
  },
  setTakeoffTab(tab) {
    set({ takeoffTab: tab })
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
  setReview(updater) {
    set(({ review }) => ({ review: updater(review) }))
  },
  /**
   * 案件まるごとの差し替え（自動保存からの復元・JSON 取り込み）。
   * updateProject と違って選択を持ち越せない — 取り込んだ案件に前の案件の
   * 部材 id は無く、3ペインが存在しない部材を指したままになる。
   */
  loadProject(project, review) {
    const sel = initialSelection(project)

    set(({ viewerMode }) => ({
      project,
      review: review ?? emptyReviewState(),
      sel,
      hoverRowId: null,
      activeStoryId: storyOf(project, sel),
      viewerMode: viewerMode === 'joint' ? 'member' : viewerMode,
      requestedViewerPose: null,
      reviewFocus: null,
    }))
  },
}))

// R4 성능 측정 하네스(dev-browser)가 스토어에 대용량 Project를 주입할 방법이
// 필요하다. 도면 데이터가 든 전체 상태라 프로덕션 빌드에는 노출하지 않는다.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  ;(window as Window & { __kijunStore?: typeof useAppStore }).__kijunStore =
    useAppStore
}
