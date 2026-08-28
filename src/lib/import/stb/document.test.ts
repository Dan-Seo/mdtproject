import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { decodeStbBytes } from './decode'
import { parseStbDocument } from './document'

const fixtureDirectory = resolve(
  process.cwd(),
  'tests/fixtures/stb-import/synthetic',
)

const syntheticXml = `<?xml version="1.0"?>
<ST_BRIDGE version="2.0.2">
  <StbCommon project_name="mini" />
  <StbAxes>
    <StbParallelAxes group_name="Y" angle="270.0" X="10.0" Y="20.0">
      <StbParallelAxis id="y1" name="Y1">
        <StbNodeIdList><StbNodeId id="n1" /></StbNodeIdList>
      </StbParallelAxis>
    </StbParallelAxes>
    <StbArcAxes /><StbRadialAxes /><StbDrawingAxes />
  </StbAxes>
  <StbStories><StbStory id="s1" name="1FL" /></StbStories>
  <StbNodes><StbNode id="n1" X="1.0" Y="2.0" Z="3.0" kind="ON_GRID" /></StbNodes>
  <StbColumn secret="column-value" />
  <StbColumn />
  <StbWall secret="wall-value" />
</ST_BRIDGE>`

function textBytes(text: string): string {
  return text
}

describe('parseStbDocument', () => {
  it('rejects unsupported versions without collecting any document data', () => {
    const document = parseStbDocument(
      textBytes('<ST_BRIDGE version="2.0.3"><StbStory id="s1" /></ST_BRIDGE>'),
      'utf-8',
    )

    expect(document.version).toBe('2.0.3')
    expect(document.issues).toEqual(['対応外バージョン'])
    expect(document.axisGroups).toHaveLength(0)
    expect(document.stories).toHaveLength(0)
    expect(document.nodes).toHaveLength(0)
    expect(document.unsupportedAxisKinds).toHaveLength(0)
    expect(document.unreadElements).toHaveLength(0)
  })

  it.each(['2.0.1', '2.0.2', '2.1.0', '2.1.1'])(
    'accepts supported version %s',
    (version) => {
      const document = parseStbDocument(
        `<ST_BRIDGE version="${version}" />`,
        'utf-8',
      )

      expect(document.version).toBe(version)
      expect(document.issues).toEqual([])
    },
  )

  it('reports XML parser errors without partial data', () => {
    const document = parseStbDocument(
      '<ST_BRIDGE version="2.0.2"><StbStory>',
      'utf-8',
    )

    expect(document.issues).toEqual(['XML解析不能'])
    expect(document.axisGroups).toEqual([])
    expect(document.stories).toEqual([])
    expect(document.nodes).toEqual([])
    expect(document.unsupportedAxisKinds).toEqual([])
    expect(document.unreadElements).toEqual([])
  })

  it('rejects a non-ST-Bridge root', () => {
    expect(parseStbDocument('<foo />', 'utf-8').issues).toEqual([
      'ST-Bridge形式でない',
    ])
  })

  it('keeps omitted attributes undefined and preserves raw strings', () => {
    const document = parseStbDocument(syntheticXml, 'utf-8')

    expect(document.axisGroups[0]?.angle).toBe('270.0')
    expect(document.axisGroups[0]?.axes[0]?.distance).toBeUndefined()
    expect(document.stories[0]?.height).toBeUndefined()
    expect(document.axisGroups[0]?.originX).toBe('10.0')
    expect(document.axisGroups[0]?.originY).toBe('20.0')
  })

  it('counts unsupported axis kinds and does not add them as axis groups', () => {
    const document = parseStbDocument(syntheticXml, 'utf-8')

    expect(document.unsupportedAxisKinds).toEqual([
      { name: 'StbArcAxes', count: 1 },
      { name: 'StbRadialAxes', count: 1 },
      { name: 'StbDrawingAxes', count: 1 },
    ])
    expect(document.axisGroups).toHaveLength(1)
  })

  it('counts unread elements without reading their attributes', () => {
    const document = parseStbDocument(syntheticXml, 'utf-8')

    expect(document.unreadElements).toEqual([
      { name: 'StbColumn', count: 2 },
      { name: 'StbWall', count: 1 },
    ])
    expect(JSON.stringify(document)).not.toContain('column-value')
    expect(JSON.stringify(document)).not.toContain('wall-value')
  })

  it('keeps plural containers in the unread census without collapsing descendants', () => {
    const document = parseStbDocument(
      '<ST_BRIDGE version="2.0.2"><StbMembers><StbColumns><StbColumn /><StbColumn /></StbColumns></StbMembers></ST_BRIDGE>',
      'utf-8',
    )

    expect(document.unreadElements).toEqual([
      { name: 'StbColumns', count: 1 },
      { name: 'StbColumn', count: 2 },
    ])
  })

  it('treats namespaced and namespace-free XML the same', () => {
    const namespacedXml = syntheticXml.replace(
      '<ST_BRIDGE version="2.0.2">',
      '<ST_BRIDGE xmlns="https://www.building-smart.or.jp/dl" version="2.0.2">',
    )

    expect(parseStbDocument(namespacedXml, 'utf-8')).toEqual(
      parseStbDocument(syntheticXml, 'utf-8'),
    )
  })

  it('contains only JSON data', () => {
    const document = parseStbDocument(syntheticXml, 'utf-8')

    expect(JSON.parse(JSON.stringify(document))).toEqual(document)
  })

  it('round-trips the hand-transcribed mini IR apart from encoding metadata', () => {
    const expectedDocument = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'tests/fixtures/stb-import/document/mini.json'),
        'utf8',
      ),
    ) as { _derivedFrom: string; encoding: string }
    const { _derivedFrom, encoding: expectedEncoding, ...expected } =
      expectedDocument
    void _derivedFrom
    void expectedEncoding

    for (const file of ['mini-utf8.stb', 'mini-sjis.stb']) {
      const bytes = readFileSync(resolve(fixtureDirectory, file))
      const buffer = new Uint8Array(bytes.byteLength)
      buffer.set(bytes)
      const decoded = decodeStbBytes(buffer.buffer)

      expect(decoded.ok).toBe(true)
      if (!decoded.ok) throw new Error(`could not decode ${file}`)

      const { encoding: actualEncoding, ...actual } = parseStbDocument(
        decoded.text,
        decoded.encoding,
      )
      void actualEncoding
      expect(actual).toEqual(expected)
    }
  })
})
