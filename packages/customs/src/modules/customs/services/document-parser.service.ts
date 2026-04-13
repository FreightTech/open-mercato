import { GoogleGenerativeAI } from '@google/generative-ai'
import type { NormalizedDocument, DocumentType } from '../data/entities'

const SYSTEM_INSTRUCTION = `You are a customs clearance specialist extracting structured data from shipping
documents. Extract all fields exactly as they appear. Return ONLY a valid JSON
object matching the schema provided.
Rules:
- Use null for missing fields
- Numbers must be numeric types, not strings
- All weights must be in kilograms
- Dates must be ISO 8601 (YYYY-MM-DD)
- Preserve currency codes exactly (USD, CNY, GBP, EUR)
- Preserve quantity units exactly (SETS, UNITS, PCS, PACKAGES, PIECE)
- Extract ALL product lines individually even if descriptions repeat
- VIN numbers, chassis numbers, serial numbers go in vinOrSerial
- Extract HS codes if present anywhere in the document
Language handling:
- All output values MUST be in English
- If the document is in a non-English language, translate field values to English
- Company names, vessel names: transliterate to Latin script, do not translate
- Port names: use standard English name (e.g., Shanghai, Gdynia, Hamburg)
- Product descriptions: translate to English, preserving technical specifications and model numbers
- Preserve original numbers, codes, dates, identifiers, and currency codes exactly as-is
Source verification:
- At the end of your JSON response, include a "_sourceQuotes" object
- For each top-level field you extracted (not productLines), add an entry mapping field name to { "quote": "...", "page": N }
- "quote" must be the EXACT verbatim text snippet from the document that you read to extract that value — copy it character for character
- "page" is the 1-based page number where that text appears
- If a field is null (not found), do NOT include it in _sourceQuotes
- Do NOT include _sourceQuotes entries for the productLines array`

const BL_PROMPT = `Extract from this Bill of Lading or Sea Waybill and return as JSON:
{
  "documentNumber": string | null,
  "shipperName": string | null,
  "shipperAddress": string | null,
  "consigneeName": string | null,
  "consigneeAddress": string | null,
  "notifyParty": string | null,
  "carrierName": string | null,
  "vessel": string | null,
  "voyageNumber": string | null,
  "placeOfReceipt": string | null,
  "loadingPort": string | null,
  "dischargePort": string | null,
  "placeOfDelivery": string | null,
  "shippedOnBoard": string | null,
  "containerNumbers": string[] | null,
  "sealNumbers": string[] | null,
  "totalGrossWeightKg": number | null,
  "totalVolumeCbm": number | null,
  "totalPackages": number | null,
  "freightTerms": string | null,
  "incoterms": string | null,
  "productLines": [
    {
      "lineNumber": number,
      "description": string,
      "model": string | null,
      "vinOrSerial": string | null,
      "engineNumber": string | null,
      "containerNumber": string | null,
      "quantity": number | null,
      "unit": string | null,
      "grossWeightKg": number | null,
      "measurementCbm": number | null,
      "hsCodeFromInvoice": string | null
    }
  ],
  "_sourceQuotes": {
    "[fieldName]": { "quote": "exact verbatim text from document", "page": 1 }
  }
}
Notes:
- "notifyParty": extract the notify party name and address; if "Same as Consignee", write that verbatim
- "carrierName": the carrier or shipping line name
- "sealNumbers": extract seal numbers from container/seal listings
- "placeOfReceipt": the inland place of receipt (may differ from port of loading)
- "placeOfDelivery": the final place of delivery (may differ from port of discharge)
- "freightTerms": e.g. "FREIGHT COLLECT", "FREIGHT PREPAID"
- "containerNumber" in product lines: which container each item is in`

const INVOICE_PROMPT = `Extract from this Commercial Invoice and return as JSON:
{
  "documentNumber": string | null,
  "documentDate": string | null,
  "shipperName": string | null,
  "shipperAddress": string | null,
  "buyerName": string | null,
  "buyerAddress": string | null,
  "consigneeName": string | null,
  "consigneeAddress": string | null,
  "vessel": string | null,
  "loadingPort": string | null,
  "dischargePort": string | null,
  "incoterms": string | null,
  "currency": string | null,
  "totalValue": number | null,
  "totalGrossWeightKg": number | null,
  "totalNetWeightKg": number | null,
  "totalPackages": number | null,
  "contractReference": string | null,
  "paymentTerms": string | null,
  "productLines": [
    {
      "lineNumber": number,
      "description": string,
      "model": string | null,
      "vinOrSerial": string | null,
      "engineNumber": string | null,
      "containerNumber": string | null,
      "countryOfOrigin": string | null,
      "quantity": number,
      "unit": string,
      "unitPrice": number | null,
      "totalValue": number | null,
      "currency": string | null,
      "netWeightKg": number | null,
      "grossWeightKg": number | null,
      "hsCodeFromInvoice": string | null,
      "incoterms": string | null
    }
  ],
  "_sourceQuotes": {
    "[fieldName]": { "quote": "exact verbatim text from document", "page": 1 }
  }
}
Notes:
- "buyerName": the buyer/purchaser (may be labeled "Buyer", "Sold To", "Purchaser"); distinct from consignee
- "buyerAddress": full address of the buyer including city, country, postal code
- "contractReference": contract number or reference (e.g. "Contract from 10 December 2025")
- "paymentTerms": payment terms (e.g. "100% prepayment before delivery", "Net 30")
- "containerNumber" in product lines: which container each item is in`

