import type { RfqHighlight } from '../data/types'
import type { RfqExtractionResult, RfqExtractionItem, ChargeExtractionResult } from '../data/validators'
import { FMS_CONTAINER_TYPES } from '../data/types'
import { runRfqExtraction, runChargeExtraction } from './rfq-llm-provider'

const SYSTEM_PROMPT = `You are a freight forwarding specialist assistant. Your task is to extract structured data from email messages or text inquiries about freight shipping.

RULES:
1. Extract ALL route/container combinations as separate items. If an email mentions 3 different container types on 2 routes, that's 6 items.
2. Identify the sender company name, contact person name, and email address from the message headers, signature, or body.
3. Recognize standard container codes: 20GP, 40GP, 40HC, 45HC, 20RF, 40RF, 40RH, LCL.
4. Handle both Polish and English freight terminology:
   - Polish: "kontener", "trasa", "ładunek", "waga", "gotowość", "tydzień", "nadawca", "odbiorca"
   - English: "container", "route", "cargo", "weight", "readiness", "week", "shipper", "consignee"
5. Detect transport mode from context:
   - Port names, "FCL", "LCL", "kontener" → sea
   - Airport codes, "lotniczy", "air freight" → air
   - "drogowy", "truck", "FTL", "LTL" → road
   - "kolejowy", "rail" → rail
6. Detect direction: if origin is in Poland/Europe and destination is outside → export; reverse → import
7. For readiness dates: extract exactly as written (e.g., "tydzień 15", "week 15", "15.04.2026")
8. For weight: convert to kg if given in tons (1t = 1000kg)
9. Extract cargo descriptions verbatim from the text
10. For each extracted piece of data, include the exact text label as it appears in the source message. This will be used for text highlighting.

OUTPUT:
- companyName: the sender's company name
- contactPerson: the sender's name
- senderEmail: the sender's email
- direction: "import" or "export" or "both" or null
- summary: one-line summary of the entire request
- confidence: 0-1 how confident you are in the extraction
- items: array of extracted quotation items (one per route/container combo)
- extractedLabels: array of { text, type } for each extracted piece of data, where text is the exact string from the original message`

export type RfqExtractionResponse = {
  extraction: RfqExtractionResult & { highlights: RfqHighlight[] }
  model: string
  tokens: number
}

// Map LLM label types to our highlight types
const TYPE_NORMALIZATION: Record<string, string> = {
  containerType: 'container',
  container_type: 'container',
  origin: 'location',
  destination: 'location',
  cargoDescription: 'cargo',
  cargo_description: 'cargo',
  weightKg: 'weight',
  weight_kg: 'weight',
  readinessDate: 'date',
  readiness_date: 'date',
  companyName: 'company',
  company_name: 'company',
  contactPerson: 'contact',
  contact_person: 'contact',
  senderEmail: 'email',
  sender_email: 'email',
  transportMode: 'location',
  transport_mode: 'location',
}

function normalizeHighlightType(raw: string): string {
  return TYPE_NORMALIZATION[raw] || raw
}

function resolveHighlights(
  rawText: string,
  extractedLabels: Array<{ text: string; type: string }>,
): RfqHighlight[] {
  const highlights: RfqHighlight[] = []
  const usedRanges: Array<{ start: number; end: number }> = []

  for (const label of extractedLabels) {
    if (!label.text || label.text.length < 2) continue

    const searchText = label.text.trim()
    let startIndex = 0
    let found = false

    while (startIndex < rawText.length) {
      const index = rawText.indexOf(searchText, startIndex)
      if (index === -1) break

      const end = index + searchText.length

      // Check for overlap with existing highlights
      const overlaps = usedRanges.some(
        (range) => index < range.end && end > range.start,
      )

      if (!overlaps) {
        highlights.push({
          start: index,
          end,
          type: normalizeHighlightType(label.type) as RfqHighlight['type'],
          label: searchText,
        })
        usedRanges.push({ start: index, end })
        found = true
        break
      }

      startIndex = index + 1
    }

    // Try case-insensitive if exact match failed
    if (!found) {
      const lowerText = rawText.toLowerCase()
      const lowerSearch = searchText.toLowerCase()
      let si = 0
      while (si < lowerText.length) {
        const idx = lowerText.indexOf(lowerSearch, si)
        if (idx === -1) break
        const end = idx + searchText.length
        const overlaps = usedRanges.some(
          (range) => idx < range.end && end > range.start,
        )
        if (!overlaps) {
          highlights.push({
            start: idx,
            end,
            type: normalizeHighlightType(label.type) as RfqHighlight['type'],
            label: rawText.slice(idx, end),
          })
          usedRanges.push({ start: idx, end })
          break
        }
        si = idx + 1
      }
    }
  }

  // Sort by position
  highlights.sort((a, b) => a.start - b.start)
  return highlights
}

