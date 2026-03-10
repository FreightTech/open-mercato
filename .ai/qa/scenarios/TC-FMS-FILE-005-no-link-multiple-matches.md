# Test Scenario: No Auto-Link When Multiple Projects Match

## Test ID
TC-FMS-FILE-005

## Category
FMS Files / Documents Integration

## Priority
Medium

## Type
API Test

## Description
Verify that when a document's identifiers match multiple existing projects, the system does NOT auto-link the document. This prevents ambiguous linking and requires user intervention to select the correct project.

## Prerequisites
- User authenticated as superadmin
- FMS Documents and FMS Projects modules enabled
- Two existing projects with the SAME bookingNumber (simulating carrier reuse)

## API Endpoints
- `POST /api/fms_projects/projects` - Create project fixtures
- `POST /api/fms_documents/upload` - Upload document
- `GET /api/fms_documents/documents/:id` - Get document details
- `GET /api/fms_documents/documents/:id/matched-projects` - Get matching projects

## Test Steps
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create Project A with bookingNumber='BK-AMBIGUOUS-001' | Project A created |
| 2 | Create Project B with bookingNumber='BK-AMBIGUOUS-001' | Project B created (same booking number) |
| 3 | Generate B/L PDF with bookingNumber='BK-AMBIGUOUS-001' | PDF created |
| 4 | Upload B/L document | Document created |
| 5 | Wait for processing to complete | processedAt populated |
| 6 | Verify document.relatedEntityId is NULL | No auto-link (ambiguous) |
| 7 | GET /api/fms_documents/documents/:id/matched-projects | Returns 2 matching projects |
| 8 | Verify both Project A and Project B are in matched-projects response | Both shown as options |
| 9 | Delete document | Cleanup |
| 10 | Delete Project A | Cleanup |
| 11 | Delete Project B | Cleanup |

## Expected Results
- Document created and processed successfully
- Document NOT auto-linked (`relatedEntityId = null`)
- `matched-projects` API returns 2 project options
- User can manually select which project to link
- System logs warning about multiple matches

## Why This Behavior?
Booking numbers can be reused across:
- Different carriers (each carrier has their own numbering)
- Different years
- Different shipment types

Auto-linking with ambiguous matches could link to the wrong project, so the system:
1. Detects multiple matches
2. Skips auto-linking
3. Provides matched-projects API for user to choose

## User Workflow After Ambiguous Match
1. User sees document is unlinked
2. User opens document detail
3. UI shows "Multiple matching files found"
4. User selects correct project
5. Document is manually linked

## Edge Cases / Error Scenarios
- 3+ matching projects: Same behavior (no auto-link)
- One match deleted while processing: Should link to remaining one (if timing allows)

## Technical Notes
- Code path in `auto-link-to-project.ts`:
  ```typescript
  if (matches.length > 1) {
    logger.warn('multiple_projects_matched', { ... })
    return // Don't auto-link when ambiguous
  }
  ```
- The `findMatchingProjects()` function returns ALL matches, not just the first one
