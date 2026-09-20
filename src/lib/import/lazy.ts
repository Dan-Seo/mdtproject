/**
 * 図面取入の解析器を**読み込み時ではなく選択時に**取りに行くための境界。
 *
 * 初期画面にあるのは開く釦とファイル入力だけで、解析器はそのどちらにも要らない。
 * ここで `import()` に挟むと初期ロードの転送バイトから丸ごと外れる（断面リストの
 * 解析器は図面セットの面の役割判定からも参照されるので、両方をここに通さないと
 * 片方の経路で戻ってくる）。
 *
 * 一度受け取った版はここに残す — 二度目の選択で待たせないため。`peek*` はその
 * 控えを描画中に同期で覗く。まだ無ければ `null` で、呼び手は候補なしとして描く。
 * 承認の規約は変わらない — 候補が無い間は案件に触れない。
 */

export type SectionListParser = typeof import('./section-list/parse')

export interface FramingModules {
  parse: typeof import('./framing-plan/parse')
  elevation: typeof import('./framing-plan/elevation')
  apply: typeof import('./framing-plan/apply')
}

export interface DrawingSetModules {
  reconcile: typeof import('./drawing-set/reconcile')
  plan: typeof import('./drawing-set/plan')
  apply: typeof import('./drawing-set/apply')
}

let sectionListParser: SectionListParser | null = null
let sectionListPending: Promise<SectionListParser> | null = null

export function peekSectionListParser(): SectionListParser | null {
  return sectionListParser
}

export function loadSectionListParser(): Promise<SectionListParser> {
  sectionListPending ??= import('./section-list/parse').then((module) => {
    sectionListParser = module
    return module
  })
  return sectionListPending
}

let framingModules: FramingModules | null = null
let framingPending: Promise<FramingModules> | null = null

export function peekFramingModules(): FramingModules | null {
  return framingModules
}

export function loadFramingModules(): Promise<FramingModules> {
  framingPending ??= Promise.all([
    import('./framing-plan/parse'),
    import('./framing-plan/elevation'),
    import('./framing-plan/apply'),
  ]).then(([parse, elevation, apply]) => {
    framingModules = { parse, elevation, apply }
    return framingModules
  })
  return framingPending
}

let drawingSetModules: DrawingSetModules | null = null
let drawingSetPending: Promise<DrawingSetModules> | null = null

export function peekDrawingSetModules(): DrawingSetModules | null {
  return drawingSetModules
}

export function loadDrawingSetModules(): Promise<DrawingSetModules> {
  drawingSetPending ??= Promise.all([
    import('./drawing-set/reconcile'),
    import('./drawing-set/plan'),
    import('./drawing-set/apply'),
  ]).then(([reconcile, plan, apply]) => {
    drawingSetModules = { reconcile, plan, apply }
    return drawingSetModules
  })
  return drawingSetPending
}
