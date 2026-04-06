import * as esbuild from 'esbuild'
import { glob } from 'glob'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Clean dist before building to avoid stale output
rmSync('dist', { recursive: true, force: true })

const entryPoints = await glob('src/**/*.{ts,tsx}', {
  ignore: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx']
})

// Plugin to add .js extension to relative imports
const addJsExtension = {
  name: 'add-js-extension',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return
      const outputFiles = await glob('dist/**/*.js')
      for (const file of outputFiles) {
        const fileDir = dirname(file)
        let content = readFileSync(file, 'utf-8')
        // Extensions that should not have .js added
        const preserveExtensions = ['.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']

        // Add .js to relative imports that don't have a recognized extension
        content = content.replace(
          /from\s+["'](\.[^"']+)["']/g,
          (match, path) => {
            if (preserveExtensions.some(ext => path.endsWith(ext))) return match
            // Check if it's a directory with index.js
            const resolvedPath = join(fileDir, path)
            if (existsSync(resolvedPath) && existsSync(join(resolvedPath, 'index.js'))) {
              return `from "${path}/index.js"`
            }
            return `from "${path}.js"`
          }
        )
        content = content.replace(
          /import\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
          (match, path) => {
            if (preserveExtensions.some(ext => path.endsWith(ext))) return match
            // Check if it's a directory with index.js
            const resolvedPath = join(fileDir, path)
            if (existsSync(resolvedPath) && existsSync(join(resolvedPath, 'index.js'))) {
              return `import("${path}/index.js")`
            }
            return `import("${path}.js")`
          }
        )
        // Handle side-effect imports: import "./path" (no from clause)
        content = content.replace(
          /import\s+["'](\.[^"']+)["'];/g,
          (match, path) => {
            if (preserveExtensions.some(ext => path.endsWith(ext))) return match
            // Check if it's a directory with index.js
            const resolvedPath = join(fileDir, path)
            if (existsSync(resolvedPath) && existsSync(join(resolvedPath, 'index.js'))) {
              return `import "${path}/index.js";`
            }
            return `import "${path}.js";`
          }
        )
        writeFileSync(file, content)
      }
    })
  }
}

await esbuild.build({
  entryPoints,
  outdir: 'dist',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  plugins: [addJsExtension],
})

// Copy JSON files (translations, etc.)
const jsonFiles = await glob('src/**/*.json')
for (const jsonFile of jsonFiles) {
  const destPath = jsonFile.replace('src/', 'dist/')
  const destDir = dirname(destPath)
  mkdirSync(destDir, { recursive: true })
  copyFileSync(jsonFile, destPath)
}

// Copy PNG files (carrier logos, etc.)
const pngFiles = await glob('src/**/*.png')
for (const pngFile of pngFiles) {
  const destPath = pngFile.replace('src/', 'dist/')
  const destDir = dirname(destPath)
  mkdirSync(destDir, { recursive: true })
  copyFileSync(pngFile, destPath)
}

console.log('shipment-tracking built successfully')
