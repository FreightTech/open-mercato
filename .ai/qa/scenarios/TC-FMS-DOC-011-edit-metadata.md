# Test Scenario: Edit Document Metadata

## Test ID
TC-FMS-DOC-011

## Category
FMS Documents

## Priority
High

## Type
API Test

## Description
Verify that users can update document metadata fields (name, category, description) via the API. These are basic document properties that don't require AI extraction.

## Prerequisites
- User is authenticated as superadmin
- FMS Documents module is enabled
- User has `fms_documents.manage` feature permission

## API Endpoint
`PUT /api/fms_documents/documents/{id}`

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Document ID to update |

### Request Body
```json
{
  "name": "string (optional)",
  "category": "string enum (optional)",
  "description": "string (optional, nullable)"
}
```

### Valid Categories
- `offer`
- `invoice`
- `customs_declaration`
- `bill_of_lading`
- `booking_confirmation`
- `delivery_note`
- `packing_list`
- `vgm_certificate`
- `other`

## Test Steps

### Update Document Name
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a test document with name "Original Name" | Document created |
| 2 | PUT with `{ "name": "Updated Name" }` | Returns updated document |
| 3 | Verify response name equals "Updated Name" | Name field updated |
| 4 | GET document by ID | Confirms persisted change |

### Update Document Category
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a test document with category "invoice" | Document created |
| 2 | PUT with `{ "category": "bill_of_lading" }` | Returns updated document |
| 3 | Verify response category equals "bill_of_lading" | Category field updated |

### Update Document Description
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a test document with description "Original" | Document created |
| 2 | PUT with `{ "description": "Updated description" }` | Returns updated document |
| 3 | Verify response description equals "Updated description" | Description field updated |

### Clear Description (Set to Null)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a test document with description "Has description" | Document created |
| 2 | PUT with `{ "description": null }` | Returns updated document |
| 3 | Verify response description is null | Description cleared |

### Update Multiple Fields
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a test document | Document created |
| 2 | PUT with `{ "name": "New Name", "category": "packing_list", "description": "New desc" }` | Returns updated document |
| 3 | Verify all three fields updated | All changes persisted |

### Partial Update (Only Name)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create document with name "A", category "invoice", description "Desc" | Document created |
| 2 | PUT with `{ "name": "B" }` | Returns updated document |
| 3 | Verify name is "B", category still "invoice", description still "Desc" | Only specified field changed |

## Expected Results
- PUT returns HTTP 200 with updated document
- Only specified fields are modified
- Unspecified fields retain their original values
- Changes are persisted and visible in subsequent GET requests
- updatedAt timestamp is refreshed

## Edge Cases / Error Scenarios

### Invalid Category Value
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | PUT with `{ "category": "invalid_category" }` | Returns 400 Bad Request |

### Name Too Long
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | PUT with name exceeding 500 characters | Returns 400 Bad Request |

### Empty Name
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | PUT with `{ "name": "" }` | Returns 400 Bad Request |

### Non-existent Document
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | PUT to non-existent document ID | Returns 404 Not Found |

## Response Schema

### Success Response (200)
```json
{
  "id": "uuid",
  "name": "string",
  "category": "string",
  "description": "string|null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### Error Response (400)
```json
{
  "error": "Invalid request body",
  "details": {
    "issues": [...]
  }
}
```

### Error Response (404)
```json
{
  "error": "Document not found"
}
```
