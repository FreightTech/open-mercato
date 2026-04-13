import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  HsSuggestion,
  Isztar4EnrichedResult,
  NonTariffMeasureDetail,
  ProductLine,
  TariffTreeNode,
  TariffTreePath,
} from '../data/entities'

const ISZTAR4_BASE_URL = 'https://ext-isztar4.mf.gov.pl/tariff/rest'

const HS_SYSTEM_INSTRUCTION = `You are an EU customs classification expert specializing
in the Combined Nomenclature (CN). Return ONLY valid JSON.`

// ── Chapter → ISZTAR4 page mapping ─────────────────────────────────
// Derived from live ISZTAR4 data. Each page = one HS section.

const CHAPTER_TO_PAGE: Record<number, number> = {}

function initChapterToPage() {
  const ranges: [number, number, number][] = [
    [1, 5, 1], [6, 14, 2], [15, 15, 3], [16, 24, 4], [25, 27, 5],
    [28, 38, 6], [39, 40, 7], [41, 43, 8], [44, 46, 9], [47, 49, 10],
    [50, 63, 11], [64, 67, 12], [68, 70, 13], [71, 71, 14], [72, 83, 15],
    [84, 85, 16], [86, 89, 17], [90, 92, 18], [93, 93, 19], [94, 96, 20],
    [97, 99, 21],
  ]
  for (const [start, end, page] of ranges) {
    for (let chapter = start; chapter <= end; chapter++) {
      CHAPTER_TO_PAGE[chapter] = page
    }
  }
}
initChapterToPage()

export function getPageForChapter(chapterCode: string): number | undefined {
  const num = parseInt(chapterCode.replace(/^0+/, ''), 10)
  return CHAPTER_TO_PAGE[num]
}

// ── ISZTAR4 raw tree → TariffTreeNode conversion ──────────────────

interface RawIsztar4Node {
  code?: string
  description?: string
  subgroup?: RawIsztar4Node[]
}

function convertToTreeNode(raw: RawIsztar4Node): TariffTreeNode {
  const node: TariffTreeNode = { description: raw.description ?? '' }
  if (raw.code) node.code = raw.code
  if (raw.subgroup && raw.subgroup.length > 0) {
    node.children = raw.subgroup.map(convertToTreeNode)
  }
  return node
}

// ── Tree traversal helpers (exported for testing) ──────────────────

export function findChapterNode(tree: TariffTreeNode, chapterCode: string): TariffTreeNode | null {
  const prefix = chapterCode.padStart(2, '0')
  // The tree is: Section → chapter description nodes → headings → ...
  // Chapter nodes may not have a code, but their child headings start with the chapter prefix
  function search(node: TariffTreeNode): TariffTreeNode | null {
    // Check if this node's children start with the chapter prefix
    if (node.children) {
      for (const child of node.children) {
        if (child.code && child.code.startsWith(prefix)) {
          // Found the chapter — return the parent node that contains these headings
          return node
        }
        const result = search(child)
        if (result) return result
      }
    }
    return null
  }
  return search(tree)
}

export function extractLeafCodes(node: TariffTreeNode, headingPrefix: string): { code: string; description: string }[] {
  const leaves: { code: string; description: string }[] = []
  function walk(n: TariffTreeNode, parentDesc: string) {
    const code = n.code ?? ''
    if (code.length === 10 && code.startsWith(headingPrefix)) {
      leaves.push({ code, description: n.description })
    }
    if (n.children) {
      for (const child of n.children) {
        walk(child, n.description)
      }
    }
  }
  walk(node, '')
  return leaves
}

export function extractHeadings(chapterNode: TariffTreeNode, chapterCode: string): { code: string; description: string }[] {
  const prefix = chapterCode.padStart(2, '0')
  const headings: { code: string; description: string }[] = []
  function walk(node: TariffTreeNode) {
    const code = node.code ?? ''
    // Headings are 4-digit codes or description-only nodes whose children have 4-digit codes
    if (code.length >= 4 && code.length <= 6 && code.startsWith(prefix)) {
      headings.push({ code, description: node.description })
    }
    // Also collect heading-level description nodes (no code, but contain leaf codes)
    if (!code && node.children) {
      // Check if children start with the chapter prefix
      const hasChapterChildren = node.children.some((c) =>
        (c.code ?? '').startsWith(prefix),
      )
      if (hasChapterChildren) {
        headings.push({ code: '', description: node.description })
      }
    }
    if (node.children) {
      for (const child of node.children) walk(child)
    }
  }
  // Walk the chapter node's children
  if (chapterNode.children) {
    for (const child of chapterNode.children) walk(child)
  }
  // Filter to heading-level only (4-digit codes or descriptions with leaf children)
  return headings.filter((h) => {
    if (!h.code) return true // description-only heading
    return h.code.length === 4 || (h.code.length === 6 && !h.code.endsWith('0000'))
  })
}

