import type { APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * Deletes a document by ID if it exists. Safe for use in cleanup/finally blocks.
 */
export async function deleteDocumentIfExists(
  request: APIRequestContext,
  token: string | null,
  documentId: string | null
): Promise<void> {
  if (!token || !documentId) return

  try {
    await request.fetch(`${BASE_URL}/api/fms_documents/documents/${documentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Best-effort cleanup - ignore errors
  }
}

/**
 * Lists documents matching an optional search query.
 */
export async function listDocuments(
  request: APIRequestContext,
  token: string,
  options?: { search?: string; category?: string }
): Promise<Array<{ id: string; name: string; category?: string; bookingNumber?: string }>> {
  const params = new URLSearchParams()
  if (options?.search) params.set('search', options.search)
  if (options?.category) params.set('category', options.category)

  const queryString = params.toString()
  const url = `${BASE_URL}/api/fms_documents/documents${queryString ? `?${queryString}` : ''}`

  const response = await request.fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    return []
  }

  const body = (await response.json()) as {
    items?: Array<{ id: string; name: string; category?: string; bookingNumber?: string }>
  }
  return body.items ?? []
}

/**
 * Gets a document by ID.
 */
export async function getDocumentById(
  request: APIRequestContext,
  token: string,
  documentId: string
): Promise<Record<string, unknown> | null> {
  const response = await request.fetch(
    `${BASE_URL}/api/fms_documents/documents/${documentId}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!response.ok()) {
    return null
  }

  const body = (await response.json()) as { item?: Record<string, unknown> }
  return body.item ?? null
}

/**
 * Finds a document by name in the list.
 */
export async function findDocumentByName(
  request: APIRequestContext,
  token: string,
  documentName: string
): Promise<{ id: string; name: string } | null> {
  const documents = await listDocuments(request, token, { search: documentName })
  return documents.find((doc) => doc.name === documentName) ?? null
}
