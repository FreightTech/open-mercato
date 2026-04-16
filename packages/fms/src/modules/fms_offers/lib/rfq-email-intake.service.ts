import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsLocation } from '../../fms_locations/data/entities'
import { Contractor } from '../../contractors/data/entities'
import type { RfqExtractionItem } from '../data/validators'
import type { RfqHighlight } from '../data/types'
import { extractRfqFromText, type RfqExtractionResponse } from './rfq-extraction.service'
import { parseInboundEmail } from '@open-mercato/core/modules/inbox_ops/lib/emailParser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmailIntakeInput = {
  from?: string | null
  to?: string | string[] | null
  subject?: string | null
  text?: string | null
  html?: string | null
}

type LocationCatalogEntry = {
  id: string
  name: string
  code: string
  city: string | null
  country: string | null
  locode: string | null
  type: string
}

type ContractorCatalogEntry = {
  id: string
  name: string
  shortName: string | null
  emailDomains: string[]
  contacts: Array<{
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
  }>
}

type EntityCatalog = {
  locations: LocationCatalogEntry[]
  contractors: ContractorCatalogEntry[]
}

export type EntityMatch = {
  field: string
  entityId: string
  entityName: string
  confidence: number
  matchedOn: string
}

export type EmailIntakeResult = {
  rfqInput: {
    title: string | null
    description: string | null
    origin: string | null
    destination: string | null
    originLocationId: string | null
    destinationLocationId: string | null
    direction: string | null
    transportMode: string | null
    companyName: string | null
    contractorId: string | null
    contactPerson: string | null
    contactPersonId: string | null
    senderEmail: string | null
    senderName: string | null
    rawText: string
    extractedData: Record<string, unknown>
    highlights: RfqHighlight[]
    items: Array<RfqExtractionItem & {
      originLocationId?: string | null
      destinationLocationId?: string | null
    }>
  }
  extraction: RfqExtractionResponse
  matches: EntityMatch[]
}

// ---------------------------------------------------------------------------
// Entity Catalog Builder
// ---------------------------------------------------------------------------

const CATALOG_LIMIT = 200

async function buildEntityCatalog(
  em: EntityManager,
  tenantId: string,
  organizationId: string,
): Promise<EntityCatalog> {
  const scopeFilter = { tenantId, organizationId, deletedAt: null }

  const [locations, contractors] = await Promise.all([
    em.find(
      FmsLocation,
      { ...scopeFilter, isActive: true },
      { limit: CATALOG_LIMIT, orderBy: { name: 'asc' }, fields: ['id', 'name', 'code', 'city', 'country', 'locode', 'type'] },
    ),
    em.find(
      Contractor,
      { ...scopeFilter, isActive: true },
      { limit: CATALOG_LIMIT, orderBy: { name: 'asc' }, fields: ['id', 'name', 'shortName'], populate: ['contacts'] },
    ),
  ])

  const contractorEntries: ContractorCatalogEntry[] = contractors.map((c) => {
    const activeContacts = c.contacts.getItems().filter((ct) => ct.isActive)
    const emailDomains = new Set<string>()
    for (const ct of activeContacts) {
      if (ct.email) {
        const domain = ct.email.split('@')[1]?.toLowerCase()
        if (domain) emailDomains.add(domain)
      }
    }
    return {
      id: c.id,
      name: c.name,
      shortName: c.shortName ?? null,
      emailDomains: [...emailDomains],
      contacts: activeContacts.map((ct) => ({
        id: ct.id,
        firstName: ct.firstName ?? null,
        lastName: ct.lastName ?? null,
        email: ct.email ?? null,
      })),
    }
  })

  return {
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      code: l.code,
      city: l.city ?? null,
      country: l.country ?? null,
      locode: l.locode ?? null,
      type: l.type,
    })),
    contractors: contractorEntries,
  }
}

