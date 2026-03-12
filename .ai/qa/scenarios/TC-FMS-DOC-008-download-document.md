# Test Scenario: Download Document

## Test ID
TC-FMS-DOC-008

## Category
FMS Documents

## Priority
High

## Type
API Test

## Description
Verify that authenticated users can download document files via the download API endpoint. The API should return the original file with correct content type and disposition headers.

## Prerequisites
- User is authenticated as superadmin
- FMS Documents module is enabled
- A test document with an attached file exists

## API Endpoint
`GET /api/fms_documents/documents/{id}/download`

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Document ID |

### Response Headers
| Header | Expected Value |
|--------|----------------|
| `Content-Type` | `application/pdf` (or file's actual MIME type) |
| `Content-Disposition` | `attachment; filename="{original-filename}"` |

## Test Steps
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a PDF file with known content | File created locally |
| 2 | Upload the file as a document via API | Document created with attachment |
| 3 | GET /api/fms_documents/documents/{id}/download | Returns 200 with file content |
| 4 | Verify Content-Type header | Header is `application/pdf` |
| 5 | Verify Content-Disposition header | Contains `attachment` and filename |
| 6 | Verify response body matches original file | Content matches uploaded file |
| 7 | Delete test document | Cleanup successful |

## Expected Results
- Download returns HTTP 200 status
- Content-Type matches the uploaded file's MIME type
- Content-Disposition includes filename for browser download
- File content matches the originally uploaded file
- Response body size matches expected file size

## Edge Cases / Error Scenarios
- Download non-existent document: returns 404
- Download deleted document: returns 404 or 410
- Download without authentication: returns 401
- Download without proper permissions: returns 403
- Download document with missing attachment: returns 404 or error message
- Download very large file (>100MB): appropriate streaming/timeout handling

## Response Schema
Binary file content with appropriate headers:
```
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="document.pdf"
Content-Length: 12345

[binary file content]
```

## Error Responses
```json
// 404 Not Found
{
  "error": "Document not found"
}

// 401 Unauthorized
{
  "error": "Unauthorized"
}

// 500 Internal Server Error (missing attachment)
{
  "error": "No attachment found for this document"
}
```
