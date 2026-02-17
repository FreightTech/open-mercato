import type { StorageDriver } from '@open-mercato/shared/lib/drivers'

export interface PageExtractionResult {
  pageNumber: number
  storagePath: string
  width?: number
  height?: number
  fileSize?: number
}

export interface PageImageServiceOptions {
  storageDriver: StorageDriver
  bucketKey: string
  scale?: number
}

/**
 * PageImageService - Extracts and stores PDF page images
 *
 * Uses pdf-to-img (pure JavaScript, no ImageMagick/GraphicsMagick required)
 * Stores page images via a StorageDriver (NATS Object Store, S3, etc.)
 *
 * Responsibilities:
 * - Convert PDF pages to images using pdf-to-img
 * - Store images via StorageDriver (bucket + object key model)
 * - Provide page image buffers for serving via API
 */
export class PageImageService {
  private storageDriver: StorageDriver
  private bucketKey: string
  private scale: number

  constructor(options: PageImageServiceOptions) {
    this.storageDriver = options.storageDriver
    this.bucketKey = options.bucketKey
    this.scale = options.scale ?? 2.0 // Scale factor for resolution (2.0 = 144 DPI)
  }

  /**
   * Extract and store all pages from a PDF buffer
   */
  async extractAndStorePdfPages(
    pdfBuffer: Buffer,
    entityId: string,
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
            entityId,
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
          console.error(`[fms_documents] Failed to store page ${pageNumber}:`, err)
        }
      }

      return results
    } catch (err) {
      console.error('[fms_documents] Failed to extract PDF pages:', err)
      return []
    }
  }

  /**
   * Store a page image from buffer via StorageDriver
   */
  async storePageImageFromBuffer(
    imageBuffer: Buffer,
    entityId: string,
    pageNumber: number,
    organizationId: string
  ): Promise<{ storagePath: string; fileSize: number; width?: number; height?: number }> {
    const objectName = this.getPageStoragePath(entityId, pageNumber, organizationId)

    await this.storageDriver.writeFile(this.bucketKey, objectName, imageBuffer, {
      contentType: 'image/png',
      entityId,
      organizationId,
    })

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
      storagePath: objectName,
      fileSize: imageBuffer.length,
      width,
      height,
    }
  }

  /**
   * Get page image as a buffer for serving
   */
  async getPageImageBuffer(storagePath: string): Promise<Buffer | null> {
    try {
      return await this.storageDriver.readFile(this.bucketKey, storagePath)
    } catch {
      return null
    }
  }

  /**
   * Check if a page image exists
   */
  async pageExists(storagePath: string): Promise<boolean> {
    return this.storageDriver.fileExists(this.bucketKey, storagePath)
  }

  /**
   * Delete page images by their storage paths
   */
  async deletePages(storagePaths: string[]): Promise<void> {
    for (const objectName of storagePaths) {
      try {
        await this.storageDriver.deleteFile(this.bucketKey, objectName)
      } catch {
        // Object may not exist, ignore
      }
    }
  }

  /**
   * Get the MIME type for page images
   */
  getMimeType(): string {
    return 'image/png'
  }

  /**
   * Get the storage driver id (e.g. 'nats', 's3')
   */
  getDriverId(): string {
    return this.storageDriver.id
  }

  /**
   * Get storage path (object name) for a page
   */
  getPageStoragePath(
    entityId: string,
    pageNumber: number,
    organizationId: string
  ): string {
    return `org_${organizationId}/${entityId}/page_${pageNumber}.png`
  }
}