// ---------------------------------------------------------------------------
// Entity Matching (post-LLM)
// ---------------------------------------------------------------------------

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchLocation(
  text: string | null | undefined,
  catalog: LocationCatalogEntry[],
): { location: LocationCatalogEntry; confidence: number; matchedOn: string } | null {
  if (!text || text.trim().length < 2) return null
  const needle = normalizeForMatch(text)

  // Exact name/code match
  for (const loc of catalog) {
    if (normalizeForMatch(loc.name) === needle || normalizeForMatch(loc.code) === needle) {
      return { location: loc, confidence: 0.95, matchedOn: `exact:${loc.name}` }
    }
    if (loc.locode && normalizeForMatch(loc.locode) === needle) {
      return { location: loc, confidence: 0.95, matchedOn: `locode:${loc.locode}` }
    }
  }

  // City match
  for (const loc of catalog) {
    if (loc.city && normalizeForMatch(loc.city) === needle) {
      return { location: loc, confidence: 0.8, matchedOn: `city:${loc.city}` }
    }
  }

  // Substring match (name/city contains the search text or vice versa)
  for (const loc of catalog) {
    const locName = normalizeForMatch(loc.name)
    const locCity = loc.city ? normalizeForMatch(loc.city) : ''
    if (locName.includes(needle) || needle.includes(locName)) {
      return { location: loc, confidence: 0.6, matchedOn: `partial:${loc.name}` }
    }
    if (locCity && (locCity.includes(needle) || needle.includes(locCity))) {
      return { location: loc, confidence: 0.55, matchedOn: `partial-city:${loc.city}` }
    }
  }

  return null
}

function matchContractor(
  companyName: string | null | undefined,
  senderEmail: string | null | undefined,
  catalog: ContractorCatalogEntry[],
): {
  contractor: ContractorCatalogEntry
  contact: ContractorCatalogEntry['contacts'][number] | null
  confidence: number
  matchedOn: string
} | null {
  // Match by email domain first (highest confidence)
  if (senderEmail) {
    const senderDomain = senderEmail.split('@')[1]?.toLowerCase()
    if (senderDomain) {
      for (const c of catalog) {
        if (c.emailDomains.includes(senderDomain)) {
          // Also try to find exact contact
          const contact = c.contacts.find(
            (ct) => ct.email?.toLowerCase() === senderEmail.toLowerCase(),
          ) ?? null
          return { contractor: c, contact, confidence: 0.9, matchedOn: `email-domain:${senderDomain}` }
        }
      }
    }
  }

  // Match by company name
  if (companyName && companyName.trim().length >= 2) {
    const needle = normalizeForMatch(companyName)
    for (const c of catalog) {
      if (normalizeForMatch(c.name) === needle) {
        return { contractor: c, contact: null, confidence: 0.85, matchedOn: `exact-name:${c.name}` }
      }
      if (c.shortName && normalizeForMatch(c.shortName) === needle) {
        return { contractor: c, contact: null, confidence: 0.85, matchedOn: `short-name:${c.shortName}` }
      }
    }

    // Partial name match
    for (const c of catalog) {
      const cName = normalizeForMatch(c.name)
      if (cName.includes(needle) || needle.includes(cName)) {
        return { contractor: c, contact: null, confidence: 0.6, matchedOn: `partial-name:${c.name}` }
      }
    }
  }

  return null
}

