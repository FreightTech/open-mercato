import type { APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

export interface CreateProductInput {
  name: string
  chargeCode?: string | null
  chargeUnit?: 'container' | 'file' | 'weight_measure' | 'cargo_value_percent' | null
  transportMode?: 'sea' | 'air' | 'rail' | null
  isActive?: boolean
}

export interface ProductRecord {
  id: string
  name: string
  chargeCode: string | null
  chargeUnit: string | null
  transportMode: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
}

/**
 * Creates a product (FmsProduct) via API.
 */
export async function createProductFixture(
  request: APIRequestContext,
  token: string,
  input: CreateProductInput
): Promise<ProductRecord | null> {
  const payload = {
    name: input.name,
    chargeCode: input.chargeCode ?? null,
    chargeUnit: input.chargeUnit ?? null,
    transportMode: input.transportMode ?? null,
    isActive: input.isActive ?? true,
  }

  const response = await request.fetch(`${BASE_URL}/api/fms_products/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(payload),
  })

  if (!response.ok()) {
    console.error('Failed to create product:', await response.text())
    return null
  }

  const body = (await response.json()) as { id?: string; name?: string }
  if (body.id) {
    return {
      id: body.id,
      name: body.name || input.name,
      chargeCode: input.chargeCode ?? null,
      chargeUnit: input.chargeUnit ?? null,
      transportMode: input.transportMode ?? null,
      isActive: input.isActive ?? true,
      createdAt: null,
      updatedAt: null,
    }
  }
  return null
}

/**
 * Lists products matching an optional search query.
 */
export async function listProducts(
  request: APIRequestContext,
  token: string,
  options?: { q?: string }
): Promise<{ items: ProductRecord[]; total: number }> {
  const params = new URLSearchParams()
  if (options?.q) params.set('q', options.q)

  const queryString = params.toString()
  const url = `${BASE_URL}/api/fms_products/products${queryString ? `?${queryString}` : ''}`

  const response = await request.fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    return { items: [], total: 0 }
  }

  const body = (await response.json()) as { items?: ProductRecord[]; total?: number }
  return { items: body.items ?? [], total: body.total ?? 0 }
}

/**
 * Deletes a product by ID if it exists. Safe for use in cleanup/finally blocks.
 */
export async function deleteProductIfExists(
  request: APIRequestContext,
  token: string | null,
  productId: string | null
): Promise<void> {
  if (!token || !productId) return

  try {
    await request.fetch(`${BASE_URL}/api/fms_products/products/${productId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Deletes multiple products. Useful for cleanup after batch operations.
 */
export async function deleteProductsIfExist(
  request: APIRequestContext,
  token: string | null,
  productIds: string[]
): Promise<void> {
  if (!token) return
  for (const id of productIds) {
    await deleteProductIfExists(request, token, id)
  }
}
