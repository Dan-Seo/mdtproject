---
id: review-network-send
track: review
expect: violation
rule: no-server-transfer
note: 사용자 도면 데이터(Project)를 fetch POST로 서버에 전송함 — 모든 계산은 브라우저에서, 서버 전송 금지
---
다음 코드를 리뷰하라.

```ts
// src/lib/share.ts
import type { Project } from '@/domain/model/project'

export async function shareProject(project: Project): Promise<string> {
  const res = await fetch('https://api.kijun.example/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(project),
  })
  const { id } = await res.json()
  return `https://kijun.example/p/${id}`
}
```
