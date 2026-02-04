import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createGooglePlacesService } from '../../../services/google-places.service'

const querySchema = z.object({
  input: z.string().min(1, 'Search input is required'),
  types: z.string().optional(),
  language: z.string().optional(),
  region: z.string().optional(),
  sessionToken: z.string().optional(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_locations.ports.view'] },
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const rawParams = Object.fromEntries(url.searchParams.entries())

  const parse = querySchema.safeParse(rawParams)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error.issues },
      { status: 400 }
    )
  }

  const placesService = createGooglePlacesService()
  if (!placesService) {
    return NextResponse.json(
      { error: 'Google Places API is not configured', available: false },
      { status: 503 }
    )
  }

  try {
    const suggestions = await placesService.autocomplete({
      input: parse.data.input,
      types: parse.data.types?.split(','),
      language: parse.data.language,
      region: parse.data.region,
      sessionToken: parse.data.sessionToken,
    })

    console.log('[Places Autocomplete] Input:', parse.data.input)
    console.log('[Places Autocomplete] Suggestions count:', suggestions?.length ?? 0)
    if (suggestions?.length > 0) {
      console.log('[Places Autocomplete] First suggestion:', suggestions[0])
    }

    return NextResponse.json({
      suggestions,
      available: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch suggestions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
