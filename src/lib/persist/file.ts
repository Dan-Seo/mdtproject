import {
  parseProject,
  serializeProject,
  type Project,
} from '@/domain/model/project'
import { emptyReviewState, parseReviewState } from '@/domain/review/state'
import type { ReviewState } from '@/domain/review/types'

/**
 * Windows・macOS がファイル名に許さない文字。案件名は自由入力なので、
 * そのまま渡すと保存に失敗するか、ブラウザが勝手に別名を付けて利用者の
 * 付けた名前が消える。
 */
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

export function projectFileName(projectName: string): string {
  const safe = projectName
    .replace(ILLEGAL_FILENAME_CHARS, '')
    // 取り除いた文字の跡が空白の連なりとして残る（「A / B」→「A  B」）。
    .replace(/\s+/g, ' ')
    .trim()

  return safe.length === 0 ? 'kijun-project.json' : `${safe}.json`
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    return (
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    )
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        deepEqual(leftRecord[key], rightRecord[key]),
    )
  )
}

export function serializeProjectFile(
  project: Project,
  review: ReviewState = emptyReviewState(),
): string {
  if (deepEqual(review, emptyReviewState())) return serializeProject(project)
  return JSON.stringify({ ...project, review })
}

export function downloadProjectJson(
  project: Project,
  review: ReviewState = emptyReviewState(),
): void {
  const blob = new Blob([serializeProjectFile(project, review)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = projectFileName(project.name)
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * 取り込みは利用者が選んだファイルで始まる。読めないものは投げる —
 * 自動保存の復元(loadStoredProject)と違って、ここには「黙って捨てる」の
 * 相手方がいる。利用者は今そのファイルを選んだのだから、駄目なら言う。
 */
export async function readProjectFile(
  file: File,
): Promise<{ project: Project; review: ReviewState }> {
  const parsed: unknown = JSON.parse(await file.text())
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Project file must be an object')
  }

  const { review: rawReview, ...projectData } = parsed as Record<
    string,
    unknown
  >
  return {
    project: parseProject(projectData),
    review: parseReviewState(rawReview),
  }
}
