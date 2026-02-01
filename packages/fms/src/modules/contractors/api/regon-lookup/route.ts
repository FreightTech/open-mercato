import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createRegonApiService, RegonApiService } from '../../services/regon-api.service'

const querySchema = z.object({
  nip: z.string().optional(),
  regon: z.string().optional(),
}).refine(
  (data) => data.nip || data.regon,
  { message: 'Either nip or regon must be provided' }
)

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.create'] },
}

export interface RegonLookupResponse {
  available: boolean
  company: {
    regon: string
    nip: string
    krs?: string | null
    name: string
    shortName?: string | null
    address: {
      addressLine: string | null
      city: string | null
      state: string | null
      postalCode: string | null
      country: string | null
    }
    registrationDate?: string | null
    pkdMainCode?: string | null
    pkdMainDescription?: string | null
  } | null
  error?: string
}

export async function GET(req: Request): Promise<NextResponse<RegonLookupResponse>> {
  // Check if service is available
  if (!RegonApiService.isAvailable()) {
    return NextResponse.json(
      { available: false, company: null, error: 'REGON API is not configured' },
      { status: 503 }
    )
  }

  const url = new URL(req.url)
  const nip = url.searchParams.get('nip') || undefined
  const regon = url.searchParams.get('regon') || undefined

  const parsed = querySchema.safeParse({ nip, regon })
  if (!parsed.success) {
    return NextResponse.json(
      { available: true, company: null, error: 'Either NIP or REGON must be provided' },
      { status: 400 }
    )
  }

  // Validate NIP format
  if (nip) {
    const cleanNip = nip.replace(/[^0-9]/g, '')
    if (cleanNip.length !== 10) {
      return NextResponse.json(
        { available: true, company: null, error: 'Invalid NIP format. NIP must be 10 digits.' },
        { status: 400 }
      )
    }
  }

  // Validate REGON format
  if (regon) {
    const cleanRegon = regon.replace(/[^0-9]/g, '')
    if (cleanRegon.length !== 9 && cleanRegon.length !== 14) {
      return NextResponse.json(
        { available: true, company: null, error: 'Invalid REGON format. REGON must be 9 or 14 digits.' },
        { status: 400 }
      )
    }
  }

  const service = createRegonApiService()
  if (!service) {
    return NextResponse.json(
      { available: false, company: null, error: 'REGON API is not configured' },
      { status: 503 }
    )
  }

  try {
    let companyData
    if (nip) {
      companyData = await service.searchByNip(nip)
    } else if (regon) {
      companyData = await service.searchByRegon(regon)
    }

    console.log('[REGON API] Raw company data from REGON:', JSON.stringify(companyData, null, 2))

    if (!companyData) {
      return NextResponse.json({
        available: true,
        company: null,
      })
    }

    // Build address line from street and building/apartment numbers
    let addressLine: string | null = null
    if (companyData.street) {
      const parts = [companyData.street]
      if (companyData.buildingNumber) {
        parts.push(companyData.buildingNumber)
        if (companyData.apartmentNumber) {
          parts.push(`/ ${companyData.apartmentNumber}`)
        }
      }
      addressLine = parts.join(' ')
    }

    return NextResponse.json({
      available: true,
      company: {
        regon: companyData.regon,
        nip: companyData.nip,
        krs: companyData.krs,
        name: companyData.name,
        shortName: companyData.shortName,
        address: {
          addressLine,
          city: companyData.city ?? null,
          state: companyData.voivodeship ?? null,
          postalCode: companyData.postalCode ?? null,
          country: companyData.country ?? 'Poland',
        },
        registrationDate: companyData.registrationDate,
        pkdMainCode: companyData.pkdMainCode,
        pkdMainDescription: companyData.pkdMainDescription,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    // Log the error for debugging
    console.error('[REGON API Error]', {
      nip,
      regon,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { available: true, company: null, error: `NIP lookup failed: ${message}` },
      { status: 502 }
    )
  }
}
