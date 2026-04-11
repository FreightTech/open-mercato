import * as fs from 'node:fs'
import * as path from 'node:path'
import { validateXML, type XMLValidationResult } from 'xmllint-wasm'

const FIXTURES_ROOT = path.join(__dirname, 'fixtures', 'fa3')
const MAIN_SCHEMA_FILE = 'schemat_FA_3_v1-0E.xsd'

/**
 * Base schemas imported/included by the main FA(3) schema.
 * They live flat in the fixtures directory (not under `bazowe/`) because
 * xmllint-wasm's Emscripten file system does not auto-create subdirectories
 * for preload entries — the main XSD was edited to drop the `bazowe/` path
 * prefix to match.
 */
const BAZOWE_FILES = [
  'StrukturyDanych_v10-0E.xsd',
  'ElementarneTypyDanych_v10-0E.xsd',
  'KodyKrajow_v10-0E.xsd',
]

function loadMainSchema(): { fileName: string; contents: string } {
  return {
    fileName: MAIN_SCHEMA_FILE,
    contents: fs.readFileSync(path.join(FIXTURES_ROOT, MAIN_SCHEMA_FILE), 'utf8'),
  }
}

function loadBazowe(): Array<{ fileName: string; contents: string }> {
  return BAZOWE_FILES.map((name) => ({
    fileName: name,
    contents: fs.readFileSync(path.join(FIXTURES_ROOT, name), 'utf8'),
  }))
}

/**
 * Validates the given FA(3) XML string against the real
 * `schemat_FA(3)_v1-0E.xsd` schema copied from `ksef-docs`.
 *
 * Uses `xmllint-wasm` — a pure-WASM build of libxml2. No native compilation,
 * works with stock Node.
 *
 * Base schemas (`StrukturyDanych`, `ElementarneTypyDanych`, `KodyKrajow`)
 * are preloaded into the emscripten file system so the main schema's
 * relative `<xsd:import>` resolves without network access.
 */
export async function validateFa3Xml(xml: string): Promise<XMLValidationResult> {
  return validateXML({
    xml: { fileName: 'invoice.xml', contents: xml },
    schema: loadMainSchema(),
    preload: loadBazowe(),
  })
}

/**
 * Convenience helper that throws a readable error when the XML does not
 * validate. Use in tests where you want a hard failure with the raw XSD
 * error messages attached.
 */
export async function assertFa3XmlValid(xml: string): Promise<void> {
  const result = await validateFa3Xml(xml)
  if (!result.valid) {
    const errors = result.errors
      .map((e) => (e.loc ? `  line ${e.loc.lineNumber}: ${e.message}` : `  ${e.message}`))
      .join('\n')
    throw new Error(
      `FA(3) XSD validation failed with ${result.errors.length} error(s):\n${errors}\n\n-- XML --\n${xml}`,
    )
  }
}
