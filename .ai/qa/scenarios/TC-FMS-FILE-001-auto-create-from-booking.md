# Test Scenario: Auto-Create File from Booking Confirmation

## Test ID
TC-FMS-FILE-001

## Category
FMS Files / Documents Integration

## Priority
High

## Type
API Test

## Description
Verify that uploading a booking confirmation document with AI extraction enabled automatically creates a new FmsProject (file) and links the document to it. This tests the core auto-creation flow triggered by the `auto-create-from-booking` subscriber.

## Prerequisites
- User authenticated as superadmin
- FMS Documents and FMS Projects modules enabled
- Feature flag `fms.auto_create_project_from_booking` enabled (default)
- AI extraction services available

## API Endpoints
- `POST /api/fms_documents/upload` - Upload document with AI extraction
- `GET /api/fms_documents/documents/:id` - Get document details
- `GET /api/fms_projects/projects/:id` - Get project details

## Test Steps
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate a booking confirmation PDF with known booking number (e.g., BK12345678) | PDF created with extractable content |
| 2 | Upload document via POST /api/fms_documents/upload with enableAiExtraction=true | Document created, HTTP 200/201 |
| 3 | Poll GET /api/fms_documents/documents/:id until processedAt is populated | Document processing completes |
| 4 | Verify document category is 'booking_confirmation' | AI correctly detected document type |
| 5 | Verify document has relatedEntityId populated | Document linked to an FmsProject |
| 6 | Verify document relatedEntityType is 'fms_projects:fms_project' | Correct entity type |
| 7 | GET the linked FmsProject via /api/fms_projects/projects/:id | Project exists and is accessible |
| 8 | Verify project.bookingNumber matches extracted booking number | Data extracted correctly |
| 9 | Verify project.projectNumber format is IMP/SEA/NNNN/YYYY | Auto-generated project number |
| 10 | Verify project.currentStep is 'draft' | Initial workflow state |
| 11 | Delete document via DELETE /api/fms_documents/documents/:id | Cleanup |
| 12 | Delete project via DELETE /api/fms_projects/projects/:id | Cleanup |

## Expected Results
- FmsProject auto-created with projectNumber format `IMP/SEA/NNNN/YYYY`
- Document.relatedEntityType = `fms_projects:fms_project`
- Document.relatedEntityId = created project ID
- Project.bookingNumber matches extracted value from PDF
- Project.currentStep = `draft`
- Project.shipmentType = `IMP`
- Project.cargoType = `fcl`

## Edge Cases / Error Scenarios
- AI extraction disabled: Document created but no project auto-created
- AI fails to extract booking number: Document created without project link
- Feature flag disabled: Document created, no auto-creation triggered
- Duplicate booking number: Should still create new project (booking numbers may repeat across carriers)
- Document already linked: Skip auto-creation (relatedEntityId already set)

## Flow Diagram
```
Upload Booking Confirmation
         |
         v
  AI Extraction Runs
         |
         v
  Document Processed Event
         |
         v
  auto-create-from-booking subscriber
         |
         v
  Extract booking data (BL, vessel, ports, dates)
         |
         v
  Match client (optional, via Meilisearch)
         |
         v
  Create FmsProject
         |
         v
  Link document to project
         |
         v
  Find & link related documents
```

## Technical Notes
- Subscriber: `packages/fms/src/modules/fms_projects/subscribers/auto-create-from-booking.ts`
- Project creation: `packages/fms/src/modules/fms_projects/lib/project-creation.service.ts`
- Event: `fms_documents.document.processed`
- The test should allow 60-90 seconds for AI extraction to complete