function matchContactPerson(
  contactName: string | null | undefined,
  senderEmail: string | null | undefined,
  contractorMatch: ContractorCatalogEntry | null,
): { contactId: string; contactName: string; confidence: number; matchedOn: string } | null {
  if (!contractorMatch) return null

  // Already matched by email domain — check if we found the exact contact
  if (senderEmail) {
    const emailContact = contractorMatch.contacts.find(
      (ct) => ct.email?.toLowerCase() === senderEmail.toLowerCase(),
    )
    if (emailContact) {
      const name = [emailContact.firstName, emailContact.lastName].filter(Boolean).join(' ')
      return { contactId: emailContact.id, contactName: name, confidence: 0.95, matchedOn: `email:${senderEmail}` }
    }
  }

  // Match by name
  if (contactName && contactName.trim().length >= 2) {
    const needle = normalizeForMatch(contactName)
    for (const ct of contractorMatch.contacts) {
      const fullName = normalizeForMatch([ct.firstName, ct.lastName].filter(Boolean).join(' '))
      if (fullName === needle || fullName.includes(needle) || needle.includes(fullName)) {
        const name = [ct.firstName, ct.lastName].filter(Boolean).join(' ')
        return { contactId: ct.id, contactName: name, confidence: 0.75, matchedOn: `name:${name}` }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Main Intake Pipeline
// ---------------------------------------------------------------------------

export async function processEmailToRfq(
  input: EmailIntakeInput,
  em: EntityManager,
  tenantId: string,
  organizationId: string,
): Promise<EmailIntakeResult> {
  // 1. Clean email text
  const parsed = parseInboundEmail({
    from: input.from ?? undefined,
    to: input.to ?? undefined,
    subject: input.subject ?? undefined,
    text: input.text ?? undefined,
    html: input.html ?? undefined,
  })

  const cleanedText = parsed.cleanedText
  if (!cleanedText || cleanedText.trim().length === 0) {
    throw new Error('Email contains no extractable text content')
  }

  // 2. Load tenant entities and run LLM extraction in parallel
  const [catalog, extraction] = await Promise.all([
    buildEntityCatalog(em, tenantId, organizationId),
    extractRfqFromText(cleanedText),
  ])

  const ext = extraction.extraction
  const matches: EntityMatch[] = []

  // 3. Resolve sender email from headers (prefer raw header over LLM extraction)
  const senderEmailFromHeader = parsed.from.email || null
  const resolvedSenderEmail = senderEmailFromHeader || ext.senderEmail || null

  // 4. Match contractor by email domain + company name
  const contractorMatch = matchContractor(
    ext.companyName,
    resolvedSenderEmail,
    catalog.contractors,
  )
  if (contractorMatch) {
    matches.push({
      field: 'contractorId',
      entityId: contractorMatch.contractor.id,
      entityName: contractorMatch.contractor.name,
      confidence: contractorMatch.confidence,
      matchedOn: contractorMatch.matchedOn,
    })
  }

  // 5. Match contact person
  const contactMatch = matchContactPerson(
    ext.contactPerson,
    resolvedSenderEmail,
    contractorMatch?.contractor ?? null,
  )
  if (contactMatch) {
    matches.push({
      field: 'contactPersonId',
      entityId: contactMatch.contactId,
      entityName: contactMatch.contactName,
      confidence: contactMatch.confidence,
      matchedOn: contactMatch.matchedOn,
    })
  }

  // 6. Match locations for the RFQ header (first item's origin/destination as default)
  const firstItem = ext.items?.[0]
  const originMatch = matchLocation(firstItem?.origin, catalog.locations)
  const destMatch = matchLocation(firstItem?.destination, catalog.locations)

  if (originMatch) {
    matches.push({
      field: 'originLocationId',
      entityId: originMatch.location.id,
      entityName: originMatch.location.name,
      confidence: originMatch.confidence,
      matchedOn: originMatch.matchedOn,
    })
  }
  if (destMatch) {
    matches.push({
      field: 'destinationLocationId',
      entityId: destMatch.location.id,
      entityName: destMatch.location.name,
      confidence: destMatch.confidence,
      matchedOn: destMatch.matchedOn,
    })
  }

  // 7. Match locations per item
  const itemsWithLocations = (ext.items || []).map((item) => {
    const itemOrigin = matchLocation(item.origin, catalog.locations)
    const itemDest = matchLocation(item.destination, catalog.locations)
    return {
      ...item,
      originLocationId: itemOrigin?.location.id ?? null,
      destinationLocationId: itemDest?.location.id ?? null,
    }
  })

  // 8. Build sender info from already-parsed email headers
  const senderEmail = resolvedSenderEmail
  const senderName = parsed.from.name || ext.contactPerson || null

  // 9. Build title from subject or extraction summary
  const title = input.subject && input.subject !== '(no subject)'
    ? input.subject
    : ext.summary || 'RFQ from email'

  return {
    rfqInput: {
      title,
      description: ext.summary ?? null,
      origin: firstItem?.origin ?? null,
      destination: firstItem?.destination ?? null,
      originLocationId: originMatch?.location.id ?? null,
      destinationLocationId: destMatch?.location.id ?? null,
      direction: ext.direction as string | null,
      transportMode: firstItem?.transportMode ?? null,
      companyName: ext.companyName ?? null,
      contractorId: contractorMatch?.contractor.id ?? null,
      contactPerson: ext.contactPerson ?? senderName,
      contactPersonId: contactMatch?.contactId ?? null,
      senderEmail,
      senderName,
      rawText: cleanedText,
      extractedData: {
        model: extraction.model,
        tokens: extraction.tokens,
        confidence: ext.confidence,
      },
      highlights: ext.highlights,
      items: itemsWithLocations,
    },
    extraction,
    matches,
  }
}
