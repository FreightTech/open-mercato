# Test Scenario: Booking Confirmation Upload with AI Extraction

## Test ID
TC-FMS-DOC-001

## Category
FMS Documents

## Priority
High

## Type
UI Test

## Description
Verify that uploading a booking confirmation document triggers automatic document type detection and AI data extraction, with extracted fields (booking number, vessel, ports) populated on the document record.

## Prerequisites
- User is logged in as superadmin
- FMS Documents module is enabled
- AI extraction toggle is enabled (default)

## Test Steps
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to /backend/fms-documents | Documents page displayed with heading "Documents" |
| 2 | Click "Upload Document" button | Upload dialog opens with title "Upload Documents" |
| 3 | Verify dialog elements | Drop zone visible, AI Data Extraction switch checked by default |
| 4 | Upload a booking confirmation PDF file | File appears in the upload queue |
| 5 | Click "Upload" button | Upload starts, status indicator shows progress |
| 6 | Wait for upload and extraction to complete | Dialog shows success state or closes automatically |
| 7 | Search for the uploaded document by name | Document appears in the list |
| 8 | Verify document row shows expected data | Category shows "Booking Confirmation", extracted fields populated |
| 9 | Click on document row to open details | Detail panel/drawer opens |
| 10 | Verify extracted fields in detail view | Booking number, vessel name, POL, POD visible |
| 11 | Delete the test document | Document removed from list |

## Expected Results
- Document created with category "Booking Confirmation"
- Document type automatically detected as "Booking Confirmation"
- AI extraction populates real columns (booking_number, vessel_name, port_of_loading, port_of_discharge)
- Document appears in the list with extracted data visible
- Document can be deleted for cleanup

## Edge Cases / Error Scenarios
- AI extraction disabled: document created without extracted data, manual entry required
- Invalid file type (e.g., .exe): upload rejected with error message
- Large file (>50MB): appropriate handling (may need timeout adjustment)
- Network interruption during upload: error shown, can retry
- Extraction fails (LLM unavailable): document created with processing_status="failed"

## Discovered UI Locators

### FMS Documents Page
- Page URL: `/backend/fms-documents`
- Page heading: `getByRole('heading', { name: 'Documents', level: 3 })`
- Upload button: `getByRole('button', { name: 'Upload Document' })`
- Search input: `getByRole('textbox', { name: 'Search...' })`
- Document row: `getByRole('button', { name: /<document-name>/ })`
- Delete button: `getByRole('button', { name: 'Delete' })`

### Upload Dialog
- Dialog: `getByRole('dialog', { name: 'Upload Documents' })`
- Close button: `getByRole('button', { name: 'Close' })`
- AI toggle: `getByRole('switch', { name: 'AI Data Extraction' })`
- Cancel button: `getByRole('button', { name: 'Cancel' })`
- Upload button: `getByRole('button', { name: 'Upload' })`
- File input: `page.locator('input[type="file"]')`
