# Test Scenario: Save Edited Extracted Data

## Test ID
TC-FMS-DOC-013

## Category
FMS Documents

## Priority
High

## Type
API Test

## Description
Verify that users can update extracted/shipping-related fields on documents via the API. These fields are typically populated by AI extraction but can also be manually edited or corrected by users.

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

### Editable Extracted Fields
| Field | Type | Description |
|-------|------|-------------|
| `blNumber` | string | Bill of Lading number |
| `mblNumber` | string | Master Bill of Lading number |
| `bookingNumber` | string | Booking confirmation number |
| `vesselName` | string | Vessel/ship name |
| `voyageNumber` | string | Voyage number |
| `portOfLoading` | string | Port of Loading (POL) |
| `portOfDischarge` | string | Port of Discharge (POD) |
| `sellerName` | string | Seller/shipper name |
| `buyerName` | string | Buyer/consignee name |
| `totalGrossAmount` | number | Total gross amount |
| `currency` | string | Currency code (e.g., USD, EUR) |
| `documentNumber` | string | Generic document number |

## Test Steps

### Update BL Number
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a bill_of_lading document | Document created |
| 2 | PUT with `{ "blNumber": "MAEU1234567890" }` | Returns updated document |
| 3 | Verify blNumber equals "MAEU1234567890" | Field updated |
| 4 | GET document by ID | Confirms persisted change |

### Update Booking Number
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a booking_confirmation document | Document created |
| 2 | PUT with `{ "bookingNumber": "BKG2024-001234" }` | Returns updated document |
| 3 | Verify bookingNumber equals "BKG2024-001234" | Field updated |

### Update Vessel Name
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a document | Document created |
| 2 | PUT with `{ "vesselName": "MSC MEDITERRANEAN" }` | Returns updated document |
| 3 | Verify vesselName equals "MSC MEDITERRANEAN" | Field updated |

### Update Ports (POL and POD)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a document | Document created |
| 2 | PUT with `{ "portOfLoading": "SHANGHAI (CNSHA)", "portOfDischarge": "ROTTERDAM (NLRTM)" }` | Returns updated document |
| 3 | Verify both port fields updated | Fields updated |

### Update Seller and Buyer
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create an invoice document | Document created |
| 2 | PUT with `{ "sellerName": "Acme Corp", "buyerName": "Global Trade Inc" }` | Returns updated document |
| 3 | Verify seller and buyer names updated | Fields updated |

### Update Amount and Currency
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create an invoice document | Document created |
| 2 | PUT with `{ "totalGrossAmount": 15000.50, "currency": "EUR" }` | Returns updated document |
| 3 | Verify amount is 15000.50 and currency is "EUR" | Fields updated |

### Clear Extracted Fields (Set to Null)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a document with vesselName set | Document created |
| 2 | PUT with `{ "vesselName": null }` | Returns updated document |
| 3 | Verify vesselName is null | Field cleared |

### Update Multiple Extracted Fields
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a bill_of_lading document | Document created |
| 2 | PUT with full shipping data: blNumber, vesselName, voyageNumber, POL, POD | Returns updated document |
| 3 | Verify all fields updated | All changes persisted |

## Expected Results
- PUT returns HTTP 200 with updated document
- Extracted fields can be set, updated, or cleared
- Changes are persisted and visible in subsequent GET requests
- updatedAt timestamp is refreshed
- Fields are searchable after update (if search indexing enabled)

## Edge Cases / Error Scenarios

### Invalid Currency Code
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | PUT with `{ "currency": "INVALID" }` | May accept (no strict validation) or return 400 |

### Negative Amount
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | PUT with `{ "totalGrossAmount": -100 }` | May accept or return 400 depending on validation |

### Very Long Field Values
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | PUT with vesselName exceeding field limit | Returns 400 Bad Request |

### Invalid Number Format
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | PUT with `{ "totalGrossAmount": "not-a-number" }` | Returns 400 Bad Request |

## Response Schema

### Success Response (200)
```json
{
  "id": "uuid",
  "name": "string",
  "category": "string",
  "blNumber": "string|null",
  "mblNumber": "string|null",
  "bookingNumber": "string|null",
  "vesselName": "string|null",
  "voyageNumber": "string|null",
  "portOfLoading": "string|null",
  "portOfDischarge": "string|null",
  "sellerName": "string|null",
  "buyerName": "string|null",
  "totalGrossAmount": "number|null",
  "currency": "string|null",
  "documentNumber": "string|null",
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

## Notes
- These fields are typically populated by AI extraction during upload
- Manual editing allows users to correct extraction errors
- Changes should trigger search reindexing if document is searchable
- Audit trail should capture who made changes and when
