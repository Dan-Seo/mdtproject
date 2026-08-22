/**
 * R4「層当たり鉄筋1万個規模」を実ブラウザで測るための案件 JSON を書き出す。
 * 案件は UI の「案件を読み込み」から入れる — 本番ビルドには store のフックが
 * 無いので、これが唯一の注入口だ。
 *
 *   npx tsx scripts/perf/stress-fixture.ts [階数] > stress.json
 */
import { createStressProject } from '../../src/domain/model/stress-project'
import { serializeProject } from '../../src/domain/model/project'

const storyCount = Number(process.argv[2] ?? 5)

if (!Number.isInteger(storyCount) || storyCount < 1) {
  throw new Error(`階数は1以上の整数: ${process.argv[2]}`)
}

process.stdout.write(
  serializeProject(
    createStressProject({ xSpanCount: 4, ySpanCount: 3, storyCount }),
  ),
)
