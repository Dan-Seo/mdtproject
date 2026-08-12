import type { TextPage } from '@/lib/import/section-list/types'
import { toTextItems, type PdfTextItemLike } from '@/lib/import/textitems'

/** File → TextPage[] (좌상 원점, +y 아래, pt 좌표 — toTextItems 규약). */
export async function extractTextPages(file: File): Promise<TextPage[]> {
  const pdfjs = await import('pdfjs-dist')

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  // 신뢰할 수 없는 도면 PDF를 연다. 구버전의 isEvalSupported는 지정하지 않는다 —
  // eval 기반 PostScript 컴파일러가 상류에서 제거되어 6.x에는 옵션 자체가 없다
  // (pdf.worker.mjs에 new Function 경로 없음을 확인).
  const document = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
  }).promise
  const pages: TextPage[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()

    pages.push({
      widthPt: viewport.width,
      heightPt: viewport.height,
      items: toTextItems(
        content.items.filter(
          (entry): entry is PdfTextItemLike & typeof entry => 'str' in entry,
        ),
        viewport.transform,
      ),
    })
  }

  return pages
}
