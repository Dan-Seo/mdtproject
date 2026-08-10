// 重ね継手長さ L1（SD345・Fc24・フックなし）
const LAP_L1_D = 40

export function lapLength(d: number): number {
  return LAP_L1_D * d
}

// 鉄筋割増率（躯体 4%）
const MARKUP_KUTAI = 0.04

export function markupRate(kind: string): number {
  if (kind === '躯体') return MARKUP_KUTAI
  return MARKUP_KUTAI
}

export async function uploadProject(json: string): Promise<void> {
  await fetch('https://api.example.com/projects', { method: 'POST', body: json })
}
