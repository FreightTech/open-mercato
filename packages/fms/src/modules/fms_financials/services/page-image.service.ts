import * as fs from 'fs/promises'
import * as path from 'path'

export interface PageExtractionResult {
  pageNumber: number
  storagePath: string
  width?: number
  height?: number
  fileSize?: number
}

export interface PageImageServiceOptions {
  storageRoot?: string
  scale?: number
}

/**
 * PageImageService - Extracts and stores PDF page images
 *
 * Uses pdf-to-img (pure JavaScript, no ImageMagick/GraphicsMagick required)
 *
 * Responsibilities:
 * - Convert PDF pages to images using pdf-to-img
 * - Store images persistently in the local filesystem
 * - Provide page image streams for serving via API
 */
export class PageImageService {
  private storageRoot: string
  private scale: number

  constructor(options: PageImageServiceOptions = {}) {
    this.storageRoot =
      options.storageRoot ??
      process.env.INVOICE_PAGES_STORAGE_PATH ??
      './storage/attachments/invoicePages'
    this.scale = options.scale ?? 2.0 // Scale factor for resolution (2.0 = 144 DPI)
  }

  /**
   * Extract and store all pages from a PDF buffer
   */
  async extractAndStorePdfPages(
    pdfBuffer: Buffer,
    invoiceId: string,
    organizationId: string,
    _tenantId: string
  ): Promise<PageExtractionResult[]> {
    const results: PageExtractionResult[] = []

    try {
      // Polyfill DOMMatrix from canvas for Node.js environment (required by pdfjs-dist v5)
      const { DOMMatrix } = await import('canvas')
      if (typeof globalThis.DOMMatrix === 'undefined') {
        ;(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix
      }

      // Dynamically import pdf-to-img to avoid module initialization issues in Next.js
      const { pdf } = await import('pdf-to-img')
      // Convert PDF to images using pdf-to-img
      const document = await pdf(pdfBuffer, { scale: this.scale })

      let pageNumber = 0
      for await (const pageImage of document) {
        pageNumber++

        try {
          // pageImage is a PNG buffer
          const stored = await this.storePageImageFromBuffer(
            pageImage,
            invoiceId,
            pageNumber,
            organizationId
          )

          results.push({
            pageNumber,
            storagePath: stored.storagePath,
            width: stored.width,
            height: stored.height,
            fileSize: stored.fileSize,
          })
        } catch (err) {
          console.error(`[fms_financials] Failed to store page ${pageNumber}:`, err)
        }
      }

      return results
    } catch (err) {
      console.error('[fms_financials] Failed to extract PDF pages:', err)
      return []
    }
  }

  /**
   * Store a page image from buffer to permanent storage
   */
  async storePageImageFromBuffer(
    imageBuffer: Buffer,
    invoiceId: string,
    pageNumber: number,
    organizationId: string
  ): Promise<{ storagePath: string; fileSize: number; width?: number; height?: number }> {
    const destDir = path.join(
      this.storageRoot,
      `org_${organizationId}`,
      invoiceId
    )
    const destPath = path.join(destDir, `page_${pageNumber}.png`)

    // Ensure directory exists
    await fs.mkdir(destDir, { recursive: true })

    // Write buffer to file
    await fs.writeFile(destPath, imageBuffer)

    // Get file stats
    const stats = await fs.stat(destPath)

    // Try to get image dimensions from PNG header
    let width: number | undefined
    let height: number | undefined
    if (imageBuffer.length > 24) {
      // PNG header: bytes 16-19 = width, bytes 20-23 = height (big-endian)
      if (
        imageBuffer[0] === 0x89 &&
        imageBuffer[1] === 0x50 &&
        imageBuffer[2] === 0x4e &&
        imageBuffer[3] === 0x47
      ) {
        width = imageBuffer.readUInt32BE(16)
        height = imageBuffer.readUInt32BE(20)
      }
    }

    return {
      storagePath: destPath,
      fileSize: stats.size,
      width,
      height,
    }
  }

  /**
   * Store a single page image from temp path to permanent storage
   */
  async storePageImage(
    sourcePath: string,
    invoiceId: string,
    pageNumber: number,
    organizationId: string
  ): Promise<{ storagePath: string; fileSize: number }> {
    const destDir = path.join(
      this.storageRoot,
      `org_${organizationId}`,
      invoiceId
    )
    const destPath = path.join(destDir, `page_${pageNumber}.png`)

    // Ensure directory exists
    await fs.mkdir(destDir, { recursive: true })

    // Copy file to permanent storage
    await fs.copyFile(sourcePath, destPath)

    // Get file stats
    const stats = await fs.stat(destPath)

    // Delete temp file
    await fs.unlink(sourcePath).catch(() => {
      // Ignore cleanup errors
    })

    return {
      storagePath: destPath,
      fileSize: stats.size,
    }
  }

  /**
   * Get page image as a buffer for serving
   */
  async getPageImageBuffer(storagePath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(storagePath)
    } catch {
      return null
    }
  }

  /**
   * Check if a page image exists
   */
  async pageExists(storagePath: string): Promise<boolean> {
    try {
      await fs.access(storagePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Delete all page images for an invoice
   */
  async deleteInvoicePages(
    invoiceId: string,
    organizationId: string
  ): Promise<void> {
    const dir = path.join(this.storageRoot, `org_${organizationId}`, invoiceId)

    try {
      await fs.rm(dir, { recursive: true, force: true })
    } catch {
      // Directory may not exist, ignore
    }
  }

  /**
   * Get the MIME type for page images
   */
  getMimeType(): string {
    return 'image/png'
  }

  /**
   * Get storage path for a page (without checking existence)
   */
  getPageStoragePath(
    invoiceId: string,
    pageNumber: number,
    organizationId: string
  ): string {
    return path.join(
      this.storageRoot,
      `org_${organizationId}`,
      invoiceId,
      `page_${pageNumber}.png`
    )
  }
}

/**
 * Factory function to create PageImageService
 */
export function createPageImageService(
  options?: PageImageServiceOptions
): PageImageService {
  return new PageImageService(options)
}
