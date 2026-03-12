import type {
  ExtractionProviderResult,
  ConsensusResult,
  ConsensusRecommendation,
  FieldConsensus,
  Disagreement,
  PipelineConfig,
} from './types'

const NUMERIC_TOLERANCE = 0.01
const STRING_SIMILARITY_THRESHOLD = 0.85

export class ConsensusEngine {
  private config: PipelineConfig

  constructor(config: PipelineConfig) {
    this.config = config
  }

  buildConsensus(results: ExtractionProviderResult[]): ConsensusResult {
    const successful = results.filter((r) => r.success)

    if (successful.length === 0) {
      return {
        recommendation: 'MANUAL',
        overallConfidence: 0,
        consensusData: {},
        fieldConfidences: {},
        disagreements: [],
        providerResults: results,
      }
    }

    if (successful.length === 1) {
      return {
        recommendation: 'REVIEW',
        overallConfidence: 0.5,
        consensusData: successful[0].data,
        fieldConfidences: this.buildSingleProviderConfidences(successful[0]),
        disagreements: [],
        providerResults: results,
      }
    }

    // Multi-provider consensus
    const allFields = this.collectAllFields(successful)
    const fieldConfidences: Record<string, FieldConsensus> = {}
    const disagreements: Disagreement[] = []

    for (const field of allFields) {
      const fieldResult = this.compareField(field, successful)
      fieldConfidences[field] = fieldResult.consensus
      if (fieldResult.disagreement) {
        disagreements.push(fieldResult.disagreement)
      }
    }

    const consensusData = this.buildConsensusData(fieldConfidences)
    const overallConfidence = this.calculateOverallConfidence(fieldConfidences)
    const recommendation = this.determineRecommendation(overallConfidence, fieldConfidences)

    // Post-validation checks
    const validationDisagreements = this.runPostValidation(consensusData)
    disagreements.push(...validationDisagreements)

    return {
      recommendation,
      overallConfidence,
      consensusData,
      fieldConfidences,
      disagreements,
      providerResults: results,
    }
  }

  private collectAllFields(results: ExtractionProviderResult[]): string[] {
    const fields = new Set<string>()
    for (const result of results) {
      this.collectFieldPaths(result.data, '', fields)
    }
    return Array.from(fields)
  }

