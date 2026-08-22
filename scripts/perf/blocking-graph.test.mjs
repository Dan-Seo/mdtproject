import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { checkBlockingGraph } from './blocking-graph.mjs'

// この門は ci.yml・review.yml の両方で merge を止める。止める側の枝
// (何も検めないまま通す枝) が一度も走らないままだと、門は在るのに効かない。
// 兄弟の budget-report.test.mjs と同じく npm run test:ci-scripts に載せる。

const THREE_WITH_MARKER = 'class InstancedMesh extends Mesh {}'

function tree({ three = THREE_WITH_MARKER, manifest = null, chunks = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'blocking-graph-'))

  if (three !== null) {
    mkdirSync(join(root, 'node_modules', 'three', 'build'), { recursive: true })
    writeFileSync(
      join(root, 'node_modules', 'three', 'package.json'),
      JSON.stringify({ exports: { '.': { import: './build/three.module.js' } } }),
    )
    writeFileSync(
      join(root, 'node_modules', 'three', 'build', 'three.module.js'),
      three,
    )
  }

  if (manifest !== null) {
    mkdirSync(join(root, '.next'), { recursive: true })
    writeFileSync(
      join(root, '.next', 'app-build-manifest.json'),
      JSON.stringify(manifest),
    )
  }

  for (const [name, source] of Object.entries(chunks)) {
    const file = join(root, '.next', name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }

  return root
}

const PAGE_MANIFEST = { pages: { '/page': ['static/chunks/page.js'] } }

test('three が居なければ通さない', () => {
  const result = checkBlockingGraph(tree({ three: null, manifest: PAGE_MANIFEST }))

  assert.equal(result.ok, false)
  assert.match(result.message, /three/)
})

test('目印が three から消えたら通さない', () => {
  // 版が上がって識別子が消えれば、正規表現は何にも当たらないまま ok を名乗る。
  const root = tree({
    three: 'class Nothing {}',
    manifest: PAGE_MANIFEST,
    chunks: { 'static/chunks/page.js': 'harmless' },
  })
  const result = checkBlockingGraph(root)

  assert.equal(result.ok, false)
  assert.match(result.message, /THREE_MARKERS/)
})

test('manifest が無ければ通さない', () => {
  const result = checkBlockingGraph(tree({ manifest: null }))

  assert.equal(result.ok, false)
  assert.match(result.message, /app-build-manifest/)
})

test('manifest に /page が無ければ通さない', () => {
  const result = checkBlockingGraph(tree({ manifest: { pages: {} } }))

  assert.equal(result.ok, false)
  assert.match(result.message, /page/)
})

test('chunk を .next/ で解決できなければ通さない', () => {
  // 経路が `.next/` 基準でなくなると全部が黙って飛ばされ、offenders は 0 になる。
  const result = checkBlockingGraph(tree({ manifest: PAGE_MANIFEST }))

  assert.equal(result.ok, false)
  assert.match(result.message, /page\.js/)
})

test('遮断経路に three が入っていれば落とす', () => {
  const root = tree({
    manifest: PAGE_MANIFEST,
    chunks: { 'static/chunks/page.js': 'new WebGLRenderer()' },
  })
  const result = checkBlockingGraph(root)

  assert.equal(result.ok, false)
  assert.match(result.message, /ADR-024/)
})

test('three が居なければ通す', () => {
  const root = tree({
    manifest: PAGE_MANIFEST,
    chunks: { 'static/chunks/page.js': 'export const a = 1' },
  })
  const result = checkBlockingGraph(root)

  assert.equal(result.ok, true)
  assert.match(result.message, /ok:/)
})
