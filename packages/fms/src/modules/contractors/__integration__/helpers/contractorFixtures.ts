import type { APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

export interface CreateContractorInput {
  name: string
  shortName?: string
  officialName?: string
  taxId?: string
  regon?: string
  krs?: string
  isActive?: boolean
  roleTypeIds?: string[]
}

export interface ContractorRecord {
  id: string
  name: string
  shortName?: string | null
  officialName?: string | null
  taxId?: string | null
  regon?: string | null
  krs?: string | null
  isActive: boolean
  createdAt?: string
  updatedAt?: string
  addresses?: Array<Record<string, unknown>>
  contacts?: Array<Record<string, unknown>>
  bankAccounts?: Array<Record<string, unknown>>
  creditLimit?: Record<string, unknown> | null
  roles?: Array<Record<string, unknown>>
}

export async function createContractorFixture(
  request: APIRequestContext,
  token: string,
  input: CreateContractorInput
): Promise<ContractorRecord | null> {
  const response = await request.fetch(`${BASE_URL}/api/contractors/contractors`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(input),
  })

  if (!response.ok()) {
    console.error('Failed to create contractor:', await response.text())
    return null
  }

  const body = await response.json()
  const id = body.id ?? body.item?.id
  if (!id) return null

  // POST only returns { id }, fetch the full record
  return getContractorById(request, token, id)
}

export async function getContractorById(
  request: APIRequestContext,
  token: string,
  contractorId: string
): Promise<ContractorRecord | null> {
  const response = await request.fetch(
    `${BASE_URL}/api/contractors/contractors/${contractorId}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!response.ok()) return null

  const body = await response.json()
  if (body && typeof body.id === 'string') return body as ContractorRecord
  return null
}

export async function updateContractorFixture(
  request: APIRequestContext,
  token: string,
  contractorId: string,
  updates: Partial<CreateContractorInput>
): Promise<boolean> {
  const response = await request.fetch(
    `${BASE_URL}/api/contractors/contractors/${contractorId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(updates),
    }
  )

  if (!response.ok()) {
    console.error('Failed to update contractor:', await response.text())
    return false
  }
  return true
}

export async function createContactFixture(
  request: APIRequestContext,
  token: string,
  data: { contractorId: string; firstName: string; lastName: string; email?: string; phone?: string; isPrimary?: boolean }
): Promise<{ id: string } | null> {
  const response = await request.fetch(`${BASE_URL}/api/contractors/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
  })

  if (!response.ok()) {
    console.error('Failed to create contact:', await response.text())
    return null
  }

  const body = await response.json()
  return (body.item ?? body) as { id: string }
}

export async function createAddressFixture(
  request: APIRequestContext,
  token: string,
  data: {
    contractorId: string
    purpose?: string
    addressLine?: string
    city?: string
    postalCode?: string
    country?: string
    isPrimary?: boolean
  }
): Promise<{ id: string } | null> {
  const response = await request.fetch(`${BASE_URL}/api/contractors/addresses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
  })

  if (!response.ok()) {
    console.error('Failed to create address:', await response.text())
    return null
  }

  const body = await response.json()
  return (body.item ?? body) as { id: string }
}

export async function deleteContractorIfExists(
  request: APIRequestContext,
  token: string | null,
  contractorId: string | null
): Promise<void> {
  if (!token || !contractorId) return

  try {
    await request.fetch(`${BASE_URL}/api/contractors/contractors/${contractorId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Best-effort cleanup
  }
}
