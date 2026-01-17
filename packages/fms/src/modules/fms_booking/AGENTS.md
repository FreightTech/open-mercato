# FMS Booking Module - Feature Specification

## Overview

The FMS Booking module manages shipping bookings with comprehensive multi-leg route planning, FCL/LCL cargo handling, and integration with the quotes system. It serves as the operational planning layer between quotes and shipments.

**Module Path**: `packages/fms/src/modules/fms_booking/`
**API Base Path**: `/api/fms_booking/`

**Key Architectural Decision**: Uses the core workflow engine for lifecycle orchestration, providing robust state management, automation, SLA tracking, and audit trails.

## Key Features

### 1. Workflow-Powered Lifecycle
- **Orchestrated state management** using core workflow engine
- **Automated activities**: Carrier API calls, email notifications, document generation
- **User tasks**: Booking review, cargo validation, manual approvals
- **SLA tracking**: Monitor booking confirmation deadlines
- **Parallel execution**: Book multiple legs simultaneously
- **Compensation/rollback**: Cancel carrier bookings if any leg fails
- **Visual workflow tracking**: See booking progress in workflow UI

### 2. Multi-Leg Route Planning
- **Transport Modes**: Truck, Ship, Train, Air, Barge
- **Route Segments**: Address → Port → Port → Address
- **Leg Types**: Pre-carriage, Main carriage, On-carriage, Transshipment
- **Per-Leg Details**: Origin, destination, carrier, timing (ETD/ETA), cost
- **Automated booking**: Workflow activities call carrier APIs

### 3. Cargo Management
- **FCL (Full Container Load)**: Individual container tracking with types (20GP, 40GP, 40HC, 45HC, 20RF, 40RF, etc.)
- **LCL (Less than Container Load)**: Package-level tracking with dimensions, weight, volume
- **Special Handling**: Dangerous goods (UN number, hazard class), reefer containers (temperature control)
- **VGM Compliance**: Verified Gross Mass tracking for SOLAS

### 4. Offer Integration
- Create bookings directly from accepted offers (FmsOffer)
- Link bookings to both offer and parent quote for full traceability
- Pre-fill booking data from offer (customer, cargo type, pricing, origin/destination)
- Maintain pricing history and reference data

### 5. Dual-View Interface
- **List View**: DynamicTable with inline editing, perspectives, search, filters
- **Detail View**: Collapsible sections with visual route timeline, cargo management, and workflow progress
- **Workflow Visualization**: See current step, completed steps, pending tasks

## Architecture: Workflow Integration

### Booking Lifecycle Workflow

```
START
  ├─> Create Draft Booking (AUTOMATED)
  │     Activities: Generate booking number, initialize data
  │
  ├─> Plan Route (USER_TASK: booking coordinator)
  │     Required: Add at least 1 route leg
  │     SLA: 2 hours
  │
  ├─> Add Cargo Details (USER_TASK: booking coordinator)
  │     Required: Add containers (FCL) or cargo items (LCL)
  │     SLA: 2 hours
  │
  ├─> Validate Booking (AUTOMATED)
  │     Activities:
  │       - Validate route legs exist
  │       - Validate cargo exists
  │       - Check special requirements (hazmat, reefer)
  │       - Emit booking.validated event
  │     Guard: All validations pass → proceed
  │     Guard: Validations fail → back to Plan Route
  │
  ├─> Await Customer Confirmation (WAIT_FOR_SIGNAL: 'customer.confirmed')
  │     Timeout: 48 hours → auto-cancel
  │     Activities on timeout: Notify customer, cancel booking
  │
  ├─> Booking Confirmed (AUTOMATED)
  │     Activities:
  │       - Lock booking (prevent edits)
  │       - Generate booking confirmation PDF
  │       - Email customer
  │       - Emit booking.confirmed event
  │
  ├─> Request Carrier Bookings (PARALLEL_FORK)
  │   ├─> Book Leg 1 (AUTOMATED: async)
  │   │     Activities:
  │   │       - Call carrier API for leg 1
  │   │       - Retry on failure (3 attempts)
  │   │       - Store carrier booking number
  │   ├─> Book Leg 2 (AUTOMATED: async)
  │   └─> Book Leg 3 (AUTOMATED: async)
  │
  ├─> (PARALLEL_JOIN: wait for all legs)
  │     Compensation: If any leg fails, cancel all confirmed legs
  │
  ├─> All Legs Confirmed (AUTOMATED)
  │     Activities:
  │       - Update booking status to in_progress
  │       - Create shipment entity (high-level tracking)
  │       - Emit booking.legs_confirmed event
  │       - Email customer with carrier confirmations
  │
  ├─> Monitor Shipment Progress (AUTOMATED: recurring)
  │     Activities:
  │       - Poll carrier APIs for tracking updates
  │       - Update leg ETD/ETA if changed
  │       - Emit tracking.updated events
  │     Wait: Check every 4 hours
  │
  ├─> Await Delivery Confirmation (WAIT_FOR_SIGNAL: 'delivery.confirmed')
  │     Manual trigger: Booking coordinator confirms delivery
  │
  ├─> Booking Completed (AUTOMATED)
  │     Activities:
  │       - Finalize costs
  │       - Archive documents
  │       - Emit booking.completed event
  │       - Generate delivery receipt
  │
  ├─> Await Financial Close (WAIT_FOR_SIGNAL: 'financial.close_initiated')
  │     Trigger: System triggers monthly (8-14th of each month)
  │     Activities:
  │       - Flag shipments from previous month for review
  │       - Calculate actual costs vs. planned margin
  │       - Validate all invoices received/sent
  │
  ├─> Financial Close (USER_TASK: financial controller)
  │     Required: Review costs, confirm invoices, approve margin
  │     Activities:
  │       - Update actualCost with final values
  │       - Calculate final margin
  │       - Mark all invoices as reconciled
  │       - Generate monthly controlling report
  │       - Emit booking.financially_closed event
  │
  └─> END

Compensation Path (if any step fails):
  ├─> Cancel Carrier Bookings (AUTOMATED)
  │     Activities: Call carrier cancellation APIs
  │
  ├─> Notify Stakeholders (AUTOMATED)
  │     Activities: Email customer, booking coordinator
  │
  └─> Mark Booking Cancelled
```

### Workflow Signals

External events that advance the workflow:

- `customer.confirmed` - Customer approves booking (from portal or email)
- `carrier.leg_confirmed` - Carrier confirms booking for a leg (webhook)
- `carrier.leg_failed` - Carrier rejects booking (webhook)
- `delivery.confirmed` - Delivery confirmed by coordinator
- `customs.cleared` - Customs clearance received (for international shipments)
- `financial.close_initiated` - Monthly financial close triggered by system (8-14th of month)
- `financial.close_approved` - Financial controller approves close

### Workflow Activities

Custom activities for booking workflows:

#### 1. CALL_CARRIER_API
```json
{
  "activityId": "book_leg_1",
  "activityType": "CALL_CARRIER_API",
  "config": {
    "carrierId": "{{context.leg1.carrierId}}",
    "endpoint": "POST /bookings",
    "payload": {
      "origin": "{{context.leg1.origin}}",
      "destination": "{{context.leg1.destination}}",
      "cargoType": "{{context.cargoType}}",
      "containerType": "{{context.containerType}}",
      "etd": "{{context.leg1.etd}}"
    }
  },
  "retryPolicy": {
    "maxAttempts": 3,
    "initialIntervalMs": 5000,
    "backoffCoefficient": 2
  },
  "timeout": "PT30S",
  "compensation": {
    "activityType": "CALL_CARRIER_API",
    "config": {
      "endpoint": "DELETE /bookings/{{result.carrierBookingNumber}}"
    }
  }
}
```

#### 2. GENERATE_DOCUMENT
```json
{
  "activityId": "generate_booking_confirmation",
  "activityType": "GENERATE_DOCUMENT",
  "config": {
    "template": "booking_confirmation",
    "format": "pdf",
    "data": {
      "bookingNumber": "{{context.bookingNumber}}",
      "customer": "{{context.client.name}}",
      "legs": "{{context.legs}}"
    },
    "attachToEntity": {
      "entityType": "booking",
      "entityId": "{{context.bookingId}}"
    }
  }
}
```

#### 3. SEND_EMAIL
```json
{
  "activityId": "notify_customer",
  "activityType": "SEND_EMAIL",
  "config": {
    "to": "{{context.client.email}}",
    "subject": "Booking Confirmed: {{context.bookingNumber}}",
    "template": "booking_confirmed",
    "data": {
      "bookingNumber": "{{context.bookingNumber}}",
      "pickupDate": "{{context.pickupDate}}",
      "deliveryDate": "{{context.deliveryDate}}"
    },
    "attachments": ["{{activity.generate_booking_confirmation.result.fileId}}"]
  }
}
```

## Data Model

### Core Entities

#### Booking (fms_bookings)
Main entity representing a shipping booking.

**Workflow Integration:**
- workflowInstanceId → WorkflowInstance (links to workflow orchestration)
- currentStep (denormalized from workflow for quick access)
- Workflow manages status transitions

