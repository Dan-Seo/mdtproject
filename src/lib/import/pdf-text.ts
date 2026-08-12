import type {
  TextItem,
  TextPage,
} from '@/lib/import/section-list/types'

/** File → TextPage[] (좌상 원점, +y 아래, pt 좌표). */
export async function extractTextPages(file: File): Promise<TextPage[]> {
  const pdfjs = await import('pdfjs-dist')

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const document = await pdfjs.getDocument({ data }).promise
  const pages: TextPage[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: TextItem[] = []

    for (const entry of content.items) {
      if (!('str' in entry) || entry.str.length === 0) continue

      const transform = pdfjs.Util.transform(
        viewport.transform,
        entry.transform,
      )
      const rotation = (Math.atan2(transform[1], transform[0]) * 180) / Math.PI
      const height = Math.abs(entry.height)

      items.push({
        str: entry.str,
        x: transform[4],
        y: transform[5] - height,
        w: Math.abs(entry.width),
        h: height,
        ...(Math.abs(rotation) > 0.01 ? { rot: rotation } : {}),
      })
    }

    pages.push({
      widthPt: viewport.width,
      heightPt: viewport.height,
      items,
    })
  }

  return pages
}
