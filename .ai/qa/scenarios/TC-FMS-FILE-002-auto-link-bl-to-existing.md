# Test Scenario: Auto-Link B/L to Existing File

## Test ID
TC-FMS-FILE-002

## Category
FMS Files / Documents Integration

## Priority
High

## Type
API Test

## Description
Verify that uploading a Bill of Lading (B/L) document with a booking number that matches an existing FmsProject automatically links the document to that project without creating a new one.

## Prerequisites
- User authenticated as superadmin
- FMS Documents and FMS Projects modules enabled
- An existing FmsProject with a known bookingNumber

## API Endpoints
- `POST /api/fms_projects/projects` - Create project fixture
- `POST /api/fms_documents/upload` - Upload document
- `GET /api/fms_documents/documents/:id` - Get document details

## Test Steps
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create FmsProject with bookingNumber='BK-TEST-67890' via API | Project created with known ID |
| 2 | Generate a B/L PDF with same bookingNumber='BK-TEST-67890' | PDF created with extractable content |
| 3 | Upload B/L document via POST /api/fms_documents/upload | Document created |
| 4 | Poll until document processing completes | processedAt populated |
| 5 | Verify document category is 'bill_of_lading' | Correct document type detected |
| 6 | Verify document.relatedEntityId equals pre-existing project ID | Document auto-linked |
| 7 | Verify NO new project was created | Project count unchanged |
| 8 | Delete document | Cleanup |
| 9 | Delete project | Cleanup |

## Expected Results
- Document auto-linked to existing project (NOT a new project)
- Document.relatedEntityType = `fms_projects:fms_project`
- Document.relatedEntityId = pre-existing project.id
- No additional FmsProject created
- Project matcher found exactly 1 match by bookingNumber

## Edge Cases / Error Scenarios
- B/L with blNumber matching project.blNumber: Should also match
- B/L with containerNumber matching project containers: Should match
- No matching project: Document remains unlinked (tested in TC-FMS-FILE-003)
- Multiple matching projects: No auto-link (tested in TC-FMS-FILE-005)

## Matching Logic
The `auto-link-to-project` subscriber uses `findMatchingProjects()` which checks:
1. Project-level: `blNumber`, `bookingNumber`
2. Container-level: `bolNumber`, `bookingNumber`, `containerNumber`

## Technical Notes
- Subscriber: `packages/fms/src/modules/fms_documents/subscribers/auto-link-to-project.ts`
- Matcher: `packages/fms/src/modules/fms_documents/services/project-matcher.service.ts`
- The subscriber SKIPS booking_confirmation documents (handled by auto-create-from-booking)
- Only links when exactly ONE project matches
