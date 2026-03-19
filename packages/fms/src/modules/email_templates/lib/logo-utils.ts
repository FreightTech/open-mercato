import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'

// In-memory cache for logo data URIs
const logoCache = new Map<string, string>()

/**
 * Convert logo file to data URI with image resizing
 * - Resizes images to max 800px width (maintains aspect ratio)
 * - Converts to base64 data URI
 * - Caches results in memory
 */
export async function logoPathToDataUri(
  logoPath: string,
  maxWidth: number = 800
): Promise<string | null> {
  // Check cache first
  const cacheKey = `${logoPath}:${maxWidth}`
  if (logoCache.has(cacheKey)) {
    return logoCache.get(cacheKey)!
  }

  try {
    // Resolve path (relative to public directory)
    const publicDir = path.join(process.cwd(), 'public')
    const fullPath = path.join(publicDir, logoPath)
    
    // Read file
    const fileBuffer = await fs.readFile(fullPath)
    
    // Determine file type
    const ext = path.extname(logoPath).toLowerCase()
    
    let processedBuffer: Buffer
    let mimeType: string
    
    if (ext === '.svg') {
      // SVG: just encode as-is (no resizing needed)
      processedBuffer = fileBuffer
      mimeType = 'image/svg+xml'
    } else {
      // Raster images: resize and optimize
      const image = sharp(fileBuffer)
      const metadata = await image.metadata()
      
      // Only resize if larger than maxWidth
      if (metadata.width && metadata.width > maxWidth) {
        processedBuffer = await image
          .resize(maxWidth, null, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .png({ quality: 90 })
          .toBuffer()
        mimeType = 'image/png'
      } else {
        // Keep original if already small enough
        processedBuffer = await image.png({ quality: 90 }).toBuffer()
        mimeType = 'image/png'
      }
    }
    
    // Convert to base64 data URI
    const base64 = processedBuffer.toString('base64')
    const dataUri = `data:${mimeType};base64,${base64}`
    
    // Cache and return
    logoCache.set(cacheKey, dataUri)
    return dataUri
    
  } catch (error) {
    console.error(`Failed to convert logo to data URI: ${logoPath}`, error)
    return null
  }
}

/**
 * Clear logo cache (useful for testing or dev mode)
 */
export function clearLogoCache(): void {
  logoCache.clear()
}