export function trimTreeToChapter(sectionTree: TariffTreeNode, chapterCode: string): TariffTreeNode | null {
  const prefix = chapterCode.padStart(2, '0')
  // Walk the tree, find the subtree whose heading codes start with prefix
  function findChapterSubtree(node: TariffTreeNode): TariffTreeNode | null {
    if (node.children) {
      // Check if any direct children have codes starting with the chapter
      const chapterChildren = node.children.filter((child) => {
        if (child.code && child.code.startsWith(prefix)) return true
        // Also check if it's a description node whose descendants have chapter codes
        if (!child.code && child.children) {
          return child.children.some((gc) => (gc.code ?? '').startsWith(prefix))
        }
        return false
      })
      if (chapterChildren.length > 0) {
        return { description: node.description, children: chapterChildren }
      }
      // Recurse
      for (const child of node.children) {
        const result = findChapterSubtree(child)
        if (result) return result
      }
    }
    return null
  }
  return findChapterSubtree(sectionTree)
}

// ── Section cache ──────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CachedSection {
  tree: TariffTreeNode
  fetchedAt: number
}

const sectionCache = new Map<number, CachedSection>()

// ── Service ────────────────────────────────────────────────────────

export class Isztar4Service {
  private genAI: GoogleGenerativeAI | null = null
  private lastError: string | null = null

