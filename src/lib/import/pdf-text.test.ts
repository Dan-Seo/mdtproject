import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDocument = vi.fn()

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument,
}))

import { extractTextPages } from './pdf-text'

function fakeDocument() {
  return {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      // pt 좌표 페이지 (높이 200): viewport.transform이 PDF 좌하 원점을 좌상 원점으로 뒤집는다
      getViewport: () => ({ width: 100, height: 200, transform: [1, 0, 0, -1, 0, 200] }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'AB', width: 20, height: 10, transform: [10, 0, 0, 10, 50, 100] },
          { type: 'beginMarkedContent' }, // TextMarkedContent — str 없음, 걸러져야 한다
        ],
      }),
    }),
  }
}

describe('extractTextPages', () => {
  beforeEach(() => {
    getDocument.mockReset()
    getDocument.mockReturnValue({ promise: Promise.resolve(fakeDocument()) })
  })

  it('opens untrusted PDFs without worker-side fetch', async () => {
    // isEvalSupported는 pdf.js 6.x에서 옵션째 제거됐다(eval 컴파일러 상류 삭제).
    // 남아 있는 하드닝 옵션인 useWorkerFetch만 고정한다.
    const file = new File([new Uint8Array([1])], 'a.pdf', {
      type: 'application/pdf',
    })
    await extractTextPages(file)

    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ useWorkerFetch: false }),
    )
  })

  it('emits per-character baseline items — the fixture extractor convention', async () => {
    const file = new File([new Uint8Array([1])], 'a.pdf', {
      type: 'application/pdf',
    })
    const pages = await extractTextPages(file)

    expect(pages).toEqual([
      {
        widthPt: 100,
        heightPt: 200,
        items: [
          { str: 'A', x: 50, y: 100, w: 10, h: 10 },
          { str: 'B', x: 60, y: 100, w: 10, h: 10 },
        ],
      },
    ])
  })
})
