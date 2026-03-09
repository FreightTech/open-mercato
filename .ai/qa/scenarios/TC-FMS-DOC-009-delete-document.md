# Test Scenario: Delete Document

## Test ID
TC-FMS-DOC-009

## Category
FMS Documents

## Priority
High

## Type
API Test

## Description
Verify that authenticated users with appropriate permissions can delete documents via the API. Tests both successful deletion and error handling for edge cases like non-existent documents and permission checks.

## Prerequisites
- User is authenticated as superadmin
- FMS Documents module is enabled
- User has `fms_documents.manage` feature permission

## API Endpoint
`DELETE /api/fms_documents/documents/{id}`

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Document ID to delete |

## Test Steps
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a test document via API | Document created with valid ID |
| 2 | Verify document exists via GET | Returns document data |
| 3 | DELETE /api/fms_documents/documents/{id} | Returns 200 or 204 success |
| 4 | GET /api/fms_documents/documents/{id} | Returns 404 or document with deletedAt set |
| 5 | Verify document no longer in list results | Document excluded from normal listing |

## Expected Results
- Delete returns HTTP 200 or 204 status
- Document is soft-deleted (deletedAt timestamp set) or hard-deleted
- Document no longer appears in standard list queries
- Associated attachment may be retained or cleaned up based on policy

## Edge Cases / Error Scenarios

### Non-existent Document
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | DELETE /api/fms_documents/documents/00000000-0000-0000-0000-000000000000 | Returns 404 Not Found |

### Already Deleted Document
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create and delete a document | Document deleted |
| 2 | DELETE the same document again | Returns 404 or idempotent 200 |

### Invalid UUID Format
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | DELETE /api/fms_documents/documents/invalid-id | Returns 400 Bad Request |

### Unauthorized Access
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | DELETE without authentication | Returns 401 Unauthorized |

### Insufficient Permissions
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | DELETE as user without manage permission | Returns 403 Forbidden |

## Response Schema

### Success Response (200)
```json
{
  "success": true,
  "id": "uuid"
}
```

### Success Response (204)
No content body.

### Error Response (404)
```json
{
  "error": "Document not found"
}
```

### Error Response (400)
```json
{
  "error": "Invalid document ID format"
}
```

### Error Response (401)
```json
{
  "error": "Unauthorized"
}
```

### Error Response (403)
```json
{
  "error": "Forbidden"
}
```

## Notes
- Soft delete is preferred for audit trail and potential recovery
- If soft delete is used, `includeDeleted=true` query parameter may show deleted documents
- Cascade behavior for related entities (attachments, links) should be documented
