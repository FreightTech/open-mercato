# Test Scenario: No Match - Document Remains Unlinked

## Test ID
TC-FMS-FILE-003

## Category
FMS Files / Documents Integration

## Priority
Medium

## Type
API Test

## Description
Verify that uploading a B/L document with identifiers that don't match any existing project leaves the document unlinked. The document should be created and processed, but no auto-linking should occur.

## Prerequisites
- User authenticated as superadmin
- FMS Documents module enabled
- No existing projects with the test booking number

## API Endpoints
- `POST /api/fms_documents/upload` - Upload document
- `GET /api/fms_documents/documents/:id` - Get document details
- `GET /api/fms_projects/projects` - List projects (to verify no new project)

## Test Steps
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate unique booking number (e.g., BK-NOMATCH-{timestamp}) | Unique identifier |
| 2 | Generate a B/L PDF with this unique bookingNumber | PDF created |
| 3 | Upload B/L document via POST /api/fms_documents/upload | Document created |
| 4 | Poll until document processing completes | processedAt populated |
| 5 | Verify document category is 'bill_of_lading' | Correct type detected |
| 6 | Verify document.relatedEntityId is NULL | No auto-link occurred |
| 7 | Verify document.relatedEntityType is NULL | No entity type set |
| 8 | Search for projects with this bookingNumber | No projects found |
| 9 | Delete document | Cleanup |

## Expected Results
- Document created successfully with category='bill_of_lading'
- Document extraction completed (booking number extracted)
- `relatedEntityId` = NULL (no link)
- `relatedEntityType` = NULL
- No FmsProject created (B/L does NOT trigger auto-create, only booking confirmations do)
- User can manually link the document later

## Why No Auto-Create?
The `auto-create-from-booking` subscriber ONLY triggers for `booking_confirmation` documents. 
Other document types (B/L, invoice, packing list) are handled by `auto-link-to-project` which:
- Only LINKS to existing projects
- Does NOT create new projects
- Returns early if no matches found

## Edge Cases / Error Scenarios
- Document with completely empty identifiers: No match possible, remains unlinked
- Document with partial identifiers: Still no match if none exist

## Technical Notes
- Demonstrates the difference between booking_confirmation (triggers creation) and other types (only linking)
- User workflow: Upload B/L first → stays unlinked → later create project → B/L auto-links OR manually link
