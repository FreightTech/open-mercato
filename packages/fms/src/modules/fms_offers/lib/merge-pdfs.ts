/**
 * Merges multiple PDF buffers into a single PDF document using pdf-lib.
 * Used to combine individual offer PDFs into one downloadable file.
 */
import { PDFDocument } from 'pdf-lib'

/**
 * Merge multiple PDF buffers into a single PDF.
 * Pages from each buffer are appended in order.
 */
export async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create()

  for (const buf of buffers) {
    const source = await PDFDocument.load(buf)
    const pages = await merged.copyPages(source, source.getPageIndices())
    for (const page of pages) {
      merged.addPage(page)
    }
  }

  const bytes = await merged.save()
  return Buffer.from(bytes)
}