const PACKING_LIST_PROMPT = `Extract from this Packing List and return as JSON:
{
  "documentDate": string | null,
  "invoiceReference": string | null,
  "shipperName": string | null,
  "shipperAddress": string | null,
  "buyerName": string | null,
  "buyerAddress": string | null,
  "vessel": string | null,
  "loadingPort": string | null,
  "dischargePort": string | null,
  "totalPackages": number | null,
  "totalNetWeightKg": number | null,
  "totalGrossWeightKg": number | null,
  "totalVolumeCbm": number | null,
  "productLines": [
    {
      "lineNumber": number,
      "description": string,
      "model": string | null,
      "vinOrSerial": string | null,
      "engineNumber": string | null,
      "containerNumber": string | null,
      "packages": number | null,
      "quantity": number | null,
      "unit": string | null,
      "netWeightKg": number | null,
      "grossWeightKg": number | null,
      "measurementCbm": number | null
    }
  ],
  "_sourceQuotes": {
    "[fieldName]": { "quote": "exact verbatim text from document", "page": 1 }
  }
}
Notes:
- "buyerName": the buyer/purchaser if listed (may be labeled "Buyer", "Sold To")
- "buyerAddress": full address of the buyer
- "totalVolumeCbm": total volume/measurement in cubic meters (CBM)
- "measurementCbm": per-line volume in CBM
- "containerNumber" in product lines: which container each item is in`

const PROMPTS: Record<DocumentType, string> = {
  bill_of_lading: BL_PROMPT,
  commercial_invoice: INVOICE_PROMPT,
  packing_list: PACKING_LIST_PROMPT,
}

export class DocumentParserService {
  private genAI: GoogleGenerativeAI | null = null

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

  async parseDocument(
    pdfBase64: string,
    documentType: DocumentType,
  ): Promise<{ extracted: NormalizedDocument | null; parseError: string | null }> {
    try {
      const model = this.getGenAI().getGenerativeModel({
        model: 'gemini-3.1-flash-lite-preview',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 8192,
        },
        systemInstruction: SYSTEM_INSTRUCTION,
      })

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64,
          },
        },
        { text: PROMPTS[documentType] },
      ])

      const responseText = result.response.text()
      const extracted = JSON.parse(responseText) as NormalizedDocument
      return { extracted, parseError: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[customs] Failed to parse ${documentType}:`, message)
      return { extracted: null, parseError: message }
    }
  }

  /**
   * Use AI to detect the document type from PDF content.
   * Used as a fallback when filename-based detection fails (e.g., UUID filenames).
   */
  async detectDocumentType(pdfBase64: string): Promise<DocumentType | null> {
    const result = await this.detectDocumentTypeAndIdentifiers(pdfBase64)
    return result?.type ?? null
  }

  /**
   * Use AI to detect the document type AND extract key identifiers from PDF content.
   * Identifiers (BL number, invoice number, shipper, vessel) are used for smart grouping
   * when filenames don't carry semantic meaning.
   */
  async detectDocumentTypeAndIdentifiers(
    pdfBase64: string,
  ): Promise<{ type: DocumentType; blNumber?: string; invoiceNumber?: string; shipperName?: string; vessel?: string } | null> {
    try {
      const model = this.getGenAI().getGenerativeModel({
        model: 'gemini-3.1-flash-lite-preview',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 512,
        },
      })

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64,
          },
        },
        {
          text: `Classify this shipping/customs document and extract key identifiers. Return JSON:
{
  "type": "bill_of_lading" | "commercial_invoice" | "packing_list" | "unknown",
  "blNumber": "B/L or Sea Waybill number if visible, else null",
  "invoiceNumber": "invoice number or reference if visible, else null",
  "shipperName": "shipper/exporter/seller company name if visible, else null",
  "vessel": "vessel/ship name if visible, else null"
}

Rules:
- "bill_of_lading": Bill of Lading, Sea Waybill, B/L, transport document with carrier/vessel/port info
- "commercial_invoice": Commercial Invoice, Faktura, document with prices/values/payment terms
- "packing_list": Packing List, document with package dimensions/weights/container details
- "unknown": if you cannot determine the type
- Extract identifiers even if they appear as references (e.g., "Invoice No." on a packing list)
- Return null for identifiers not found in the document`,
        },
      ])

      const responseText = result.response.text()
      const parsed = JSON.parse(responseText) as {
        type: string
        blNumber?: string | null
        invoiceNumber?: string | null
        shipperName?: string | null
        vessel?: string | null
      }

      if (
        parsed.type === 'bill_of_lading' ||
        parsed.type === 'commercial_invoice' ||
        parsed.type === 'packing_list'
      ) {
        return {
          type: parsed.type,
          blNumber: parsed.blNumber ?? undefined,
          invoiceNumber: parsed.invoiceNumber ?? undefined,
          shipperName: parsed.shipperName ?? undefined,
          vessel: parsed.vessel ?? undefined,
        }
      }

      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[customs] AI document type detection failed:', message)
      return null
    }
  }
}
