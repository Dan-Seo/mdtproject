export type StbEncoding = 'utf-8' | 'shift_jis'

// ST-Bridge 취입 각 단계가 내는 사유 코드는 이 목록으로만 표현한다.
export const STB_ISSUES = [
  '対応外バージョン',
  '未対応エンコーディング',
  'XML解析不能',
  'ST-Bridge形式でない',
  '非直交通り芯',
  '未対応通り芯種別',
  '通り芯グループ数不一致',
  '通り芯方向不明',
  '通り芯距離解釈不能',
  '通り芯位置重複',
  '通り芯ラベル欠落',
  '通り芯未検出',
  '通り芯位置と節点の不一致',
  '階レベル解釈不能',
  '階レベル重複',
  '地下レベル未対応',
  '対応外の階種別',
  '階不足',
] as const

export type StbIssue = (typeof STB_ISSUES)[number]

export interface StbAxisRaw {
  id?: string
  name?: string
  distance?: string
  nodeIds: string[]
}

export interface StbAxisGroupRaw {
  groupName?: string
  angle?: string
  originX?: string
  originY?: string
  axes: StbAxisRaw[]
}

export interface StbStoryRaw {
  id?: string
  name?: string
  height?: string
  kind?: string
}

export interface StbNodeRaw {
  id?: string
  x?: string
  y?: string
  z?: string
  kind?: string
}

export interface StbDocument {
  version: string
  projectName?: string
  encoding: StbEncoding
  axisGroups: StbAxisGroupRaw[]
  stories: StbStoryRaw[]
  nodes: StbNodeRaw[]
  unsupportedAxisKinds: { name: string; count: number }[]
  unreadElements: { name: string; count: number }[]
  issues: StbIssue[]
}
