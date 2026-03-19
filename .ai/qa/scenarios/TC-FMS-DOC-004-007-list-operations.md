# Test Scenario: Document List Operations

## Test ID
TC-FMS-DOC-004-007

## Category
FMS Documents

## Priority
High

## Type
API Test

## Description
Tests the document list API for pagination, search, filtering, and sorting capabilities. This consolidated test covers four related test cases:
- TC-FMS-DOC-004: Pagination
- TC-FMS-DOC-005: Search by text
- TC-FMS-DOC-006: Filter by category
- TC-FMS-DOC-007: Sort by field

## Prerequisites
- User is authenticated as superadmin
- FMS Documents module is enabled
- Test documents created via fixture setup (invoices, bills of lading, booking confirmations)

## API Endpoint
`GET /api/fms_documents/documents`

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (1-indexed) |
| `limit` | number | Items per page (default: 50) |
| `search` | string | Free-text search across name, description, document number, BL number, etc. |
| `category` | string | Filter by document category |
| `sortBy` | string | Field to sort by |
| `sortOrder` | string | `asc` or `desc` |

## Test Steps

### TC-FMS-DOC-004: Pagination
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create 7+ test documents with unique prefix | Documents created successfully |
| 2 | GET /api/fms_documents/documents?search={prefix}&page=1&limit=3 | Returns max 3 items, total >= 5, page = 1 |
| 3 | GET /api/fms_documents/documents?search={prefix}&page=2&limit=3 | Returns page 2 with different items than page 1 |
| 4 | Verify totalPages calculation | totalPages = ceil(total / limit) |

### TC-FMS-DOC-005: Search
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /api/fms_documents/documents?search={prefix}-invoice | Returns only documents with "invoice" in name |
| 2 | GET /api/fms_documents/documents?search=Alpha | Returns documents with "Alpha" in name, seller, or vessel |
| 3 | GET /api/fms_documents/documents?search=BL001 | Returns document with matching BL number |
| 4 | GET /api/fms_documents/documents?search=nonexistent | Returns empty results |

### TC-FMS-DOC-006: Filter by Category
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /api/fms_documents/documents?search={prefix}&category=invoice | Returns only invoices |
| 2 | GET /api/fms_documents/documents?search={prefix}&category=bill_of_lading | Returns only bills of lading |
| 3 | GET /api/fms_documents/documents?search={prefix}&category=booking_confirmation | Returns only booking confirmations |
| 4 | Verify each result has matching category | All items have category === filter value |

### TC-FMS-DOC-007: Sort
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /api/fms_documents/documents?search={prefix}&sortBy=name&sortOrder=asc | Results sorted A-Z by name |
| 2 | GET /api/fms_documents/documents?search={prefix}&sortBy=name&sortOrder=desc | Results sorted Z-A by name |
| 3 | GET /api/fms_documents/documents?search={prefix}&sortBy=createdAt&sortOrder=desc | Newest first |
| 4 | GET /api/fms_documents/documents?search={prefix}&sortBy=totalGrossAmount&sortOrder=desc | Highest amount first |

## Expected Results
- Pagination returns correct page metadata (page, limit, total, totalPages)
- Search filters results across multiple text fields
- Category filter returns only matching documents
- Sort orders results correctly in both directions
- Empty search/filter returns appropriate empty results

## Edge Cases / Error Scenarios
- Page number exceeds available pages: returns empty items array
- Invalid category value: returns 400 or filters as no match
- Invalid sort field: falls back to default sort or returns error
- Negative page number: returns 400 error
- Limit exceeds maximum (100): capped or returns error

## Response Schema
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "string",
      "category": "invoice|bill_of_lading|booking_confirmation|...",
      "documentNumber": "string|null",
      "blNumber": "string|null",
      "vesselName": "string|null",
      "sellerName": "string|null",
      "totalGrossAmount": "number|null",
      "createdAt": "ISO8601"
    }
  ],
  "total": "number",
  "page": "number",
  "pageSize": "number",
  "totalPages": "number"
}
```
