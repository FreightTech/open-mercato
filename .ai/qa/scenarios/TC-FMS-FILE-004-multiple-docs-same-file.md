# Test Scenario: Multiple Documents Linked to Same File

## Test ID
TC-FMS-FILE-004

## Category
FMS Files / Documents Integration

## Priority
Medium

## Type
API Test

## Description
Verify that multiple documents with matching identifiers all get linked to the same project. The first booking confirmation creates the project, and subsequent documents (B/L, invoice) are auto-linked to it.

## Prerequisites
- User authenticated as superadmin
- FMS Documents and FMS Projects modules enabled
- Feature flag `fms.auto_create_project_from_booking` enabled

## API Endpoints
- `POST /api/fms_documents/upload` - Upload documents
- `GET /api/fms_documents/documents/:id` - Get document details
- `GET /api/fms_documents/documents?relatedEntityId=:projectId` - List docs for project
- `GET /api/fms_projects/projects/:id` - Get project

## Test Steps
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate unique booking number BK-MULTI-{timestamp} | Unique identifier for all docs |
| 2 | Create booking confirmation PDF with this bookingNumber | PDF created |
| 3 | Upload booking confirmation | Document created, processing starts |
| 4 | Wait for processing to complete | Project auto-created, doc linked |
| 5 | Capture created project ID from document.relatedEntityId | Project ID known |
| 6 | Create B/L PDF with same bookingNumber | Second PDF created |
| 7 | Upload B/L document | Document created |
| 8 | Wait for B/L processing | B/L processed |
| 9 | Verify B/L linked to same project ID | relatedEntityId matches |
| 10 | Create invoice PDF with same bookingNumber | Third PDF created |
| 11 | Upload invoice document | Document created |
| 12 | Wait for invoice processing | Invoice processed |
| 13 | Verify invoice linked to same project ID | relatedEntityId matches |
| 14 | List all documents for project | Should return 3 documents |
| 15 | Verify only 1 project exists with this bookingNumber | No duplicates |
| 16 | Delete all 3 documents | Cleanup |
| 17 | Delete project | Cleanup |

## Expected Results
- 1 FmsProject created (from booking confirmation)
- 3 documents all linked to same project:
  - Booking confirmation (category='booking_confirmation')
  - B/L (category='bill_of_lading')
  - Invoice (category='invoice')
- All documents have same relatedEntityId
- No duplicate projects

## Document Flow
```
1. Booking Confirmation Upload
   └─> auto-create-from-booking: Creates Project, links doc
   
2. B/L Upload (same booking number)
   └─> auto-link-to-project: Finds project, links doc
   
3. Invoice Upload (same booking number)
   └─> auto-link-to-project: Finds project, links doc
```

## Edge Cases / Error Scenarios
- Upload order reversed (B/L first, then booking): B/L unlinked initially, then when booking creates project, B/L should be linked via findMatchingDocumentIds
- Concurrent uploads: Race condition possible, but should still result in 1 project

## Technical Notes
- The `auto-create-from-booking` subscriber also calls `findMatchingDocumentIds()` to link OTHER existing documents to the newly created project
- This covers the case where B/L was uploaded BEFORE the booking confirmation