**Identifiers:**
- bookingNumber (unique per organization, auto-generated format: `{TYPE}/{FCL|LCL}/{SEQUENCE}/{YEAR}/{COMPANY}`)
  - Example: `EXP/FCL/00123/2026/ABC` (Export FCL booking #123 in 2026 for company ABC)
  - TYPE: EXP | IMP | RAIL | FTL | LTL | DEPOT
  - CARGO: FCL | LCL
  - SEQUENCE: 5-digit auto-incrementing number per year
  - YEAR: 4-digit year
  - COMPANY: Organization code (3-letter abbreviation)
- internalReference, clientReference, poNumber

**Relationships:**
- client → Contractor (customer)
- quote → FmsQuote, offer → FmsOffer (pricing)
- shipment → Shipment (created during workflow, execution tracking)
- shipper, consignee, notifyParty → CustomerEntity

**Shipment Classification:**
- shipmentType: 'EXP' | 'IMP' | 'RAIL' | 'FTL' | 'LTL' | 'DEPOT' (Export, Import, Rail, Full Truckload, etc.)
- direction: 'export' | 'import' | 'domestic'

**Cargo:**
- cargoType: 'fcl' | 'lcl'
- shipmentMode: 'AIR' | 'RAIL' | 'SEA' | 'MIXED'
- incoterms, commodityDescription, hsCode
- totalWeight, totalVolume, totalPackages, containerCount
- goodsDescription (detailed cargo description)

**Routing:**
- High-level origin/destination (location or address)
- Detailed routing via BookingLeg entities

**Status:** Derived from workflow currentStep
- draft, awaiting_confirmation, confirmed, in_transit, customs_clearance, delivered, completed, financially_closed, cancelled, failed

**Financial:**
- currencyCode, estimatedCost, actualCost
- margin (calculated: (actualCost - estimatedCost) / estimatedCost × 100)

**Special Requirements:**
- requiresInsurance, requiresCustoms, isDangerousGoods
- specialInstructions

**Financial:**
- currencyCode, estimatedCost, actualCost

**Dates:**
- bookingDate, requestedPickupDate, requestedDeliveryDate, estimatedDeliveryDate
- cutOffDate (critical for exports - cargo acceptance deadline)

**Team:**
- assignedTo (user), createdBy (user)
- forwarderId (Reference to Contractor - LSP/Forwarder company)

**Customs:**
- customsClearanceStatus: 'pending' | 'in_progress' | 'cleared' | 'issues'
- customsClearanceDate

**Workflow Fields:**
- workflowInstanceId (uuid, links to WorkflowInstance)
- currentStep (text, denormalized for performance: 'plan_route', 'add_cargo', 'confirmed', etc.)
- workflowContext (jsonb, snapshot of workflow context for quick access)

#### BookingLeg (fms_booking_legs)
Route segment within a booking.

**Workflow Integration:**
- bookingActivityId (links to workflow activity that books this leg)
- carrierConfirmationStatus: 'pending' | 'confirmed' | 'failed' | 'cancelled'
- carrierConfirmedAt, carrierFailureReason

**Sequencing:**
- legSequence (1, 2, 3...)
- legType: 'pre_carriage' | 'main_carriage' | 'on_carriage' | 'transshipment'

**Transport:**
- transportMode: 'truck' | 'ship' | 'train' | 'air' | 'barge'
- carrier → Contractor

**Routing:**
- origin/destination: FmsLocation (port/terminal) OR CustomerAddress
- vesselName, vesselImo, voyageNumber (for sea)
- vehicleRegistration (for truck)

**Timing:**
- estimatedDeparture, estimatedArrival
- actualDeparture, actualArrival

**Status:** Managed by workflow
- planned → booking_requested → confirmed → in_transit → completed | failed | cancelled

**Metrics:**
- distanceKm, estimatedDurationHours
- estimatedCost, actualCost

**Carrier Integration:**
- carrierBookingNumber (returned from carrier API)
- carrierBookingReference (carrier's internal reference)
- carrierConfirmedAt (timestamp)
- carrierFailureReason (if booking failed)

#### BookingContainer (fms_booking_containers)
FCL container tracking.

**Container Details:**
- containerNumber, containerType, sealNumber
- isSoc (shipper-owned container)
- containerOwner → Contractor

**Cargo:**
- cargoDescription, weight, volume, packageCount, packageType

**Reefer:**
- temperatureMin, temperatureMax, temperatureUnit

**Dangerous Goods:**
- isDangerousGoods, unNumber, hazardClass

**Status:** Workflow-managed
- planned → allocated → gate_in → loaded → in_transit → discharged → gate_out → delivered → returned

**VGM:**
- vgmWeight, vgmDate (SOLAS compliance)

**Depot:**
- pickupDepot, pickupDate, returnDepot, returnDate → FmsLocation

**Demurrage & Detention (Auto-calculated):**
- demurrageFreedays (integer, default from carrier/terminal contract)
- detentionFreedays (integer, default from carrier/terminal contract)
- demurrageCostPerDay (decimal, per-day charge after free days)
- detentionCostPerDay (decimal, per-day charge after free days)
- demurrageStartDate (date, when free days start counting)
- detentionStartDate (date, when container is gated out)
- demurrageCalculated (decimal, auto-calculated: max(0, (currentDate - demurrageStartDate - demurrageFreedays) * demurrageCostPerDay))
- detentionCalculated (decimal, auto-calculated: max(0, (currentDate - detentionStartDate - detentionFreedays) * detentionCostPerDay))
- demurrageInvoiced (boolean, whether demurrage has been invoiced)
- detentionInvoiced (boolean, whether detention has been invoiced)

#### BookingCargo (fms_booking_cargo)
LCL cargo line items.

**Description:**
- lineNumber, cargoDescription, hsCode

**Packaging:**
- packageCount, packageType (pallets, cartons, crates, drums, bags)

**Dimensions:**
- weight, weightUnit, volume, volumeUnit
- length, width, height, dimensionUnit

**Value:**
- declaredValue, valueCurrency, requiresInsurance

**Dangerous Goods:**
- isDangerousGoods, unNumber, hazardClass

**Handling:**
- isStackable, requiresRefrigeration
- temperatureMin, temperatureMax, handlingInstructions
- marksAndNumbers

#### BookingLegContainer (fms_booking_leg_containers)
Junction table linking containers to specific legs (for transshipment tracking).

**Relationships:**
- leg → BookingLeg
- container → BookingContainer

**Status:** Workflow-managed per leg
- planned → loaded → in_transit → arrived → offloaded

**Timing:**
- loadedAt, offloadedAt

### Document Management Integration

**Integration with fms_documents Module:**

This module does NOT create custom document entities. Instead, it integrates with the existing `fms_documents` module for all document management needs.

**How to Link Documents to Bookings:**
- Use FmsDocument entity from fms_documents module
- Set `relatedEntityType = 'fms_booking:booking'`
- Set `relatedEntityId = bookingId`
- Use appropriate `DocumentCategory`:
  - `BILL_OF_LADING` - BOL from carrier
  - `INVOICE` - Commercial invoices, customs invoices
  - `CUSTOMS` - Customs declarations, certificates
  - `OFFER` - Related offer documents
  - `OTHER` - Packing lists, certificates, POD, etc.

**Document Categories for Bookings:**
- Bill of Lading (BOL) - carrier-issued, uploaded by coordinator
- Commercial Invoice
- Packing List
- Certificate of Origin
- Phytosanitary Certificate
- Insurance Certificate
- Customs Declaration
- VGM Certificate
- Proof of Delivery (POD)
- Arrival Notice
- Other

**API Pattern:**
```typescript
// Upload document for booking
POST /api/fms_documents/documents
{
  "name": "BOL-MAEU-12345678.pdf",
  "category": "bill_of_lading",
  "description": "Bill of Lading from Maersk",
  "relatedEntityType": "fms_booking:booking",
  "relatedEntityId": "booking-uuid-123",
  "attachmentId": "attachment-uuid-456"
}

// List documents for booking
GET /api/fms_documents/documents?relatedEntityType=fms_booking:booking&relatedEntityId=booking-uuid-123

// Download document
GET /api/fms_documents/documents/:id/download
```

**AI Document Extraction:**
The fms_documents module supports AI extraction of document data:
- `extractedData` (JSONB) stores extracted fields (BOL number, invoice amount, etc.)
- `processedAt` (timestamp) tracks when document was processed
- Use this to auto-populate booking fields from uploaded documents

**Note:** BOL documents are NOT generated by this system. BOLs are created by carrier systems (Maersk, MSC, CMA CGM portals) and uploaded to the booking by coordinators.

### Additional Entities for Exceptions, Amendments, and Billing

#### BookingException (fms_booking_exceptions)
Tracks issues and exceptions during booking lifecycle.

**Purpose:** Document and manage problems (delays, damage, disputes) that occur during execution.

**Core Fields:**
- id, organizationId, tenantId
- booking → Booking
- exceptionType: 'delay' | 'damage' | 'shortage' | 'documentation' | 'customs' | 'carrier' | 'other'
- severity: 'low' | 'medium' | 'high' | 'critical'
- status: 'reported' | 'investigating' | 'resolved' | 'closed'

**Details:**
- title, description
- reportedBy → User, reportedAt
- affectedLeg → BookingLeg (optional)
- affectedContainer → BookingContainer (optional)

**Resolution:**
- resolutionNotes
- resolvedBy → User, resolvedAt
- resolutionCost (financial impact)

**Workflow Impact:**
- blocksDelivery (boolean, prevents completion until resolved)
- requiresCustomerApproval (boolean)

**Audit:**
- createdAt, updatedAt, deletedAt

**Example:**
> Container TCLU1234567 arrived damaged. Coordinator creates exception with type='damage', severity='high', affectedContainer=TCLU1234567, blocksDelivery=true. Insurance claim initiated, customer notified.

#### BookingAmendment (fms_booking_amendments)
Tracks changes made to confirmed bookings.

**Purpose:** Audit trail for booking modifications after confirmation, with approval workflow.

**Core Fields:**
- id, organizationId, tenantId
- booking → Booking
- amendmentNumber (auto-incremented: AMD-001, AMD-002, etc.)
- amendmentType: 'route_change' | 'cargo_change' | 'date_change' | 'party_change' | 'carrier_change' | 'other'
- status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'applied'

**Change Details:**
- changeDescription (text)
- changesBefore (JSONB, snapshot of data before change)
- changesAfter (JSONB, snapshot of data after change)
- reason (why amendment is needed)

**Financial:**
- additionalCost (decimal, extra charges due to amendment)
- customerCharge (decimal, what customer will be charged)
- approved (boolean)

**Workflow:**
- requestedBy → User, requestedAt
- approvedBy → User, approvedAt
- rejectedBy → User, rejectedAt, rejectionReason
- appliedAt (when changes were actually made to booking)

**Carrier Impact:**
- requiresCarrierApproval (boolean)
- carrierApprovalStatus: 'not_required' | 'pending' | 'approved' | 'rejected'
- carrierApprovedAt

**Audit:**
- createdAt, updatedAt, deletedAt

**Example:**
> Customer requests to change destination from Port B to Port C after booking confirmed. Coordinator creates amendment with type='route_change', additionalCost=$500. Manager approves, carrier approves, system updates leg 3 destination and charges customer $500.

#### BookingInvoice (fms_booking_invoices)
Customer invoices for booking services.

**Purpose:** Track customer billing for freight services, with line items for services rendered.

**Core Fields:**
- id, organizationId, tenantId
- booking → Booking
- invoiceNumber (auto-generated per organization: INV-2026-00123)
- invoiceType: 'standard' | 'proforma' | 'final' | 'debit_note'
- status: 'draft' | 'issued' | 'sent' | 'paid' | 'overdue' | 'cancelled'

**Customer:**
- customer → Contractor (billTo party)
- billingAddress → CustomerAddress
- billingEmail

**Financial:**
- currencyCode
- subtotal (sum of line items)
- taxAmount
- totalAmount
- paidAmount
- balanceDue (totalAmount - paidAmount)

**Dates:**
- invoiceDate
- dueDate
- paidDate

**Line Items:** (stored as JSONB array, or separate BookingInvoiceLineItem entity)
```typescript
lineItems: [
  {
    description: "Ocean Freight - Main Carriage",
    quantity: 1,
    unitPrice: 2500.00,
    amount: 2500.00,
    legId: "leg-uuid-123"
  },
  {
    description: "Trucking - Pre-carriage",
    quantity: 1,
    unitPrice: 350.00,
    amount: 350.00,
    legId: "leg-uuid-456"
  },
  {
    description: "Demurrage Charges - Container TCLU1234567",
    quantity: 3,
    unitPrice: 150.00,
    amount: 450.00,
    containerId: "container-uuid-789"
  }
]
```

**Payment Tracking:**
- paymentMethod: 'wire_transfer' | 'credit_card' | 'check' | 'cash' | 'other'
- paymentReference (transaction ID, check number)
- paymentReceivedBy → User, paymentReceivedAt

**Integration:**
- xeroInvoiceId (if using Xero accounting integration)
- quickbooksInvoiceId (if using QuickBooks)
- syncedAt (last sync to accounting system)

**Audit:**
- createdBy → User, createdAt
- issuedBy → User, issuedAt
- updatedAt, deletedAt

**Example:**
> Booking EXP/FCL/00123/2026/ABC completed. System generates invoice INV-2026-00123 with line items for ocean freight ($2500), trucking ($350), and demurrage ($450). Total: $3300. Invoice sent to customer, due in 30 days.

#### BookingCreditNote (fms_booking_credit_notes)
Credit notes for invoice adjustments and refunds.

**Purpose:** Track credits issued to customers for billing adjustments, refunds, or service failures.

**Core Fields:**
- id, organizationId, tenantId
- booking → Booking
- invoice → BookingInvoice (optional, if crediting specific invoice)
- creditNoteNumber (auto-generated: CN-2026-00123)
- status: 'draft' | 'issued' | 'applied' | 'cancelled'

**Financial:**
- currencyCode
- creditAmount
- reason: 'billing_error' | 'service_failure' | 'customer_complaint' | 'partial_refund' | 'overcharge' | 'other'
- reasonDescription (detailed explanation)

**Application:**
- appliedToInvoiceId (if crediting a specific invoice)
- refundMethod: 'account_credit' | 'wire_transfer' | 'credit_card_refund' | 'check' | 'none'
- refundReference (transaction ID for refund)
- appliedAt

**Dates:**
- creditNoteDate
- appliedDate

**Approval:**
- approvedBy → User, approvedAt (manager approval required for credits)
- approvalNotes

**Audit:**
- createdBy → User, createdAt
- updatedAt, deletedAt

**Example:**
> Customer complains about 2-day delay. Manager approves $200 credit. Coordinator creates credit note CN-2026-00123 for $200 with reason='service_failure', applies to invoice INV-2026-00123. Customer's next invoice automatically deducts $200.

## API Structure

### Main CRUD
- `GET /api/fms_booking/bookings` - List with pagination, filters, search
- `POST /api/fms_booking/bookings` - Create new booking (starts workflow)
- `GET /api/fms_booking/bookings/:id` - Get booking with workflow status
- `PUT /api/fms_booking/bookings/:id` - Update booking (validates against workflow state)
- `DELETE /api/fms_booking/bookings/:id` - Cancel booking (signals workflow)

### Nested Resources
- `GET/POST /api/fms_booking/bookings/:id/legs` - Manage route legs
- `PUT/DELETE /api/fms_booking/bookings/legs/:legId` - Update/delete leg
- `GET/POST /api/fms_booking/bookings/:id/cargo` - Manage cargo items (LCL)
- `PUT/DELETE /api/fms_booking/bookings/cargo/:cargoId` - Update/delete cargo
- `GET/POST /api/fms_booking/bookings/:id/containers` - Manage containers (FCL)
- `PUT/DELETE /api/fms_booking/bookings/containers/:containerId` - Update/delete container

### Workflow Operations
- `POST /api/fms_booking/bookings/:id/advance` - Advance workflow to next step
- `POST /api/fms_booking/bookings/:id/signal` - Send signal to workflow (e.g., customer confirmed)
- `POST /api/fms_booking/bookings/:id/cancel` - Cancel booking workflow
- `GET /api/fms_booking/bookings/:id/workflow` - Get workflow status and history
- `GET /api/fms_booking/bookings/:id/tasks` - Get pending user tasks
- `POST /api/fms_booking/bookings/:id/tasks/:taskId/complete` - Complete user task

### From Offer
- `POST /api/fms_booking/bookings/from-offer/:offerId` - Create booking from accepted offer (starts workflow)

### Configuration
- `GET /api/fms_booking/bookings/table-config` - DynamicTable configuration

### Documents (via fms_documents module)
- `GET /api/fms_documents/documents?relatedEntityType=fms_booking:booking&relatedEntityId=:bookingId` - List documents for booking
- `POST /api/fms_documents/documents` - Upload document linked to booking
- `GET /api/fms_documents/documents/:id` - Get document details
- `GET /api/fms_documents/documents/:id/download` - Download document
- `PUT /api/fms_documents/documents/:id` - Update document metadata
- `DELETE /api/fms_documents/documents/:id` - Delete document

### Exceptions
- `GET /api/fms_booking/bookings/:id/exceptions` - List exceptions for booking
- `POST /api/fms_booking/bookings/:id/exceptions` - Create new exception
- `GET /api/fms_booking/exceptions/:id` - Get exception details
- `PUT /api/fms_booking/exceptions/:id` - Update exception
- `POST /api/fms_booking/exceptions/:id/resolve` - Mark exception as resolved
- `DELETE /api/fms_booking/exceptions/:id` - Delete exception

### Amendments
- `GET /api/fms_booking/bookings/:id/amendments` - List amendments for booking
- `POST /api/fms_booking/bookings/:id/amendments` - Create amendment request
- `GET /api/fms_booking/amendments/:id` - Get amendment details
- `PUT /api/fms_booking/amendments/:id` - Update amendment
- `POST /api/fms_booking/amendments/:id/approve` - Approve amendment
- `POST /api/fms_booking/amendments/:id/reject` - Reject amendment
- `POST /api/fms_booking/amendments/:id/apply` - Apply approved amendment to booking
- `DELETE /api/fms_booking/amendments/:id` - Cancel amendment

### Invoices
- `GET /api/fms_booking/bookings/:id/invoices` - List invoices for booking
- `POST /api/fms_booking/bookings/:id/invoices` - Create invoice
- `GET /api/fms_booking/invoices/:id` - Get invoice details
- `PUT /api/fms_booking/invoices/:id` - Update invoice
- `POST /api/fms_booking/invoices/:id/issue` - Issue invoice (send to customer)
- `POST /api/fms_booking/invoices/:id/record-payment` - Record payment received
- `DELETE /api/fms_booking/invoices/:id` - Cancel invoice

### Credit Notes
- `GET /api/fms_booking/bookings/:id/credit-notes` - List credit notes for booking
- `POST /api/fms_booking/bookings/:id/credit-notes` - Create credit note
- `GET /api/fms_booking/credit-notes/:id` - Get credit note details
- `PUT /api/fms_booking/credit-notes/:id` - Update credit note
- `POST /api/fms_booking/credit-notes/:id/approve` - Approve credit note (manager only)
- `POST /api/fms_booking/credit-notes/:id/apply` - Apply credit note to invoice
- `DELETE /api/fms_booking/credit-notes/:id` - Cancel credit note

## Business Logic

### Workflow Commands

#### booking.create
Creates a new booking and starts the booking lifecycle workflow.

**Input:** `{ ...bookingData, tenantId, organizationId, userId }`
**Output:** `{ bookingId, workflowInstanceId }`

**Process:**
1. Validate booking data with Zod schema
2. Create Booking entity with status 'draft'
3. Start workflow instance:
   ```typescript
   const workflowInstance = await startWorkflow(em, {
     workflowId: 'booking_lifecycle_v1',
     initialContext: {
       bookingId: booking.id,
       bookingNumber: booking.bookingNumber,
       cargoType: booking.cargoType,
       clientId: booking.clientId,
       // ... other booking data
     },
     metadata: {
       entityType: 'fms_booking:booking',
       entityId: booking.id,
       initiatedBy: userId,
     },
     tenantId,
     organizationId,
   })
   ```
4. Link booking to workflow: `booking.workflowInstanceId = workflowInstance.id`
5. Workflow auto-advances to 'plan_route' step
6. Return booking ID and workflow instance ID

#### booking.createFromOffer
Creates a new booking from an accepted offer and starts the workflow.

**Input:** `{ offerId, tenantId, organizationId, userId }`
**Output:** `{ bookingId, workflowInstanceId }`

**Process:**
1. Load FmsOffer entity and validate it's accepted
2. Load parent FmsQuote for additional context
3. Create Booking entity with data from offer:
   - clientId from offer.customerId
   - cargoType from offer.cargoType
   - shipmentMode from offer.shipmentMode
   - direction from offer.direction
   - incoterms from offer.incoterms
   - originLocationId, destinationLocationId from offer
   - estimatedCost from offer.totalPrice
   - currencyCode from offer.currency
4. Set booking.offerId = offer.id and booking.quoteId = offer.quoteId
5. Start workflow instance (same as booking.create)
6. Return booking ID and workflow instance ID

**Example:**
```typescript
const result = await booking.createFromOffer({
  offerId: 'off-uuid-123',
  tenantId: 'tenant-123',
  organizationId: 'org-456',
  userId: 'user-789'
})
// Returns: { bookingId: 'bk-uuid-456', workflowInstanceId: 'wf-uuid-789' }
```

#### booking.addLeg
Adds a route leg to booking (during 'plan_route' user task).

**Input:** `{ bookingId, legData }`
**Output:** `{ legId }`

**Process:**
1. Validate booking is in 'plan_route' step
2. Create BookingLeg entity
3. Update workflow context with new leg
4. Return leg ID

**Note:** Workflow doesn't advance until user completes the 'plan_route' task.

#### booking.completePlanRoute
Completes the 'plan_route' user task and advances workflow.

**Input:** `{ bookingId, userId }`
**Output:** `{ success }`

**Validation:**
- Must have at least 1 leg
- Legs must be sequential (1, 2, 3...)
- All required fields filled

**Process:**
1. Validate legs exist
2. Complete user task in workflow
3. Workflow auto-advances to 'add_cargo' step
4. Return success

#### booking.confirmCustomer
Sends 'customer.confirmed' signal to workflow.

**Input:** `{ bookingId }`
**Output:** `{ success }`

**Process:**
1. Send signal to workflow instance
2. Workflow advances from 'await_confirmation' to 'booking_confirmed' step
3. Workflow activities execute:
   - Lock booking (prevent edits)
   - Generate PDF
   - Email customer
   - Emit event
4. Workflow advances to 'request_carrier_bookings' (parallel fork)
5. Return success

#### booking.processCarrierWebhook
Processes carrier confirmation/failure webhooks.

**Input:** `{ bookingId, legId, status, carrierBookingNumber?, failureReason? }`
**Output:** `{ success }`

**Process:**
1. Update BookingLeg with carrier response
2. Send signal to workflow: `carrier.leg_confirmed` or `carrier.leg_failed`
3. If all legs confirmed → workflow advances to 'all_legs_confirmed'
4. If any leg failed → workflow triggers compensation (cancels other legs)
5. Return success

#### booking.cancel
Cancels a booking by signaling the workflow.

**Input:** `{ bookingId, reason, userId }`
**Output:** `{ success }`

**Process:**
1. Send cancellation signal to workflow
2. Workflow executes compensation activities:
   - Cancel carrier bookings (API calls)
   - Notify stakeholders (emails)
   - Update booking status
3. Workflow moves to END with status 'CANCELLED'
4. Return success

### Workflow Definition (JSON)

File: `packages/fms/src/modules/fms_booking/workflows/booking-lifecycle-v1.json`

```json
{
  "workflowId": "booking_lifecycle_v1",
  "workflowName": "Booking Lifecycle",
  "description": "Orchestrates booking creation, confirmation, carrier bookings, and delivery",
  "version": 1,
  "enabled": true,
  "metadata": {
    "category": "FMS",
    "tags": ["booking", "shipment", "logistics"],
    "icon": "package"
  },
  "definition": {
    "steps": [
      {
        "stepId": "start",
        "stepName": "Start",
        "stepType": "START"
      },
      {
        "stepId": "create_draft",
        "stepName": "Create Draft Booking",
        "stepType": "AUTOMATED"
      },
      {
        "stepId": "plan_route",
        "stepName": "Plan Route",
        "stepType": "USER_TASK",
        "userTaskConfig": {
          "assignedTo": "{{context.assignedToId}}",
          "slaDuration": "PT2H"
        }
      },
      {
        "stepId": "add_cargo",
        "stepName": "Add Cargo Details",
        "stepType": "USER_TASK",
        "userTaskConfig": {
          "assignedTo": "{{context.assignedToId}}",
          "slaDuration": "PT2H"
        }
      },
      {
        "stepId": "validate_booking",
        "stepName": "Validate Booking",
        "stepType": "AUTOMATED"
      },
      {
        "stepId": "await_confirmation",
        "stepName": "Await Customer Confirmation",
        "stepType": "WAIT_FOR_SIGNAL",
        "waitConfig": {
          "signalName": "customer.confirmed",
          "timeout": "PT48H"
        }
      },
      {
        "stepId": "booking_confirmed",
        "stepName": "Booking Confirmed",
        "stepType": "AUTOMATED"
      },
      {
        "stepId": "request_carrier_bookings",
        "stepName": "Request Carrier Bookings",
        "stepType": "PARALLEL_FORK"
      },
      {
        "stepId": "join_carrier_responses",
        "stepName": "Wait for All Carrier Responses",
        "stepType": "PARALLEL_JOIN"
      },
      {
        "stepId": "all_legs_confirmed",
        "stepName": "All Legs Confirmed",
        "stepType": "AUTOMATED"
      },
      {
        "stepId": "monitor_progress",
        "stepName": "Monitor Shipment Progress",
        "stepType": "AUTOMATED"
      },
      {
        "stepId": "await_delivery",
        "stepName": "Await Delivery Confirmation",
        "stepType": "WAIT_FOR_SIGNAL",
        "waitConfig": {
          "signalName": "delivery.confirmed"
        }
      },
      {
        "stepId": "booking_completed",
        "stepName": "Booking Completed",
        "stepType": "AUTOMATED"
      },
      {
        "stepId": "await_financial_close",
        "stepName": "Await Financial Close",
        "stepType": "WAIT_FOR_SIGNAL",
        "waitConfig": {
          "signalName": "financial.close_initiated"
        }
      },
      {
        "stepId": "financial_close",
        "stepName": "Financial Close Review",
        "stepType": "USER_TASK",
        "userTaskConfig": {
          "assignedToRole": "financial_controller",
          "slaDuration": "P3D"
        }
      },
      {
        "stepId": "end",
        "stepName": "End",
        "stepType": "END"
      }
    ],
    "transitions": [
      {
        "transitionId": "start_to_create",
        "fromStepId": "start",
        "toStepId": "create_draft",
        "trigger": "auto",
        "activities": [
          {
            "activityId": "generate_booking_number",
            "activityType": "CUSTOM",
            "config": {
              "handler": "generateBookingNumber",
              "format": "{TYPE}/{CARGO}/{SEQUENCE}/{YEAR}/{COMPANY}",
              "comment": "Example: EXP/FCL/00123/2026/ABC"
            }
          }
        ]
      },
      {
        "transitionId": "create_to_plan",
        "fromStepId": "create_draft",
        "toStepId": "plan_route",
        "trigger": "auto"
      },
      {
        "transitionId": "plan_to_cargo",
        "fromStepId": "plan_route",
        "toStepId": "add_cargo",
        "trigger": "manual",
        "guards": [
          {
            "condition": "{{context.legs.length}} > 0",
            "errorMessage": "At least one route leg is required"
          }
        ]
      },
      {
        "transitionId": "cargo_to_validate",
        "fromStepId": "add_cargo",
        "toStepId": "validate_booking",
        "trigger": "manual",
        "guards": [
          {
            "condition": "{{context.cargoType}} == 'fcl' ? {{context.containers.length}} > 0 : {{context.cargoItems.length}} > 0",
            "errorMessage": "At least one container or cargo item is required"
          }
        ]
      },
      {
        "transitionId": "validate_to_await",
        "fromStepId": "validate_booking",
        "toStepId": "await_confirmation",
        "trigger": "auto",
        "activities": [
          {
            "activityId": "emit_validated",
            "activityType": "EMIT_EVENT",
            "config": {
              "eventType": "booking.validated",
              "payload": { "bookingId": "{{context.bookingId}}" }
            }
          },
          {
            "activityId": "notify_customer_review",
            "activityType": "SEND_EMAIL",
            "config": {
              "to": "{{context.client.email}}",
              "subject": "Review Booking: {{context.bookingNumber}}",
              "template": "booking_review"
            }
          }
        ]
      },
      {
        "transitionId": "await_to_confirmed",
        "fromStepId": "await_confirmation",
        "toStepId": "booking_confirmed",
        "trigger": "signal",
        "signal": "customer.confirmed"
      },
      {
        "transitionId": "confirmed_to_request",
        "fromStepId": "booking_confirmed",
        "toStepId": "request_carrier_bookings",
        "trigger": "auto",
        "activities": [
          {
            "activityId": "lock_booking",
            "activityType": "CUSTOM",
            "config": { "handler": "lockBooking" }
          },
          {
            "activityId": "generate_confirmation_pdf",
            "activityType": "GENERATE_DOCUMENT",
            "config": {
              "template": "booking_confirmation",
              "format": "pdf"
            }
          },
          {
            "activityId": "email_confirmation",
            "activityType": "SEND_EMAIL",
            "config": {
              "to": "{{context.client.email}}",
              "subject": "Booking Confirmed: {{context.bookingNumber}}",
              "template": "booking_confirmed",
              "attachments": ["{{activity.generate_confirmation_pdf.result.fileId}}"]
            }
          },
          {
            "activityId": "emit_confirmed",
            "activityType": "EMIT_EVENT",
            "config": {
              "eventType": "booking.confirmed",
              "payload": { "bookingId": "{{context.bookingId}}" }
            }
          }
        ]
      },
      {
        "transitionId": "request_to_join",
        "fromStepId": "request_carrier_bookings",
        "toStepId": "join_carrier_responses",
        "trigger": "auto",
        "parallelActivities": [
          {
            "activityId": "book_leg_{{context.legs[0].id}}",
            "activityType": "CALL_CARRIER_API",
            "config": {
              "carrierId": "{{context.legs[0].carrierId}}",
              "endpoint": "POST /bookings",
              "payload": {
                "origin": "{{context.legs[0].origin}}",
                "destination": "{{context.legs[0].destination}}"
              }
            },
            "retryPolicy": { "maxAttempts": 3 },
            "timeout": "PT30S"
          }
        ]
      },
      {
        "transitionId": "join_to_confirmed",
        "fromStepId": "join_carrier_responses",
        "toStepId": "all_legs_confirmed",
        "trigger": "auto"
      },
      {
        "transitionId": "all_confirmed_to_monitor",
        "fromStepId": "all_legs_confirmed",
        "toStepId": "monitor_progress",
        "trigger": "auto",
        "activities": [
          {
            "activityId": "create_shipment",
            "activityType": "CUSTOM",
            "config": { "handler": "createShipmentFromBooking" }
          },
          {
            "activityId": "emit_legs_confirmed",
            "activityType": "EMIT_EVENT",
            "config": {
              "eventType": "booking.legs_confirmed",
              "payload": { "bookingId": "{{context.bookingId}}" }
            }
          }
        ]
      },
      {
        "transitionId": "monitor_to_await",
        "fromStepId": "monitor_progress",
        "toStepId": "await_delivery",
        "trigger": "timer",
        "timerConfig": { "interval": "PT4H" }
      },
      {
        "transitionId": "await_to_completed",
        "fromStepId": "await_delivery",
        "toStepId": "booking_completed",
        "trigger": "signal",
        "signal": "delivery.confirmed"
      },
      {
        "transitionId": "completed_to_await_financial_close",
        "fromStepId": "booking_completed",
        "toStepId": "await_financial_close",
        "trigger": "auto",
        "activities": [
          {
            "activityId": "finalize_costs",
            "activityType": "CUSTOM",
            "config": { "handler": "finalizeCosts" }
          },
          {
            "activityId": "generate_delivery_receipt",
            "activityType": "GENERATE_DOCUMENT",
            "config": {
              "template": "delivery_receipt",
              "format": "pdf"
            }
          },
          {
            "activityId": "emit_completed",
            "activityType": "EMIT_EVENT",
            "config": {
              "eventType": "booking.completed",
              "payload": { "bookingId": "{{context.bookingId}}" }
            }
          }
        ]
      },
      {
        "stepId": "await_financial_close",
        "stepName": "Await Financial Close",
        "stepType": "WAIT_FOR_SIGNAL",
        "waitConfig": {
          "signalName": "financial.close_initiated",
          "comment": "Triggered monthly by system (8-14th of month)"
        }
      },
      {
        "stepId": "financial_close",
        "stepName": "Financial Close Review",
        "stepType": "USER_TASK",
        "userTaskConfig": {
          "assignedToRole": "financial_controller",
          "slaDuration": "P3D"
        }
      },
      {
        "transitionId": "await_to_financial_close",
        "fromStepId": "await_financial_close",
        "toStepId": "financial_close",
        "trigger": "signal",
        "signal": "financial.close_initiated",
        "activities": [
          {
            "activityId": "flag_for_review",
            "activityType": "CUSTOM",
            "config": {
              "handler": "flagBookingForFinancialReview",
              "comment": "Mark booking as requiring financial close review"
            }
          },
          {
            "activityId": "calculate_final_margin",
            "activityType": "CUSTOM",
            "config": {
              "handler": "calculateFinalMargin",
              "formula": "(actualCost - estimatedCost) / estimatedCost * 100"
            }
          }
        ]
      },
      {
        "transitionId": "financial_close_to_end",
        "fromStepId": "financial_close",
        "toStepId": "end",
        "trigger": "manual",
        "guards": [
          {
            "condition": "{{context.allInvoicesReconciled}} == true",
            "errorMessage": "All invoices must be reconciled before closing"
          }
        ],
        "activities": [
          {
            "activityId": "mark_financially_closed",
            "activityType": "CUSTOM",
            "config": { "handler": "markBookingFinanciallyClosed" }
          },
          {
            "activityId": "generate_controlling_report",
            "activityType": "GENERATE_DOCUMENT",
            "config": {
              "template": "monthly_controlling_report",
              "format": "pdf"
            }
          },
          {
            "activityId": "emit_financially_closed",
            "activityType": "EMIT_EVENT",
            "config": {
              "eventType": "booking.financially_closed",
              "payload": { "bookingId": "{{context.bookingId}}", "finalMargin": "{{context.finalMargin}}" }
            }
          }
        ]
      }
    ]
  }
}
```

## User Interface

### List View

**File**: `packages/fms/src/modules/fms_booking/backend/bookings/page.tsx`
**Route**: `/fms/bookings`

**Component Structure:**
```tsx
<Page>
  <PageBody>
    <DynamicTable
      tableId="fms-bookings"
      columns={columns}
      data={bookings}
      perspectives={perspectives}
      filters={filters}
      onCellSave={handleCellSave}
      onNewRowSave={handleNewBooking}
      onPerspectiveSave={handlePerspectiveSave}
    />
  </PageBody>
</Page>
```

**DynamicTable Configuration:**
- **Table ID**: `fms-bookings` (for perspective storage)
- **Inline Editing**: Enabled for draft bookings (locked after customer confirmation)
- **Row Click**: Navigate to detail view
- **Perspectives Support**: Full perspective management (save, rename, delete, switch)
- **Column Visibility**: User-configurable via ColumnsPopover
- **Sorting**: Multi-column sorting support
- **Filtering**: Advanced filter builder with AND/OR conditions

**Column Definitions:**
```typescript
const columns: ColumnDef[] = [
  {
    id: 'bookingNumber',
    field: 'bookingNumber',
    header: 'Booking #',
    width: 150,
    pinned: true,
    clickable: true, // Navigate to detail
  },
  {
    id: 'workflowStatus',
    field: 'workflowStatus',
    header: 'Status',
    width: 150,
    renderer: WorkflowStatusRenderer, // Custom badge component
  },
  {
    id: 'bookingDate',
    field: 'bookingDate',
    header: 'Date',
    width: 120,
    type: 'date',
  },
  {
    id: 'client',
    field: 'client.name',
    header: 'Customer',
    width: 200,
    editable: true,
    editor: 'searchableSelect',
    editorConfig: { endpoint: '/api/contractors?type=client' },
  },
  {
    id: 'clientReference',
    field: 'clientReference',
    header: 'Client Ref',
    width: 140,
    editable: true,
  },
  {
    id: 'poNumber',
    field: 'poNumber',
    header: 'PO #',
    width: 120,
    editable: true,
  },
  {
    id: 'cargoType',
    field: 'cargoType',
    header: 'Cargo',
    width: 80,
    renderer: CargoTypeBadgeRenderer, // FCL/LCL badge
  },
  {
    id: 'containerCount',
    field: 'containerCount',
    header: 'Ctrs',
    width: 70,
    align: 'right',
  },
  {
    id: 'origin',
    field: 'origin.locode',
    header: 'Origin',
    width: 120,
  },
  {
    id: 'destination',
    field: 'destination.locode',
    header: 'Destination',
    width: 120,
  },
  {
    id: 'transportModes',
    field: 'transportModes',
    header: 'Modes',
    width: 100,
    renderer: TransportModesRenderer, // Icons
  },
  {
    id: 'etd',
    field: 'estimatedDeparture',
    header: 'ETD',
    width: 120,
    type: 'date',
  },
  {
    id: 'eta',
    field: 'estimatedArrival',
    header: 'ETA',
    width: 120,
    type: 'date',
  },
  {
    id: 'assignedTo',
    field: 'assignedTo.name',
    header: 'Assigned To',
    width: 140,
  },
]
```

**Custom Renderers:**

**WorkflowStatusRenderer:**
```typescript
const WorkflowStatusRenderer = ({ value, rowData }) => {
  const colors = {
    draft: 'bg-gray-100 text-gray-800',
    plan_route: 'bg-blue-100 text-blue-800',
    add_cargo: 'bg-blue-100 text-blue-800',
    validate_booking: 'bg-yellow-100 text-yellow-800',
    await_confirmation: 'bg-orange-100 text-orange-800',
    booking_confirmed: 'bg-green-100 text-green-800',
    request_carrier_bookings: 'bg-yellow-100 text-yellow-800',
    all_legs_confirmed: 'bg-green-100 text-green-800',
    monitor_progress: 'bg-blue-100 text-blue-800',
    booking_completed: 'bg-green-100 text-green-800',
    await_financial_close: 'bg-purple-100 text-purple-800',
    financial_close: 'bg-purple-100 text-purple-800',
    financially_closed: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-red-100 text-red-800',
    failed: 'bg-red-100 text-red-800',
  }

  const hasPendingTask = rowData.hasPendingTask

  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[value]}`}>
        {value.toUpperCase().replace(/_/g, ' ')}
      </span>
      {hasPendingTask && (
        <span className="text-xs text-red-600 font-medium">Action Required</span>
      )}
    </div>
  )
}
```

**Perspectives (Default):**
```typescript
const defaultPerspectives = [
  {
    id: 'action-required',
    name: 'Action Required',
    color: 'red',
    filters: {
      rows: [{ field: 'hasPendingTask', operator: 'equals', values: [true] }]
    },
    sorting: [{ field: 'slaDueAt', direction: 'asc' }],
  },
  {
    id: 'awaiting-customer',
    name: 'Awaiting Customer',
    color: 'orange',
    filters: {
      rows: [{ field: 'workflowStatus', operator: 'equals', values: ['await_confirmation'] }]
    },
  },
  {
    id: 'in-transit',
    name: 'In Transit',
    color: 'blue',
    filters: {
      rows: [{ field: 'workflowStatus', operator: 'equals', values: ['monitor_progress'] }]
    },
  },
  {
    id: 'pending-financial-close',
    name: 'Pending Financial Close',
    color: 'purple',
    filters: {
      rows: [
        { field: 'workflowStatus', operator: 'in', values: ['await_financial_close', 'financial_close'] }
      ]
    },
  },
  {
    id: 'fcl',
    name: 'FCL Bookings',
    filters: {
      rows: [{ field: 'cargoType', operator: 'equals', values: ['fcl'] }]
    },
  },
  {
    id: 'lcl',
    name: 'LCL Bookings',
    filters: {
      rows: [{ field: 'cargoType', operator: 'equals', values: ['lcl'] }]
    },
  },
]
```

**Filter Configuration:**
```typescript
const filterFields = [
  { id: 'workflowStatus', label: 'Workflow Status', type: 'select', options: workflowSteps },
  { id: 'cargoType', label: 'Cargo Type', type: 'select', options: ['FCL', 'LCL'] },
  { id: 'direction', label: 'Direction', type: 'select', options: ['export', 'import', 'domestic'] },
  { id: 'shipmentType', label: 'Shipment Type', type: 'select', options: ['EXP', 'IMP', 'RAIL', 'FTL', 'LTL'] },
  { id: 'client', label: 'Customer', type: 'searchableSelect', endpoint: '/api/contractors?type=client' },
  { id: 'assignedTo', label: 'Assigned To', type: 'searchableSelect', endpoint: '/api/users' },
  { id: 'bookingDate', label: 'Booking Date', type: 'dateRange' },
  { id: 'pickupDate', label: 'Pickup Date', type: 'dateRange' },
  { id: 'deliveryDate', label: 'Delivery Date', type: 'dateRange' },
  { id: 'hasPendingTask', label: 'Has Pending Tasks', type: 'boolean' },
]
```

**Search Configuration:**
```typescript
const searchConfig = {
  entityType: 'fms_booking:booking',
  fields: ['bookingNumber', 'clientReference', 'poNumber', 'cargoDescription', 'goodsDescription'],
  placeholder: 'Search bookings...',
}
```

### Detail View

**File**: `packages/fms/src/modules/fms_booking/backend/bookings/[id]/page.tsx`
**Route**: `/fms/bookings/:id`

**Component Structure:**
```tsx
<Page>
  <PageBody className="max-w-6xl mx-auto">
    {/* Header */}
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/backend/bookings')} className="p-2 hover:bg-gray-100 rounded">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="bg-blue-500 rounded p-2">
          <Package className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{booking.bookingNumber}</h1>
          <p className="text-sm text-gray-500">{booking.client?.name} • {routeDisplay}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <WorkflowStepBadge status={booking.workflowStatus} hasPendingTask={hasPendingTask} />
        {/* Contextual action buttons based on workflow step */}
        {renderActionButtons(booking.workflowStatus)}
      </div>
    </div>

    {/* Collapsible Sections */}
    <div className="space-y-4">
      <CollapsibleSection title="Workflow Progress" defaultOpen={true} icon={Activity}>
        <WorkflowProgressTimeline workflowInstanceId={booking.workflowInstanceId} />
      </CollapsibleSection>

      <CollapsibleSection title="Booking Details" defaultOpen={true} icon={FileText}>
        <BookingDetailsForm booking={booking} onFieldSave={handleFieldSave} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Route Legs"
        defaultOpen={true}
        icon={Route}
        actions={
          canEditRoute && (
            <Button size="sm" variant="outline" onClick={() => setShowAddLeg(true)}>
              <Plus className="w-3 h-3 mr-1" />
              Add Leg
            </Button>
          )
        }
      >
        <BookingLegsTimeline
          bookingId={booking.id}
          editable={booking.workflowStatus === 'plan_route'}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Cargo Details"
        defaultOpen={true}
        icon={Package}
        actions={
          canEditCargo && (
            <Button size="sm" variant="outline" onClick={() => setShowAddCargo(true)}>
              <Plus className="w-3 h-3 mr-1" />
              Add {booking.cargoType === 'fcl' ? 'Container' : 'Cargo'}
            </Button>
          )
        }
      >
        <Tabs defaultValue={booking.cargoType}>
          <TabsList>
            <TabsTrigger value="fcl">FCL Containers</TabsTrigger>
            <TabsTrigger value="lcl">LCL Cargo</TabsTrigger>
          </TabsList>
          <TabsContent value="fcl">
            <BookingContainersTable
              bookingId={booking.id}
              editable={booking.workflowStatus === 'add_cargo'}
            />
          </TabsContent>
          <TabsContent value="lcl">
            <BookingCargoTable
              bookingId={booking.id}
              editable={booking.workflowStatus === 'add_cargo'}
            />
          </TabsContent>
        </Tabs>
      </CollapsibleSection>

      <CollapsibleSection title="Documents" defaultOpen={false} icon={FileText}>
        <BookingDocumentsSection
          bookingId={booking.id}
          workflowGeneratedDocs={workflowGeneratedDocs}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Exceptions"
        defaultOpen={false}
        icon={AlertTriangle}
        actions={
          <Button size="sm" variant="outline" onClick={() => setShowReportException(true)}>
            <Plus className="w-3 h-3 mr-1" />
            Report Exception
          </Button>
        }
      >
        <BookingExceptionsTable bookingId={booking.id} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Amendments"
        defaultOpen={false}
        icon={Edit}
        actions={
          canAmend && (
            <Button size="sm" variant="outline" onClick={() => setShowRequestAmendment(true)}>
              <Plus className="w-3 h-3 mr-1" />
              Request Amendment
            </Button>
          )
        }
      >
        <BookingAmendmentsTable bookingId={booking.id} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Invoices"
        defaultOpen={false}
        icon={Receipt}
        actions={
          canInvoice && (
            <Button size="sm" variant="outline" onClick={() => setShowGenerateInvoice(true)}>
              <Plus className="w-3 h-3 mr-1" />
              Generate Invoice
            </Button>
          )
        }
      >
        <BookingInvoicesTable bookingId={booking.id} />
      </CollapsibleSection>

      <CollapsibleSection title="Tasks" defaultOpen={false} icon={CheckSquare}>
        <BookingTasksSection
          bookingId={booking.id}
          workflowInstanceId={booking.workflowInstanceId}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Notes" defaultOpen={false} icon={StickyNote}>
        <textarea
          className="w-full h-32 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          placeholder="Add internal notes about this booking..."
          defaultValue={booking.notes || ''}
          onBlur={(e) => {
            if (e.target.value !== (booking.notes || '')) {
              handleFieldSave('notes', e.target.value)
            }
          }}
        />
      </CollapsibleSection>
    </div>
  </PageBody>
