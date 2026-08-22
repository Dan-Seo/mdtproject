import {
  deserializeProject,
  serializeProject,
  type Project,
} from '@/domain/model/project'

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

export function downloadProjectJson(project: Project): void {
  const blob = new Blob([serializeProject(project)], {
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
export async function readProjectFile(file: File): Promise<Project> {
  return deserializeProject(await file.text())
}