  private getGenAI(): GoogleGenerativeAI {
    if (!this.genAI) {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
      if (!apiKey) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set')
      }
      this.genAI = new GoogleGenerativeAI(apiKey)
    }
    return this.genAI
  }

  // ── ISZTAR4 section fetching with cache ──────────────────────────

  async fetchSection(page: number): Promise<TariffTreeNode> {
    const cached = sectionCache.get(page)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.tree
    }

    const url = `${ISZTAR4_BASE_URL}/goods-nomenclature/codes?date=${new Date().toISOString().split('T')[0]}&language=EN&page=${page}`
    console.log(`[customs] Fetching ISZTAR4 section page ${page}`)

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
      throw new Error(`ISZTAR4 section fetch failed: ${response.status}`)
    }

    const rawData = (await response.json()) as RawIsztar4Node
    const tree = convertToTreeNode(rawData)
    sectionCache.set(page, { tree, fetchedAt: Date.now() })
    return tree
  }

  async getChapterTree(chapterCode: string): Promise<TariffTreeNode | null> {
    const page = getPageForChapter(chapterCode)
    if (!page) return null
    const sectionTree = await this.fetchSection(page)
    return trimTreeToChapter(sectionTree, chapterCode)
  }

  // ── Step 1: Gemini identifies chapters ───────────────────────────

  async identifyChapters(productLine: ProductLine): Promise<{ chapter: string; reasoning: string }[]> {
    const model = this.getGenAI().getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
      systemInstruction: HS_SYSTEM_INSTRUCTION,
    })

    const prompt = `Product: "${productLine.description}"
Model: "${productLine.model ?? 'N/A'}"
Country of origin: "${productLine.countryOfOrigin ?? 'N/A'}"
HS code declared by exporter (if any): "${productLine.hsCodeFromInvoice ?? 'none'}"

Which HS chapters (2-digit codes) could this product fall under?
Return 1-3 most likely chapters. Be specific, not broad.

[{ "chapter": "40", "reasoning": "why this chapter" }]`

    const result = await model.generateContent([{ text: prompt }])
    return JSON.parse(result.response.text()) as { chapter: string; reasoning: string }[]
  }

  // ── Step 2: Gemini navigates the real tariff tree ────────────────

  async navigateTree(
    productLine: ProductLine,
    chapterCode: string,
    chapterTree: TariffTreeNode,
  ): Promise<{
    headingCode: string
    headingDescription: string
    headingReasoning: string
    leafCode: string
    leafDescription: string
    leafReasoning: string
    alternativeHeadings: { code: string; description: string; note: string }[]
  } | null> {
    // Build a compact text representation of the tree for the prompt
    const treeText = renderTreeForPrompt(chapterTree, 0)

    // Limit tree text to ~6000 chars to leave room for prompt + response
    const trimmedTree = treeText.length > 6000 ? treeText.slice(0, 6000) + '\n...(truncated)' : treeText

    const model = this.getGenAI().getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
      systemInstruction: HS_SYSTEM_INSTRUCTION,
    })

    const prompt = `Product: "${productLine.description}"
Model: "${productLine.model ?? 'N/A'}"
Country of origin: "${productLine.countryOfOrigin ?? 'N/A'}"
HS code declared by exporter: "${productLine.hsCodeFromInvoice ?? 'none'}"

Below is the REAL tariff tree for Chapter ${chapterCode}. Navigate to the correct 10-digit code.
You MUST pick a code from this tree. Do NOT invent codes.

${trimmedTree}

Return:
{
  "headingCode": "4-digit heading",
  "headingDescription": "heading description from tree",
  "headingReasoning": "why you chose this heading over alternatives",
  "leafCode": "10-digit code from the tree",
  "leafDescription": "leaf description from tree",
  "leafReasoning": "why this specific subheading matches",
  "alternativeHeadings": [{ "code": "4-digit", "description": "text", "note": "why it could also apply" }]
}`

    try {
      const result = await model.generateContent([{ text: prompt }])
      const parsed = JSON.parse(result.response.text())
      return parsed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[customs] Tree navigation failed for chapter ${chapterCode}:`, message)
      return null
    }
  }

  // ── Grounded classification (full flow) ──────────────────────────

  async classifyWithTree(
    productLine: ProductLine,
    date?: string,
  ): Promise<{
    tariffTree: TariffTreeNode | null
    aiPath: TariffTreePath | null
    enrichment: Isztar4EnrichedResult | null
    // Backward-compat fields
    suggestions: HsSuggestion[]
    enriched: Isztar4EnrichedResult[]
    error?: string
  }> {
    try {
      // Step 1: Identify chapters
      console.log(`[customs] Grounded classify: identifying chapters for "${productLine.description}"`)
      const chapters = await this.identifyChapters(productLine)
      if (chapters.length === 0) {
        return { tariffTree: null, aiPath: null, enrichment: null, suggestions: [], enriched: [], error: 'No chapters identified' }
      }
      console.log(`[customs] Identified chapters: ${chapters.map((c) => c.chapter).join(', ')}`)

      // Step 2: Fetch tree for primary chapter and navigate
      const primaryChapter = chapters[0].chapter.padStart(2, '0')
      const chapterTree = await this.getChapterTree(primaryChapter)

      if (!chapterTree) {
        console.error(`[customs] Could not fetch chapter tree for ${primaryChapter}, falling back`)
        return this.classifyFallback(productLine, date)
      }

      // Step 3: Gemini navigates the real tree
      console.log(`[customs] Navigating tariff tree for chapter ${primaryChapter}`)
      const navigation = await this.navigateTree(productLine, primaryChapter, chapterTree)

      if (!navigation) {
        console.error(`[customs] Tree navigation failed, falling back`)
        return this.classifyFallback(productLine, date)
      }

      // Validate that the leaf code actually exists in the tree
      const leafCodes = extractLeafCodes(chapterTree, navigation.headingCode)
      const leafExists = leafCodes.some((l) => l.code === navigation.leafCode)
      if (!leafExists) {
        console.warn(`[customs] AI selected ${navigation.leafCode} which is not in the tree — finding closest match`)
        // Try to find the closest valid leaf code
        if (leafCodes.length > 0) {
          navigation.leafCode = leafCodes[0].code
          navigation.leafDescription = leafCodes[0].description
          navigation.leafReasoning += ' (AI originally suggested a code not in the tree; showing first valid code under this heading)'
        }
      }

      // Build the AI path
      const aiPath: TariffTreePath = {
        chapterCode: primaryChapter,
        chapterDescription: chapterTree.description,
        headingCode: navigation.headingCode,
        headingDescription: navigation.headingDescription,
        leafCode: navigation.leafCode,
        leafDescription: navigation.leafDescription,
        reasoning: `${navigation.headingReasoning}. ${navigation.leafReasoning}`,
        alternativeHeadings: navigation.alternativeHeadings,
      }

      // Step 4: Enrich the selected leaf code
      const enrichment = await this.enrichFromIsztar4(navigation.leafCode, date)

      // Build backward-compat suggestions from the leaf codes under the heading
      const suggestions: HsSuggestion[] = []
      const enriched: Isztar4EnrichedResult[] = []

      // Primary suggestion
      suggestions.push({
        hsCode: navigation.leafCode,
        description: enrichment.valid ? enrichment.description : navigation.leafDescription,
        reasoning: navigation.leafReasoning,
        confidence: 'high',
        source: 'ai',
      })
      enriched.push(enrichment)

      // Add a few sibling leaf codes as alternatives
      const siblingLeaves = leafCodes.filter((l) => l.code !== navigation.leafCode).slice(0, 3)
      const siblingEnrichments = await Promise.all(
        siblingLeaves.map((l) => this.enrichFromIsztar4(l.code, date)),
      )
      for (let i = 0; i < siblingLeaves.length; i++) {
        suggestions.push({
          hsCode: siblingLeaves[i].code,
          description: siblingEnrichments[i].valid ? siblingEnrichments[i].description : siblingLeaves[i].description,
          reasoning: `Alternative code under heading ${navigation.headingCode}`,
          confidence: 'medium',
          source: 'ai',
        })
        enriched.push(siblingEnrichments[i])
      }

      console.log(`[customs] Grounded classify complete: ${navigation.leafCode} (${suggestions.length} total options)`)

      return {
        tariffTree: chapterTree,
        aiPath,
        enrichment,
        suggestions,
        enriched,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[customs] Grounded classify failed:`, message)
      // Fall back to old ungrounded flow
      return this.classifyFallback(productLine, date)
    }
  }

  // ── Fallback: old ungrounded flow ────────────────────────────────

  private async classifyFallback(
    productLine: ProductLine,
    date?: string,
  ): Promise<{
    tariffTree: null
    aiPath: null
    enrichment: null
    suggestions: HsSuggestion[]
    enriched: Isztar4EnrichedResult[]
    error?: string
  }> {
    console.warn(`[customs] Using ungrounded fallback for "${productLine.description}"`)
    const suggestions = await this.suggestHsCodes(productLine)
    if (suggestions.length === 0) {
      return { tariffTree: null, aiPath: null, enrichment: null, suggestions: [], enriched: [], error: this.lastError ?? 'No suggestions returned' }
    }
    const enriched = await Promise.all(
      suggestions.map((s) => this.enrichFromIsztar4(s.hsCode, date)),
    )
    return { tariffTree: null, aiPath: null, enrichment: null, suggestions, enriched }
  }

  // ── Legacy: direct Gemini suggestion (kept for fallback) ─────────

  async suggestHsCodes(productLine: ProductLine): Promise<HsSuggestion[]> {
    try {
      const model = this.getGenAI().getGenerativeModel({
        model: 'gemini-3.1-flash-lite-preview',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
        systemInstruction: HS_SYSTEM_INSTRUCTION,
      })

      const prompt = `Product: "${productLine.description}"
Model: "${productLine.model ?? 'N/A'}"
Country of origin: "${productLine.countryOfOrigin ?? 'N/A'}"
HS code declared by exporter (if any): "${productLine.hsCodeFromInvoice ?? 'none'}"

Suggest 3-5 plausible 10-digit CN codes (pad with trailing zeros).
- Always include at least 2-3 genuine alternatives so the broker has options.
- Mark confidence honestly: "high" when you are very sure, "medium" for plausible alternatives, "low" for stretch candidates.
- If exporter declared a code, include it as the first suggestion with high confidence.

[
  {
    "hsCode": "XXXXXXXXXX",
    "description": "what this code covers",
    "reasoning": "why this fits",
    "confidence": "high" | "medium" | "low"
  }
]`

      console.log(`[customs] Suggesting HS codes (ungrounded) for: "${productLine.description}"`)
      const result = await model.generateContent([{ text: prompt }])
      const responseText = result.response.text()
      const suggestions = JSON.parse(responseText) as HsSuggestion[]
      for (const suggestion of suggestions) {
        suggestion.source = 'ai'
      }
      const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
      suggestions.sort((a, b) => (confidenceOrder[a.confidence] ?? 2) - (confidenceOrder[b.confidence] ?? 2))
      const meaningful = suggestions.filter((s) => s.confidence !== 'low')
      const filtered = meaningful.length >= 3 ? meaningful : suggestions
      this.lastError = null
      return filtered
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[customs] Failed to suggest HS codes for:', productLine.description, '— Error:', message)
      this.lastError = message
      return []
    }
  }

  // ── ISZTAR4 enrichment (unchanged) ───────────────────────────────

  async enrichFromIsztar4(hsCode: string, date?: string): Promise<Isztar4EnrichedResult> {
    const paddedCode = hsCode.replace(/\s/g, '').padEnd(10, '0')
    const queryDate = date ?? new Date().toISOString().split('T')[0]
    const url = `${ISZTAR4_BASE_URL}/goods-nomenclature/measures?nomenclatureCode=${paddedCode}&date=${queryDate}&language=EN`

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return { code: paddedCode, description: '', valid: false }
      }

      const data = await response.json()

      const description = data?.nomenclature?.description ?? ''
      const supplementaryUnit = data?.nomenclature?.supplementaryUnit ?? undefined

      let dutyAmount: string | undefined
      if (Array.isArray(data?.tariffMeasures)) {
        const ergaOmnesMeasure = data.tariffMeasures.find(
          (measure: Record<string, unknown>) => {
            const country = measure.country as Record<string, unknown> | undefined
            return country?.code === 'ERGA OMNES'
          },
        )
        if (ergaOmnesMeasure) {
          dutyAmount = String(ergaOmnesMeasure.dutyAmount ?? '')
        }
      }

      const nonTariffMeasures: NonTariffMeasureDetail[] = []
      if (Array.isArray(data?.nonTariffMeasures)) {
        const seen = new Set<string>()
        for (const measure of data.nonTariffMeasures) {
          if (measure.description && !seen.has(measure.description)) {
            seen.add(measure.description)
            const detail: NonTariffMeasureDetail = {
              description: String(measure.description),
            }
            const country = measure.country as Record<string, unknown> | undefined
            if (country?.code) detail.countryCode = String(country.code)
            if (country?.description) detail.countryDescription = String(country.description)
            const mc = measure.measureConditions as Record<string, unknown> | undefined
            if (mc?.conditions && Array.isArray(mc.conditions)) {
              detail.conditions = (mc.conditions as Record<string, unknown>[]).map((c) => ({
                code: String(c.code ?? ''),
                description: String(c.description ?? ''),
                action: String(c.action ?? ''),
              }))
            }
            if (mc?.additionalInformations && Array.isArray(mc.additionalInformations)) {
              detail.certificates = (mc.additionalInformations as Record<string, unknown>[]).map((c) => ({
                code: String(c.code ?? ''),
                description: String(c.description ?? ''),
              }))
            }
            const reg = measure.regulation as Record<string, unknown> | undefined
            if (reg?.abbreviation) detail.regulationAbbreviation = String(reg.abbreviation)
            if (reg?.link) detail.regulationLink = String(reg.link)
            nonTariffMeasures.push(detail)
          }
        }
      }

      return {
        code: paddedCode,
        description: description || '',
        dutyAmount: dutyAmount || undefined,
        supplementaryUnit: supplementaryUnit || undefined,
        nonTariffMeasures: nonTariffMeasures.length > 0 ? nonTariffMeasures : undefined,
        valid: description.length > 0,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[customs] ISZTAR4 lookup failed for ${paddedCode}:`, message)
      return { code: paddedCode, description: '', valid: false }
    }
  }

  // ── Combined classify (backward compat wrapper) ──────────────────

  async classifyProductLine(
    productLine: ProductLine,
    date?: string,
  ): Promise<{
    suggestions: HsSuggestion[]
    enriched: Isztar4EnrichedResult[]
    tariffTree?: TariffTreeNode | null
    aiPath?: TariffTreePath | null
    error?: string
  }> {
    const result = await this.classifyWithTree(productLine, date)
    return {
      suggestions: result.suggestions,
      enriched: result.enriched,
      tariffTree: result.tariffTree,
      aiPath: result.aiPath,
      error: result.error,
    }
  }
}

// ── Helper: render tree as text for Gemini prompt ──────────────────

function renderTreeForPrompt(node: TariffTreeNode, depth: number): string {
  const lines: string[] = []
  const indent = '  '.repeat(depth)
  const code = node.code ?? ''
  const desc = node.description

  if (code || (depth > 0 && desc)) {
    const codeStr = code ? `[${code}] ` : ''
    lines.push(`${indent}${codeStr}${desc}`)
  }

  if (node.children) {
    for (const child of node.children) {
      lines.push(renderTreeForPrompt(child, depth + 1))
    }
  }

  return lines.join('\n')
}