</Page>
```

#### Section Components

**1. WorkflowProgressTimeline Component**

**File**: `packages/fms/src/modules/fms_booking/components/WorkflowProgressTimeline.tsx`

Visual timeline showing workflow execution with steps, activities, and events.

```tsx
<div className="space-y-3">
  {workflowSteps.map((step, index) => (
    <div key={step.id} className="flex gap-3">
      {/* Step Icon */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getStepIconStyle(step.status)}`}>
          {step.status === 'completed' && <Check className="w-4 h-4" />}
          {step.status === 'in_progress' && <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />}
          {step.status === 'failed' && <X className="w-4 h-4" />}
          {step.status === 'pending' && <div className="w-3 h-3 bg-gray-300 rounded-full" />}
        </div>
        {index < workflowSteps.length - 1 && (
          <div className={`w-0.5 h-full min-h-[40px] ${step.status === 'completed' ? 'bg-green-500' : 'bg-gray-200'}`} />
        )}
      </div>

      {/* Step Details */}
      <div className="flex-1 pb-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm text-gray-900">{step.name}</h4>
          {step.completedAt && (
            <span className="text-xs text-gray-500">
              {formatRelativeTime(step.completedAt)}
            </span>
          )}
        </div>
        {step.description && <p className="text-xs text-gray-600 mt-1">{step.description}</p>}

        {/* Activities executed */}
        {step.activities && step.activities.length > 0 && (
          <div className="mt-2 space-y-1">
            {step.activities.map(activity => (
              <div key={activity.id} className="text-xs text-gray-600 pl-3 border-l-2 border-gray-200">
                └─ {activity.description}
              </div>
            ))}
          </div>
        )}

        {/* Pending user task */}
        {step.userTask && step.status === 'in_progress' && (
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-900">
                  Assigned to: {step.userTask.assignedTo?.name || 'You'}
                </p>
                {step.userTask.slaDueAt && (
                  <p className="text-xs text-blue-700">
                    Due {formatSLA(step.userTask.slaDueAt)}
                  </p>
                )}
              </div>
              <Button size="sm" onClick={() => completeTask(step.userTask.id)}>
                Complete Task
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  ))}
</div>
```

**2. BookingDetailsForm Component**

**File**: `packages/fms/src/modules/fms_booking/components/BookingDetailsForm.tsx`

Form with inline field editing (similar to QuoteDetailsTable pattern).

```tsx
<div className="grid grid-cols-2 gap-x-8 gap-y-4">
  {/* Left Column */}
  <div className="space-y-4">
    <Field label="Booking Number" value={booking.bookingNumber} readOnly />
    <Field
      label="Customer"
      value={booking.client?.name}
      editable={!isLocked}
      editor="searchableSelect"
      editorConfig={{ endpoint: '/api/contractors?type=client' }}
      onSave={(value) => handleFieldSave('clientId', value)}
    />
    <Field
      label="Customer Reference"
      value={booking.clientReference}
      editable={!isLocked}
      onSave={(value) => handleFieldSave('clientReference', value)}
    />
    <Field
      label="PO Number"
      value={booking.poNumber}
      editable={!isLocked}
      onSave={(value) => handleFieldSave('poNumber', value)}
    />
    <Field label="Status" value={booking.workflowStatus} readOnly />
  </div>

  {/* Right Column */}
  <div className="space-y-4">
    <Field
      label="Booking Date"
      value={booking.bookingDate}
      type="date"
      editable={!isLocked}
      onSave={(value) => handleFieldSave('bookingDate', value)}
    />
    <Field
      label="Requested Pickup Date"
      value={booking.requestedPickupDate}
      type="date"
      editable={!isLocked}
      onSave={(value) => handleFieldSave('requestedPickupDate', value)}
    />
    <Field
      label="Requested Delivery Date"
      value={booking.requestedDeliveryDate}
      type="date"
      editable={!isLocked}
      onSave={(value) => handleFieldSave('requestedDeliveryDate', value)}
    />
    <Field
      label="Linked Quote"
      value={booking.quote?.quoteNumber}
      type="link"
      href={`/backend/fms-quotes/${booking.quoteId}`}
    />
  </div>
</div>
```

**3. BookingContainersTable Component**

**File**: `packages/fms/src/modules/fms_booking/components/BookingContainersTable.tsx`

DynamicTable for managing FCL containers (similar to QuoteOffersSection pattern).

```tsx
<DynamicTable
  tableId="booking-containers"
  columns={containerColumns}
  data={containers}
  onCellSave={handleContainerSave}
  onNewRowSave={handleAddContainer}
  onRowDelete={handleDeleteContainer}
  editable={editable}
  emptyState={
    <div className="text-center py-8">
      <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
      <p className="text-sm text-gray-500">No containers added yet</p>
      {editable && (
        <Button size="sm" variant="outline" className="mt-2" onClick={onAddContainer}>
          <Plus className="w-4 h-4 mr-1" />
          Add Container
        </Button>
      )}
    </div>
  }
/>
```

**Container Columns:**
```typescript
const containerColumns: ColumnDef[] = [
  { id: 'containerNumber', field: 'containerNumber', header: 'Container #', width: 140, editable: true },
  { id: 'containerType', field: 'containerType', header: 'Type', width: 100, editor: 'select', editorConfig: { options: ['20GP', '40GP', '40HC', '45HC', '20RF', '40RF'] } },
  { id: 'sealNumber', field: 'sealNumber', header: 'Seal #', width: 120, editable: true },
  { id: 'weight', field: 'weight', header: 'Weight (kg)', width: 120, type: 'number', editable: true },
  { id: 'vgmWeight', field: 'vgmWeight', header: 'VGM (kg)', width: 120, type: 'number', editable: true },
  { id: 'vgmDate', field: 'vgmDate', header: 'VGM Date', width: 120, type: 'date', editable: true },
  { id: 'status', field: 'status', header: 'Status', width: 140, renderer: ContainerStatusRenderer },
  { id: 'demurrageCalculated', field: 'demurrageCalculated', header: 'Demurrage', width: 120, renderer: CurrencyRenderer },
  { id: 'detentionCalculated', field: 'detentionCalculated', header: 'Detention', width: 120, renderer: CurrencyRenderer },
]
```

**4. Similar Pattern for Other Tables**

- **BookingCargoTable** - DynamicTable for LCL cargo items
- **BookingExceptionsTable** - DynamicTable for exceptions
- **BookingAmendmentsTable** - DynamicTable for amendments
- **BookingInvoicesTable** - DynamicTable for invoices

### Component Summary

All UI components follow the established fms_quotes pattern using:
- **Page/PageBody** for layout
- **CollapsibleSection** for organizing content
- **DynamicTable** for list data
- **Field** component for inline editing
- **Custom renderers** for badges, statuses, and formatted values

#### List View Components

**File**: `packages/fms/src/modules/fms_booking/backend/bookings/page.tsx`
- Main list page using DynamicTable with perspectives

**File**: `packages/fms/src/modules/fms_booking/components/useTableConfig.ts`
- Hook for column definitions, perspectives, and filters

#### Detail View Components

**File**: `packages/fms/src/modules/fms_booking/backend/bookings/[id]/page.tsx`
- Main detail page with CollapsibleSections

**File**: `packages/fms/src/modules/fms_booking/components/WorkflowProgressTimeline.tsx`
- Visual timeline showing workflow execution with steps, activities, and events
- Displays completed/in-progress/pending states
- Shows user tasks with SLA countdown

**File**: `packages/fms/src/modules/fms_booking/components/WorkflowStepBadge.tsx`
- Color-coded badge showing current workflow step with tooltip
- Shows "Action Required" indicator for pending tasks

**File**: `packages/fms/src/modules/fms_booking/components/BookingDetailsForm.tsx`
- Two-column grid form with inline field editing
- Uses Field component for editable/read-only fields
- Respects workflow lock state

**File**: `packages/fms/src/modules/fms_booking/components/BookingLegsTimeline.tsx`
- Visual vertical timeline for route legs
- Shows carrier confirmation status per leg
- Editable during plan_route step only

**File**: `packages/fms/src/modules/fms_booking/components/BookingContainersTable.tsx`
- DynamicTable for FCL containers
- Inline editing for container details
- Shows demurrage/detention calculations
- Editable during add_cargo step only

**File**: `packages/fms/src/modules/fms_booking/components/BookingCargoTable.tsx`
- DynamicTable for LCL cargo items
- Package-level tracking with dimensions
- Editable during add_cargo step only

**File**: `packages/fms/src/modules/fms_booking/components/BookingDocumentsSection.tsx`
- Integration with fms_documents module
- Upload, categorize, share documents
- Highlights workflow-generated documents

**File**: `packages/fms/src/modules/fms_booking/components/BookingExceptionsTable.tsx`
- DynamicTable for exceptions
- Report damage, delays, customs holds
- Severity and resolution tracking

**File**: `packages/fms/src/modules/fms_booking/components/BookingAmendmentsTable.tsx`
- DynamicTable for amendment requests
- Approval workflow visualization
- Shows before/after changes

**File**: `packages/fms/src/modules/fms_booking/components/BookingInvoicesTable.tsx`
- DynamicTable for customer invoices
- Payment tracking and status
- Link to invoice detail view

**File**: `packages/fms/src/modules/fms_booking/components/BookingTasksSection.tsx`
- Combined view of workflow tasks and manual tasks
- Task assignment and completion
- SLA tracking

#### Shared Components (from @open-mercato/ui)

- **CollapsibleSection** - Reusable section container with icon and actions
- **DynamicTable** - Table with perspectives, filters, inline editing
- **Field** - Inline editable field component
- **Page/PageBody** - Page layout primitives
- **Button, Dialog, Tabs** - UI primitives

## Module Configuration

### Module ID
- **Module ID**: `fms_booking`
- **Module Name**: FMS Booking
- **Module Path**: `packages/fms/src/modules/fms_booking/`

### Features (Permissions)
- `fms_booking.bookings.view` - View bookings
- `fms_booking.bookings.create` - Create bookings (start workflow)
- `fms_booking.bookings.edit` - Edit bookings (during allowed workflow steps)
- `fms_booking.bookings.delete` - Delete/cancel bookings (cancel workflow)
- `fms_booking.bookings.advance` - Advance workflow (complete user tasks)
- `fms_booking.bookings.signal` - Send workflow signals
- `fms_booking.legs.manage` - Manage route legs (during plan_route step)
- `fms_booking.cargo.manage` - Manage cargo (during add_cargo step)

### Search Integration
Entity type: `fms_booking:booking`

**Indexed Fields:**
- bookingNumber
- clientReference
- poNumber
- cargoDescription
- currentStep (workflow step for filtering)

### Workflow Registration

Register booking lifecycle workflow on module initialization:

```typescript
// packages/fms/src/modules/fms_booking/index.ts
import { seedWorkflowDefinition } from './workflows/seeds'

export const metadata = {
  id: 'fms_booking',
  name: 'FMS Booking',
  description: 'Freight booking management with workflow orchestration',
  version: '1.0.0',
}

export async function onModuleInit(container) {
  const em = container.resolve('em')
  const tenantId = container.resolve('tenantId')
  const organizationId = container.resolve('organizationId')

  await seedWorkflowDefinition(em, {
    tenantId,
    organizationId,
    fileName: 'booking-lifecycle-v1.json'
  })
}
```

## Integration Points

### With Core Workflows Module
- **WorkflowDefinition**: Booking lifecycle workflow template
- **WorkflowInstance**: One per booking, tracks execution
- **WorkflowEvent**: Audit trail of all activities and transitions
- **UserTask**: Tasks assigned to booking coordinators
- Activities: CALL_CARRIER_API, GENERATE_DOCUMENT, SEND_EMAIL, EMIT_EVENT

### With Quotes Module (fms_quotes)
- Create booking from accepted **offer** (FmsOffer entity)
- Link booking to both offer and parent quote for traceability
- Pre-fill booking data from offer:
  - Customer (client)
  - Cargo type (FCL/LCL), shipment mode (SEA/AIR/RAIL)
  - Direction (export/import/domestic), incoterms
  - Origin and destination locations
  - Estimated costs and pricing
  - Container types and quantities (if specified in offer)

### With Shipments Module
- Workflow creates Shipment entity during all_legs_confirmed step
- Booking maintains detailed planning/execution data
- Shipment provides high-level tracking view

### With Contractors Module
- Link client (customer)
- Link carriers per leg
- Link container owners (for SOC)
- Call carrier APIs via workflow activities

### With Locations Module (fms_locations)
- Link ports and terminals for legs
- Link depots for container pickup/return

### With Customers Module
- Link shipper, consignee, notify party
- Link pickup/delivery addresses

### With Event System
- Emit events from workflow: booking.validated, booking.confirmed, booking.legs_confirmed, booking.completed, booking.financially_closed
- Listen for carrier webhooks: carrier.leg_confirmed, carrier.leg_failed
- Listen for customer signals: customer.confirmed, delivery.confirmed, financial.close_initiated

### With Financial/Accounting System
- **Invoices**: Link booking to receivable invoices (customer charges) and payable invoices (carrier/vendor costs)
- **Financial Transactions**: Track all costs and revenues per booking
- **Products/Charge Codes**: Use standardized charge codes for booking costs (freight, handling, customs, insurance, etc.)
- **Monthly Close Process**: Financial controller reviews completed bookings (8-14th of month)
- **Margin Calculation**: Auto-calculate margin = (actualCost - estimatedCost) / estimatedCost × 100
- **Demurrage/Detention**: Auto-calculate container demurrage and detention charges

### With Products/Charge Codes Module
- Link booking line items to charge codes (e.g., "Ocean Freight", "Truck Transport", "Customs Clearance")
- Use charge codes for cost estimation and invoicing
- Support multi-currency pricing per charge code
- Track charge code usage for pricing analytics

## Implementation Steps

**Note**: All file paths are relative to `packages/fms/src/modules/fms_booking/`

### Step 1: Workflow Definition (Day 1)
1. Create `workflows/booking-lifecycle-v1.json`
2. Define all steps and transitions
3. Define custom activities (CALL_CARRIER_API, GENERATE_DOCUMENT)
4. Create `workflows/seeds.ts` file to register workflow
5. Test workflow definition (validation, visualization)

### Step 2: Database Schema (Day 2)
1. Create module directory: `packages/fms/src/modules/fms_booking/`
2. Update `data/entities.ts` with workflow fields (workflowInstanceId, currentStep)
3. Add all 5 entities (Booking, BookingLeg, BookingContainer, BookingCargo, BookingLegContainer)
4. Create `data/types.ts`
5. Create `data/validators.ts`
6. Create migration in `migrations/` directory
7. Run migration

### Step 3: Workflow Activity Handlers (Day 3)
1. Create `lib/workflow-handlers.ts`
2. Implement custom activity handlers:
   - generateBookingNumber (format: {TYPE}/{CARGO}/{SEQUENCE}/{YEAR}/{COMPANY})
   - lockBooking
   - createShipmentFromBooking
   - finalizeCosts
   - calculateFinalMargin
   - flagBookingForFinancialReview
   - markBookingFinanciallyClosed
   - callCarrierAPI (generic wrapper)
3. Register handlers with workflow engine

### Step 3b: Demurrage/Detention Calculation (Day 3)
1. Create `lib/demurrage-calculator.ts`
2. Implement auto-calculation logic:
   - Calculate demurrage: max(0, (currentDate - demurrageStartDate - demurrageFreedays) * demurrageCostPerDay)
   - Calculate detention: max(0, (currentDate - detentionStartDate - detentionFreedays) * detentionCostPerDay)
   - Schedule daily job to update calculations
   - Alert when demurrage/detention exceeds threshold
3. Test calculation logic

### Step 3c: Financial Close Scheduler (Day 3)
1. Create `lib/financial-close-scheduler.ts`
2. Implement monthly scheduler:
   - Runs on 8th of each month at 00:00
   - Queries all bookings with status = 'booking_completed' from previous month
   - Sends 'financial.close_initiated' signal to each booking's workflow
   - Creates dashboard for financial controller showing pending reviews
   - Sends email notification to financial controller
3. Test scheduler (use test date override)

### Step 4: API Layer with Workflow Integration (Day 4-5)
1. Create `api/bookings/route.ts` (create starts workflow) → `/api/fms_booking/bookings`
2. Create `api/bookings/from-offer/[offerId]/route.ts` (create from offer) → `/api/fms_booking/bookings/from-offer/:offerId`
3. Create `api/bookings/[id]/route.ts` (update validates workflow state)
4. Create `api/bookings/[id]/workflow/route.ts` (workflow status)
5. Create `api/bookings/[id]/advance/route.ts` (complete user tasks)
6. Create `api/bookings/[id]/signal/route.ts` (send signals)
7. Create `api/bookings/[id]/cancel/route.ts` (cancel workflow)
8. Create nested routes for legs, cargo, containers (workflow-aware)
9. Test all endpoints with correct base path `/api/fms_booking/`

### Step 5: Business Logic & Commands (Day 5)
1. Create `commands/index.ts`
2. Implement `booking.create` (starts workflow)
3. Implement `booking.createFromOffer` (loads offer data, starts workflow)
4. Implement `booking.addLeg` (validates workflow step)
5. Implement `booking.completePlanRoute` (completes user task)
6. Implement `booking.confirmCustomer` (sends signal)
7. Implement `booking.processCarrierWebhook` (sends signal)
8. Implement `booking.cancel` (cancels workflow)
9. Test commands

### Step 6: UI - Workflow Components (Day 6)
1. Create `components/WorkflowProgressTimeline.tsx`
2. Create `components/WorkflowStepBadge.tsx`
3. Create `components/PendingTasksList.tsx`
4. Test workflow visualization

### Step 7: UI - List View (Day 7)
1. Create `backend/bookings/page.tsx` using DynamicTable pattern (following fms_quotes)
2. Create `backend/bookings/page.meta.ts` with metadata
3. Create `components/useTableConfig.ts` with:
   - Column definitions (bookingNumber, workflowStatus, client, dates, etc.)
   - Custom renderers (WorkflowStatusRenderer, CargoTypeBadgeRenderer, TransportModesRenderer)
   - Default perspectives (Action Required, Awaiting Customer, In Transit, etc.)
   - Filter configuration
4. Test list view with perspectives, sorting, filtering

### Step 8: UI - Detail View Header & Components (Day 8)
1. Create `backend/bookings/[id]/page.tsx` with Page/PageBody layout
2. Create `backend/bookings/[id]/page.meta.ts` with metadata
3. Build header section with:
   - Back button, booking icon, title
   - WorkflowStepBadge component
   - Contextual action buttons
4. Create shared components:
   - `components/WorkflowProgressTimeline.tsx` - Vertical timeline for workflow steps
   - `components/WorkflowStepBadge.tsx` - Status badge with colors
   - `components/BookingDetailsForm.tsx` - Two-column form with Field components

### Step 9: UI - Detail View Sections (Day 9)
1. Implement CollapsibleSections (following fms_quotes pattern):
   - Workflow Progress section (WorkflowProgressTimeline)
   - Booking Details section (BookingDetailsForm)
   - Route Legs section (BookingLegsTimeline - visual timeline)
   - Cargo Details section with tabs (BookingContainersTable, BookingCargoTable)
   - Documents section (integration with fms_documents)
   - Exceptions section (BookingExceptionsTable)
   - Amendments section (BookingAmendmentsTable)
   - Invoices section (BookingInvoicesTable)
   - Tasks section (BookingTasksSection)
   - Notes section (textarea)
2. Create DynamicTable components for nested data:
   - `components/BookingContainersTable.tsx`
   - `components/BookingCargoTable.tsx`
   - `components/BookingExceptionsTable.tsx`
   - `components/BookingAmendmentsTable.tsx`
   - `components/BookingInvoicesTable.tsx`
3. Test workflow-aware editing (lock after customer confirmation)
4. Test full workflow: create → plan → cargo → confirm → carrier booking → complete

### Step 10: Carrier Integration (Day 10)
1. Create carrier API client library
2. Implement CALL_CARRIER_API activity handler
3. Create webhook endpoint for carrier responses
4. Test carrier booking workflow

### Step 11: Testing & Polish (Day 11)
1. End-to-end testing of full workflow
2. Error handling and compensation testing
3. SLA monitoring and notifications
4. Documentation
5. Performance optimization

## Testing Strategy

### Workflow Tests
- **Workflow definition validation**: Ensure JSON is valid, all steps/transitions defined
- **Workflow execution**: Test each transition, activity, and guard
- **Parallel execution**: Test parallel carrier booking with success/failure scenarios
- **Compensation**: Test rollback when carrier booking fails
- **Signals**: Test customer confirmation, carrier webhooks
- **Timeouts**: Test SLA timeouts and escalation
- **User tasks**: Test task assignment, claiming, completion

### Integration Tests
- API endpoints with workflow state validation
- Carrier API mocking and webhook handling
- Event emission and handling
- Document generation activities

### E2E Tests
- Create booking from scratch (full workflow)
- Create booking from accepted offer (pre-filled data)
- Add multi-leg route (truck → ship → truck)
- Add cargo/containers
- Confirm booking (trigger workflow)
- Receive carrier confirmations (webhooks)
- Monitor progress
- Complete delivery
- Cancel booking (compensation)
- Handle failures (retry, rollback)

### Manual Testing
See comprehensive checklist in /home/szymon/.claude/plans/glittery-foraging-spark.md

## Scheduled Jobs

### Daily Demurrage/Detention Calculation
- **Schedule**: Daily at 01:00
- **Task**: Update demurrageCalculated and detentionCalculated for all active containers
- **Logic**: For each container with status IN_TRANSIT or DISCHARGED:
  - Calculate days over free period
  - Multiply by per-day cost
  - Update calculated fields
  - Alert if > threshold (e.g., $500)

### Monthly Financial Close Trigger
- **Schedule**: 8th of each month at 00:00
- **Task**: Initiate financial close workflow for completed bookings
- **Logic**:
  - Query bookings with currentStep = 'booking_completed' AND updated_at < first day of current month
  - Send 'financial.close_initiated' signal to each booking's workflow instance
  - Create financial close dashboard for controller
  - Send email notification to financial_controller role

## Performance Considerations

- **Workflow context size**: Keep context lean, store large data in entities
- **Parallel activities**: Use async execution for carrier bookings
- **Event handling**: Use message queue for high-volume events
- **Caching**: Cache workflow definitions, current step on booking entity
- **Indexes**: Index on (workflowInstanceId), (currentStep), (bookingNumber)
- **Demurrage calculation**: Optimize with partial index on active containers only
- **Financial close queries**: Index on (currentStep, updated_at) for monthly close queries

## Monitoring & Observability

- **Workflow events**: Full audit trail of all activities
- **SLA dashboards**: Track task completion times
- **Failed workflows**: Alert on workflow failures
- **Activity retries**: Monitor retry counts and failure rates
- **Carrier API performance**: Track response times and success rates

## Critical Files Reference

All paths relative to `packages/fms/src/modules/fms_booking/`:

### Data Layer
- `data/entities.ts` - All 5 entities with MikroORM decorators
- `data/types.ts` - TypeScript types and enums
- `data/validators.ts` - Zod validation schemas
- `migrations/Migration{TIMESTAMP}.ts` - Database migration

### API Layer
- `api/bookings/route.ts` - Main CRUD (GET, POST)
- `api/bookings/from-offer/[offerId]/route.ts` - Create from offer (POST)
- `api/bookings/[id]/route.ts` - Detail (GET, PUT, DELETE)
- `api/bookings/[id]/workflow/route.ts` - Workflow status
- `api/bookings/[id]/advance/route.ts` - Complete user tasks
- `api/bookings/[id]/signal/route.ts` - Send signals
- `api/bookings/[id]/legs/route.ts` - Manage legs
- `api/bookings/[id]/cargo/route.ts` - Manage cargo
- `api/bookings/[id]/containers/route.ts` - Manage containers

### Business Logic
- `commands/index.ts` - Command handlers
- `lib/workflow-handlers.ts` - Custom workflow activity handlers
- `lib/demurrage-calculator.ts` - Demurrage/detention calculation
- `lib/financial-close-scheduler.ts` - Monthly close trigger

### Workflow
- `workflows/booking-lifecycle-v1.json` - Workflow definition
- `workflows/seeds.ts` - Workflow registration

### UI - Backend
- `backend/bookings/page.tsx` - List view
- `backend/bookings/page.meta.ts` - List metadata
- `backend/bookings/[id]/page.tsx` - Detail view
- `backend/bookings/[id]/page.meta.ts` - Detail metadata

### UI - Components
- `components/WorkflowProgressTimeline.tsx` - Workflow timeline
- `components/WorkflowStepBadge.tsx` - Status badge
- `components/PendingTasksList.tsx` - User tasks list
- `components/BookingRouteLegs.tsx` - Route leg editor
- `components/BookingCargoDetails.tsx` - Cargo editor

### Module Config
- `index.ts` - Module metadata and initialization
- `search.ts` - Search configuration
- `acl.ts` - Access control (optional)

## Future Enhancements

- **Machine learning**: Predict ETD/ETA based on historical data
- **Smart routing**: Auto-suggest optimal route legs
- **Dynamic pricing**: Recalculate costs based on carrier responses
- **Booking templates**: Save common routes as templates
- **Bulk booking**: Create multiple bookings from spreadsheet
- **Mobile app**: Booking coordinator mobile interface
- **Customer portal**: Self-service booking for customers
- **Analytics**: Booking volume, conversion rates, on-time performance
- **Advanced workflows**: Customs clearance sub-workflows, insurance workflows
- **AI assistant**: Natural language booking creation