function normalizeContainerType(raw: string | null | undefined): string | null {
  if (!raw) return null
  const upper = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const types = FMS_CONTAINER_TYPES as readonly string[]
  if (types.includes(upper)) return upper
  // Common aliases
  if (upper === '40HQ' || upper === '40HIGH') return '40HC'
  if (upper === '20DV' || upper === '20STD') return '20GP'
  if (upper === '40DV' || upper === '40STD') return '40GP'
  return raw.toUpperCase()
}

export async function extractRfqFromText(rawText: string): Promise<RfqExtractionResponse> {
  const result = await runRfqExtraction({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: rawText,
    timeoutMs: 120_000,
  })

  const extraction = result.object

  // Normalize container types
  const normalizedItems: RfqExtractionItem[] = (extraction.items || []).map((item) => ({
    ...item,
    containerType: normalizeContainerType(item.containerType),
  }))

  // Build highlights from extracted labels
  const highlights = resolveHighlights(rawText, extraction.extractedLabels || [])

  return {
    extraction: {
      ...extraction,
      items: normalizedItems,
      highlights,
    },
    model: result.modelWithProvider,
    tokens: result.totalTokens,
  }
}

const CHARGE_EXTRACTION_PROMPT = `You are a freight rate parser. Extract individual charge lines from the carrier rate text.

For each charge, identify:
- productName: the charge name (e.g. Ocean Freight, BAF, THC, ISPS, Documentation Fee, BL Fee, Seal Fee, etc.)
- chargeCode: the charge code/abbreviation if present (e.g. OFR, BAF, THC, ISPS, DOC), or null
- chargeBasis: the unit basis (e.g. per container, per BL, per shipment, per TEU, per CBM, per ton), or null
- currencyCode: three-letter ISO currency code (e.g. USD, EUR, PLN)
- rate: the rate/price amount as a number
- buyPrice: the buy/cost price amount as a number (same as rate if not separately specified)

RULES:
1. Extract ALL individual charge lines. Each surcharge, fee, or freight component is a separate charge.
2. If a currency is not explicitly stated, default to USD.
3. If buy price is not separately listed, use the rate value as buyPrice.
4. Handle both Polish and English freight terminology.
5. Parse amounts correctly — handle thousands separators (1,500 or 1.500) and decimal separators.
6. Recognize common freight charge types: ocean freight, BAF, CAF, THC, ISPS, documentation fees, BL fees, seal fees, VGM, AMS, ENS, port charges, customs fees, etc.`

export type ChargeExtractionResponse = {
  charges: ChargeExtractionResult['charges']
  model: string
  tokens: number
}

export async function extractChargesFromText(
  rawText: string,
  transportMode?: string,
): Promise<ChargeExtractionResponse> {
  const userPrompt = transportMode
    ? `Transport mode: ${transportMode}\n\n${rawText}`
    : rawText

  const result = await runChargeExtraction({
    systemPrompt: CHARGE_EXTRACTION_PROMPT,
    userPrompt,
    timeoutMs: 120_000,
  })

  return {
    charges: result.object.charges,
    model: result.modelWithProvider,
    tokens: result.totalTokens,
  }
}
