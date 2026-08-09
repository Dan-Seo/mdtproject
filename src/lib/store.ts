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

export interface AppState {
  project: Project
  sel: Selection
  hoverRowId: string | null
  locale: Locale
  activeStoryId: string
  selectMember(memberId: string): void
  selectGroup(groupId: string, memberId: string): void
  setHoverRow(rowId: string | null): void
  setLocale(locale: Locale): void
  setActiveStory(storyId: string): void
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

export const useAppStore = create<AppState>((set) => ({
  project: initialProject,
  sel: { group: null, memberId: null },
  hoverRowId: null,
  locale: 'ja',
  activeStoryId: initialProject.stories[0].id,
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
  updateProject(updater) {
    set(({ project }) => ({ project: updater(project) }))
  },
}))