  private collectFieldPaths(
    obj: Record<string, unknown>,
    prefix: string,
    fields: Set<string>
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)) {
        this.collectFieldPaths(value as Record<string, unknown>, path, fields)
      } else {
        fields.add(path)
      }
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = obj
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[part]
    }
    return current
  }

  private compareField(
    field: string,
    results: ExtractionProviderResult[]
  ): { consensus: FieldConsensus; disagreement: Disagreement | null } {
    const values: Record<string, unknown> = {}
    for (const result of results) {
      const value = this.getNestedValue(result.data, field)
      if (value !== undefined && value !== null) {
        values[result.providerId] = value
      }
    }

    const providerIds = Object.keys(values)
    if (providerIds.length === 0) {
      return {
        consensus: { value: undefined, confidence: 0, agreedProviders: [], allValues: values },
        disagreement: null,
      }
    }

    if (providerIds.length === 1) {
      return {
        consensus: {
          value: values[providerIds[0]],
          confidence: 0.5,
          agreedProviders: [providerIds[0]],
          allValues: values,
        },
        disagreement: null,
      }
    }

    // Group providers by equivalent values
    const groups = this.groupByEquivalentValues(values)
    const largestGroup = groups.sort((a, b) => b.providers.length - a.providers.length)[0]

    if (largestGroup.providers.length === providerIds.length) {
      // Unanimous
      return {
        consensus: {
          value: largestGroup.value,
          confidence: 1.0,
          agreedProviders: largestGroup.providers,
          allValues: values,
        },
        disagreement: null,
      }
    }

    if (largestGroup.providers.length > 1) {
      // Majority
      return {
        consensus: {
          value: largestGroup.value,
          confidence: 0.8,
          agreedProviders: largestGroup.providers,
          allValues: values,
        },
        disagreement: {
          field,
          values,
          selectedValue: largestGroup.value,
          reason: `Majority agreement (${largestGroup.providers.join(', ')})`,
        },
      }
    }

    // All different - use first provider (Mistral as primary)
    const primaryProvider = providerIds.includes('mistral') ? 'mistral' : providerIds[0]
    return {
      consensus: {
        value: values[primaryProvider],
        confidence: 0.3,
        agreedProviders: [primaryProvider],
        allValues: values,
      },
      disagreement: {
        field,
        values,
        selectedValue: values[primaryProvider],
        reason: `No agreement, using primary provider (${primaryProvider})`,
      },
    }
  }

  private groupByEquivalentValues(
    values: Record<string, unknown>
  ): Array<{ value: unknown; providers: string[] }> {
    const groups: Array<{ value: unknown; providers: string[] }> = []

    for (const [providerId, value] of Object.entries(values)) {
      const matchingGroup = groups.find((g) => this.valuesAreEquivalent(g.value, value))
      if (matchingGroup) {
        matchingGroup.providers.push(providerId)
      } else {
        groups.push({ value, providers: [providerId] })
      }
    }

    return groups
  }

  private valuesAreEquivalent(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (a === null || a === undefined || b === null || b === undefined) return false

    // Numeric comparison with tolerance
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b) <= NUMERIC_TOLERANCE
    }

    // String numeric comparison
    if (typeof a === 'number' && typeof b === 'string') {
      const numB = parseFloat(b)
      if (!isNaN(numB)) return Math.abs(a - numB) <= NUMERIC_TOLERANCE
    }
    if (typeof b === 'number' && typeof a === 'string') {
      const numA = parseFloat(a)
      if (!isNaN(numA)) return Math.abs(numA - b) <= NUMERIC_TOLERANCE
    }

    // String comparison with fuzzy matching
    if (typeof a === 'string' && typeof b === 'string') {
      if (a.toLowerCase().trim() === b.toLowerCase().trim()) return true
      // Date normalization
      const dateA = this.normalizeDate(a)
      const dateB = this.normalizeDate(b)
      if (dateA && dateB && dateA === dateB) return true
      // Fuzzy string match
      return this.stringSimilarity(a, b) >= STRING_SIMILARITY_THRESHOLD
    }

    // Array comparison (shallow)
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((item, index) => this.valuesAreEquivalent(item, b[index]))
    }

    return false
  }

  private normalizeDate(value: string): string | null {
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

    const euMatch = value.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/)
    if (euMatch) return `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`

    return null
  }

  private stringSimilarity(a: string, b: string): number {
    const strA = a.toLowerCase().trim()
    const strB = b.toLowerCase().trim()
    if (strA === strB) return 1.0
    if (strA.length === 0 || strB.length === 0) return 0.0

    const maxLen = Math.max(strA.length, strB.length)
    const distance = this.levenshteinDistance(strA, strB)
    return 1 - distance / maxLen
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = []
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j
    }
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        )
      }
    }
    return matrix[a.length][b.length]
  }

  private buildSingleProviderConfidences(
    result: ExtractionProviderResult
  ): Record<string, FieldConsensus> {
    const confidences: Record<string, FieldConsensus> = {}
    const fields = new Set<string>()
    this.collectFieldPaths(result.data, '', fields)

    for (const field of fields) {
      const value = this.getNestedValue(result.data, field)
      confidences[field] = {
        value,
        confidence: 0.5,
        agreedProviders: [result.providerId],
        allValues: { [result.providerId]: value },
      }
    }
    return confidences
  }

  private buildConsensusData(fieldConfidences: Record<string, FieldConsensus>): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const [path, consensus] of Object.entries(fieldConfidences)) {
      if (consensus.value === undefined) continue
      this.setNestedValue(result, path, consensus.value)
    }

    return result
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.')
    let current = obj
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
        current[parts[i]] = {}
      }
      current = current[parts[i]] as Record<string, unknown>
    }
    current[parts[parts.length - 1]] = value
  }

  private calculateOverallConfidence(fieldConfidences: Record<string, FieldConsensus>): number {
    const confidenceValues = Object.values(fieldConfidences).map((fc) => fc.confidence)
    if (confidenceValues.length === 0) return 0

    return confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length
  }

  private determineRecommendation(
    overallConfidence: number,
    fieldConfidences: Record<string, FieldConsensus>
  ): ConsensusRecommendation {
    const confidenceValues = Object.values(fieldConfidences).map((fc) => fc.confidence)
    const minConfidence = confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0

    if (overallConfidence >= this.config.autoAcceptThreshold && minConfidence >= 0.7) {
      return 'AUTO_ACCEPT'
    }

    if (overallConfidence >= this.config.reviewThreshold || confidenceValues.some((c) => c >= 0.3 && c <= 0.7)) {
      return 'REVIEW'
    }

    return 'MANUAL'
  }

  private runPostValidation(data: Record<string, unknown>): Disagreement[] {
    const issues: Disagreement[] = []

    // Invoice math validation: net + VAT = gross
    const totals = data.totals as Record<string, unknown> | undefined
    if (totals) {
      const net = this.toNumber(totals.net_amount)
      const vat = this.toNumber(totals.vat_amount)
      const gross = this.toNumber(totals.gross_amount)

      if (net !== null && vat !== null && gross !== null) {
        const calculated = net + vat
        if (Math.abs(calculated - gross) > NUMERIC_TOLERANCE) {
          issues.push({
            field: 'totals',
            values: { calculated: calculated.toFixed(2), stated: gross.toFixed(2) },
            selectedValue: gross,
            reason: `Math check failed: net (${net}) + VAT (${vat}) = ${calculated.toFixed(2)}, but gross is ${gross}`,
          })
        }
      }
    }

    // Date sanity: invoice_date <= due_date
    const invoiceDate = data.invoice_date as string | undefined
    const dueDate = data.due_date as string | undefined
    if (invoiceDate && dueDate) {
      const invDate = new Date(invoiceDate)
      const dueDt = new Date(dueDate)
      if (!isNaN(invDate.getTime()) && !isNaN(dueDt.getTime()) && invDate > dueDt) {
        issues.push({
          field: 'dates',
          values: { invoice_date: invoiceDate, due_date: dueDate },
          selectedValue: null,
          reason: `Invoice date (${invoiceDate}) is after due date (${dueDate})`,
        })
      }
    }

    return issues
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const num = parseFloat(value)
      return isNaN(num) ? null : num
    }
    return null
  }
}
