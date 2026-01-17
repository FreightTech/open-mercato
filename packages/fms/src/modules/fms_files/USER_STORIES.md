# FMS Files - User Stories

## Overview
User stories for the complete file lifecycle, from initial creation through financial close. Note: In logistics terminology, "File" (Polish: "Teczka") is the industry term for active shipments.

---

## Phase 1: File Creation & Planning

### Story 1: Create a New File
**As a** file coordinator
**I want to** create a new freight file from scratch
**So that** I can start planning a shipment for my customer

**Acceptance Criteria:**
- I can click "New File" button from the files list
- System auto-generates a file number (e.g., `EXP/FCL/00123/2026/ABC`)
- I can select the customer (client) from a dropdown
- I can enter customer reference and PO number
- I can select shipment type (EXP, IMP, RAIL, FTL, LTL, DEPOT)
- I can select cargo type (FCL or LCL)
- File starts in "Draft" status
- System creates a workflow instance to track the file lifecycle

**Example:**
> Sarah, a file coordinator, receives an email from ABC Corp requesting shipping of 2 containers from Shanghai to Los Angeles. She clicks "New File", selects ABC Corp as the client, enters their PO number "PO-12345", selects "EXP" (Export) and "FCL" (Full Container Load). System creates file `EXP/FCL/00001/2026/ABC`.

---

### Story 2: Create File from Accepted Offer
**As a** file coordinator
**I want to** create a file directly from an accepted offer
**So that** I don't have to re-enter information that's already in the pricing proposal

**Acceptance Criteria:**
- I can click "Create File" button from accepted offer detail view
- System pre-fills from offer:
  - Customer (client)
  - Cargo type (FCL/LCL)
  - Direction (export/import)
  - Shipment mode (SEA/AIR/RAIL)
  - Incoterms
  - Container types and quantities (if FCL)
  - Origin and destination ports/locations
  - Estimated costs and pricing
- System links file to both the offer and parent quote for reference
- I can modify the pre-filled information if needed
- File inherits offer reference number

**Example:**
> Mike reviews Offer OFF-2026-001 (from Quote Q-2026-001) that was accepted by XYZ Ltd for 2x40HC Shanghai→LA. He clicks "Create File" on the offer, and the system automatically fills in customer info, 2x40HC containers, FOB Shanghai terms, and the agreed pricing of $4,200. He just needs to add the actual container numbers and pickup date.

---

## Phase 2: Route Planning

### Story 3: Plan Multi-Leg Route
**As a** file coordinator
**I want to** plan the complete transport route with multiple legs
**So that** cargo moves from origin to destination using different transport modes

**Acceptance Criteria:**
- I can add route legs in sequence (1, 2, 3...)
- For each leg, I can specify:
  - Transport mode (truck, ship, train, air, barge)
  - Origin and destination (port, terminal, or address)
  - Carrier company
  - Estimated departure and arrival dates
  - Vessel/flight/truck details
- System shows visual timeline of the route
- I must add at least 1 leg before proceeding
- System validates that legs connect properly (destination of leg 1 = origin of leg 2)

**Example:**
> Emma plans a route for cargo from customer warehouse to final destination:
> - **Leg 1** (Pre-carriage): Truck from "123 Factory Rd, Shanghai" to "Shanghai Port" via Shanghai Express Logistics
> - **Leg 2** (Main carriage): Ship from "Shanghai Port" to "Los Angeles Port" via Maersk, vessel "MAERSK SEALAND", voyage "V123"
> - **Leg 3** (On-carriage): Truck from "Los Angeles Port" to "789 Warehouse Ave, Los Angeles" via LA Trucking Co.

---

### Story 4: Complete Route Planning
**As a** file coordinator
**I want to** mark the route planning as complete
**So that** the workflow advances to cargo entry

**Acceptance Criteria:**
- I can click "Complete Planning" button
- System validates at least 1 route leg exists
- System shows me an SLA countdown (due in 2 hours from file creation)
- If SLA is approaching, system highlights booking in "Action Required" list
- Workflow advances to "Add Cargo Details" step

**Example:**
> After adding 3 route legs, Sarah clicks "Complete Planning". System confirms all legs are valid and moves the file to the cargo entry phase.

---

## Phase 3: Cargo Entry

### Story 5: Add FCL Container Details
**As a** file coordinator
**I want to** add container information for full container loads
**So that** I can track each container through its journey

**Acceptance Criteria:**
- I can add multiple containers to the file
- For each container, I can enter:
  - Container number (if known, or leave blank for carrier-provided)
  - Container type (20GP, 40GP, 40HC, etc.)
  - Cargo description
  - Weight and volume
  - Seal number
  - VGM (Verified Gross Mass) weight and date
  - Special flags: dangerous goods, reefer temperature requirements
- System validates VGM is required for ocean shipments
- I can specify which legs each container travels on (for transshipment tracking)

**Example:**
> Tom adds 2 containers to the file:
> - Container TCLU1234567: 40HC, electronics, 18,500 kg, VGM 19,200 kg
> - Container TCLU7654321: 40HC, furniture, 16,800 kg, VGM 17,500 kg

---

### Story 6: Add LCL Cargo Items
**As a** file coordinator
**I want to** add individual cargo items for less-than-container loads
**So that** I can track loose cargo that shares container space

**Acceptance Criteria:**
- I can add multiple cargo line items
- For each item, I can enter:
  - Cargo description and HS code
  - Number of packages and package type (pallets, cartons, crates)
  - Weight, volume, and dimensions (L x W x H)
  - Declared value for insurance
  - Handling requirements (stackable, fragile, refrigerated)
  - Marks and numbers
- System calculates total weight and volume across all items
- System flags if dangerous goods require special documentation

**Example:**
> Lisa enters 3 cargo items for a shared container:
> - 10 pallets of textiles, 2,400 kg, 8.5 m³, stackable
> - 5 cartons of electronics, 380 kg, 1.2 m³, fragile, declared value $15,000
> - 2 crates of machinery parts, 950 kg, 2.8 m³, requires insurance

---

### Story 7: Complete Cargo Entry
**As a** file coordinator
**I want to** mark cargo entry as complete
**So that** the system can validate and prepare for customer confirmation

**Acceptance Criteria:**
- I can click "Complete Cargo Entry" button
- System validates:
  - FCL files have at least 1 container
  - LCL files have at least 1 cargo item
  - All required fields are filled
  - Dangerous goods have UN numbers and hazard classes
  - Reefer containers have temperature requirements
- Workflow advances to "Validate Booking" step
- System shows 2-hour SLA countdown

**Example:**
> After entering all container details, Sarah clicks "Complete Cargo Entry". System validates everything is correct and automatically moves to validation.

---

## Phase 4: Validation & Customer Confirmation

### Story 8: Automated File Validation
**As a** file coordinator
**I want to** the system to automatically validate my file
**So that** I can catch errors before sending to the customer

**Acceptance Criteria:**
- System automatically validates when cargo entry is complete
- Validation checks:
  - Route legs exist and connect properly
  - Cargo/containers exist
  - Special requirements are documented (hazmat, reefer)
  - Cut-off dates are in the future (for exports)
  - Required customs fields are filled (for international shipments)
- If validation passes: workflow moves to "Await Customer Confirmation"
- If validation fails: workflow goes back to "Plan Route" with error messages
- System emits "booking.validated" event

**Example:**
> System validates Emma's booking and finds all requirements met. It automatically sends a review email to the customer and waits for confirmation.

---

### Story 9: Customer Reviews and Confirms Booking
**As a** customer (external user)
**I want to** review and confirm the file details
**So that** I can approve the shipment plan before execution

**Acceptance Criteria:**
- I receive an email with file summary
- Email includes: pickup date, delivery date, route, cargo details, pricing estimate
- I can click "Confirm File" link in email (or confirm via customer portal)
- System has a 48-hour timeout - if I don't respond, file auto-cancels
- When I confirm, workflow advances to "File Confirmed"

**Example:**
> ABC Corp's logistics manager receives file review email, checks the details match their requirements, and clicks "Confirm File" within 24 hours.

---

### Story 10: Handle Customer Rejection
**As a** file coordinator
**I want to** be notified if customer doesn't confirm within 48 hours
**So that** I can follow up or cancel the file

**Acceptance Criteria:**
- System sends reminder email to customer after 24 hours (50% of timeout)
- If 48 hours pass without confirmation, system auto-cancels file
- System sends cancellation notification to coordinator and customer
- Coordinator can manually cancel anytime during wait period
- Cancelled files move to "Cancelled" status with reason "Customer timeout"

**Example:**
> After 26 hours, XYZ Ltd hasn't responded. System sends reminder. At 48 hours still no response - system cancels file and notifies Mike to follow up.

---

## Phase 5: Carrier Reservation & Execution

### Story 11: Automatic Carrier Reservation (System)
**As a** file coordinator
**I want to** the system to automatically book with carriers
**So that** I don't have to manually contact each carrier for each leg

**Acceptance Criteria:**
- When customer confirms, system automatically sends reservation requests to all carriers in parallel
- System calls carrier API for each leg with:
  - Origin and destination
  - Cargo details (type, weight, volume)
  - Container requirements
  - Requested departure date
- System retries failed API calls up to 3 times
- System stores carrier reservation reference numbers
- If ANY leg fails, system automatically cancels all confirmed legs (compensation)

**Example:**
> Customer confirms file. System simultaneously books:
> - Shanghai Express Logistics (Leg 1) - confirms instantly, ref "SXL-98765"
> - Maersk (Leg 2) - confirms after 30 seconds, ref "MAEU-12345678"
> - LA Trucking (Leg 3) - confirms after 15 seconds, ref "LAT-4567"

---

### Story 12: Handle Carrier Reservation Failure
**As a** file coordinator
**I want to** be notified when carrier reservation fails
**So that** I can manually intervene and find alternatives

**Acceptance Criteria:**
- If carrier API fails after 3 retries, system triggers compensation
- System automatically cancels any legs that were already confirmed
- System sends urgent notification to coordinator with:
  - Which leg failed
  - Failure reason (API timeout, carrier rejected, no capacity, etc.)
  - Alternative carrier suggestions (if available)
- Coordinator can manually book with alternative carrier
- Once manual booking succeeds, coordinator can signal workflow to continue

**Example:**
> Maersk API returns "No capacity available" for requested sailing. System cancels the truck files and alerts Sarah. She finds alternative carrier CMA CGM, manually books vessel "CMA LIBERTY", and enters file reference in system.

---

### Story 13: Create Shipment for Tracking
**As a** file coordinator
**I want to** the system to automatically create a shipment record
**So that** I can track the cargo's journey in the shipment tracking system

**Acceptance Criteria:**
- When all carrier legs are confirmed, system auto-creates Shipment entity
- Shipment inherits key data from booking:
  - Customer, cargo type, container numbers
  - Origin and destination ports
  - Carrier and vessel details
  - ETD/ETA dates
- File links to shipment via shipmentId field
- System emits "booking.legs_confirmed" event
- Filestatus changes to "In Transit"

**Example:**
> All 3 carriers confirm. System creates Shipment S-2026-00123 linking to FileEXP/FCL/00001/2026/ABC. Emma can now use the shipment tracking dashboard to monitor progress.

---

## Phase 6: Monitoring & Delivery

### Story 14: Automatic Tracking Updates
**As a** file coordinator
**I want to** the system to automatically poll carrier tracking
**So that** I have real-time visibility without manual checks

**Acceptance Criteria:**
- System polls carrier APIs every 4 hours for tracking updates
- System updates:
  - Actual departure/arrival times (ATD/ATA)
  - Current location
  - Container status (gate in, loaded, in transit, discharged, etc.)
  - Revised ETA if delays occur
- System emits "tracking.updated" events
- Dashboard shows live status for each leg
- System sends alerts for:
  - Delays > 24 hours
  - Container status changes
  - Arrival at destination port

**Example:**
> System polls Maersk API and finds vessel departed Shanghai 2 hours late due to weather. System updates ATD and revises ETA at Los Angeles by +2 hours. Sarah receives delay notification.

---

### Story 15: Calculate Demurrage & Detention
**As a** file coordinator
**I want to** the system to automatically calculate demurrage and detention charges
**So that** I can proactively manage costs and avoid surprises

**Acceptance Criteria:**
- System runs daily calculation at 01:00 for all active containers
- For each container, system calculates:
  - **Demurrage**: Days container stays at port beyond free days × rate per day
  - **Detention**: Days container is held beyond free days after gate-out × rate per day
- System alerts when charges exceed $500
- Coordinator can see calculated charges in container detail view
- System flags containers approaching free day limits (2 days before)

**Example:**
> Container TCLU1234567 arrived at LA Port on Jan 1. Free days = 7. On Jan 9 (day 8), system calculates demurrage: 1 day × $150/day = $150. On Jan 15, it alerts Tom: "Demurrage now $1,050 - arrange pickup urgently!"

---

### Story 16: Confirm Delivery
**As a** file coordinator
**I want to** confirm when cargo is delivered to final destination
**So that** the file can move to completion

**Acceptance Criteria:**
- I can click "Confirm Delivery" button from file detail view
- System asks for:
  - Actual delivery date/time
  - Delivery proof (upload POD - Proof of Delivery document)
  - Any delivery issues/notes
- System validates all containers are in "Delivered" status
- Workflow advances to "File Completed" step
- System emits "delivery.confirmed" signal
- Customer receives delivery confirmation email

**Example:**
> Tom receives signed delivery receipt from customer on Jan 20. He uploads the POD document and clicks "Confirm Delivery". System marks booking complete and notifies ABC Corp.

---

## Phase 7: Financial Close

### Story 17: Monthly Financial Close Trigger
**As a** financial controller
**I want to** the system to automatically flag completed files for review
**So that** I can perform monthly financial close efficiently

**Acceptance Criteria:**
- System runs monthly on 8th of each month at 00:00
- System queries all files with:
  - Status = "File Completed"
  - Completed date in previous month
- System sends "financial.close_initiated" signal to each file's workflow
- System creates "Financial Close Dashboard" showing:
  - All files pending review (grouped by coordinator)
  - Estimated vs. actual costs
  - Calculated margin percentage
  - Missing invoices
- Financial controller receives email notification with dashboard link

**Example:**
> On February 8, 2026, system finds 45 files completed in January. It flags them all for review and emails Janet (financial controller): "45 January files ready for financial close."

---

### Story 18: Review File Financials
**As a** financial controller
**I want to** review the actual costs vs. estimates for a booking
**So that** I can ensure accuracy before closing the books

**Acceptance Criteria:**
- I can open booking from financial close dashboard
- System displays:
  - **Estimated costs** (from quote/initial booking)
  - **Actual costs** (from carrier invoices, demurrage, detention, handling fees)
  - **Calculated margin**: (actualCost - estimatedCost) / estimatedCost × 100
  - **Revenue** (customer invoice amount)
  - **Profit**: Revenue - actualCost
- System shows checklist:
  - ☐ All carrier invoices received and entered
  - ☐ All additional costs entered (demurrage, storage, customs fees)
  - ☐ Customer invoice sent and recorded
  - ☐ All costs allocated to correct GL accounts
- I can add/edit costs if invoices were missing

**Example:**
> Janet reviews FileEXP/FCL/00001/2026/ABC:
> - Estimated: $8,500
> - Actual: $9,200 ($8,000 freight + $600 demurrage + $600 documentation)
> - Margin: -8.2% (worse than estimate due to demurrage)
> - Revenue: $10,500
> - Profit: $1,300

---

### Story 19: Approve Financial Close
**As a** financial controller
**I want to** approve the financial close for a booking
**So that** it's locked and included in monthly reports

**Acceptance Criteria:**
- I can click "Approve Financial Close" button
- System validates:
  - All invoices are reconciled
  - Actual cost is greater than zero
  - Customer invoice is recorded
- System updates:
  - Filestatus to "Financially Closed"
  - Final margin and profit figures locked
  - File marked as reviewed and approved
- System generates monthly controlling report (PDF) with:
  - Filesummary
  - Cost breakdown
  - Margin analysis
  - Invoice references
- System emits "booking.financially_closed" event
- File moves to END of workflow

**Example:**
> After verifying all invoices are correct, Janet approves financial close for 45 January files. System generates January 2026 Controlling Report showing total revenue $472,000, costs $398,000, profit $74,000, avg margin 15.7%.

---

### Story 20: Handle Missing Invoices
**As a** financial controller
**I want to** flag files with missing invoices
**So that** they don't block month-end close

**Acceptance Criteria:**
- If I try to approve close but validation fails, system shows error:
  - "Missing carrier invoice from Maersk for Leg 2"
  - "Customer invoice not recorded"
- I can click "Flag for Follow-up" to:
  - Add note about missing invoice
  - Assign to coordinator to obtain invoice
  - Set reminder date
- Fileremains in "Financial Close" step (not approved)
- I can approve other files and return to flagged ones later
- System reminds coordinator daily until invoice is received

**Example:**
> Janet finds booking EXP/FCL/00015/2026/ABC is missing Maersk invoice. She flags it, assigns to Sarah: "Please obtain final invoice from Maersk for voyage V789." Sarah follows up, receives invoice on Feb 12, enters it. Janet approves close on Feb 13.

---

## Phase 8: Cancellation & Error Handling

### Story 21: Cancel File (Before Confirmation)
**As a** file coordinator
**I want to** cancel a file that's not yet confirmed
**So that** I can remove files that are no longer needed

**Acceptance Criteria:**
- I can click "Cancel File" button from any status before "File Confirmed"
- System asks for cancellation reason
- System immediately:
  - Marks file status as "Cancelled"
  - Stops workflow execution
  - Cancels any scheduled activities (customer reminders, etc.)
  - Notifies customer (if they were waiting to confirm)
- Cancelled files appear in "Cancelled" perspective
- I can view cancellation reason and who cancelled

**Example:**
> Customer emails Sarah that they postponed shipment. Sarah opens booking and clicks "Cancel", enters reason "Customer postponed - will rebook later". System cancels and archives booking.

---

### Story 22: Cancel File (After Carrier Reservation)
**As a** file coordinator
**I want to** cancel a file after carriers were booked
**So that** I can handle customer cancellations properly

**Acceptance Criteria:**
- I can click "Cancel File" button (even after carriers confirmed)
- System shows WARNING: "This will cancel carrier reservations. Are you sure?"
- If I confirm, system:
  - Calls carrier cancellation APIs for all confirmed legs
  - Sends cancellation emails to carriers
  - Calculates cancellation fees (if applicable)
  - Notifies customer
  - Marks booking as "Cancelled"
- System records:
  - Cancellation charges from carriers
  - Reason for cancellation
  - Time cancelled
- Workflow executes compensation activities
- Customer is invoiced for cancellation fees

**Example:**
> Customer cancels shipment 1 day before pickup. Mike cancels file, system automatically cancels truck booking (free), ship booking ($500 cancellation fee), and second truck (free). Mike invoices customer for $500 carrier cancellation fee + admin fee.

---

## Phase 9: Document Management

### Story 23: Upload and Categorize Documents
**As a** file coordinator
**I want to** upload required shipping documents to the file
**So that** I have all documentation organized for customs, delivery, and billing

**Acceptance Criteria:**
- I can upload documents from file detail view
- For each document, I can select category:
  - Bill of Lading (BOL)
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
- I can enter document number (e.g., BOL number) and description
- System validates file type (PDF, JPG, PNG) and size (max 25MB)
- Documents appear in Documents section with upload date and who uploaded
- I can mark documents as "Verified" after review
- System shows checklist of required documents based on shipment type
- System uses AI to extract key data from documents (BOL number, invoice amount, etc.)

**Example:**
> Sarah uploads the carrier's Bill of Lading (BOL-MAEU-12345678.pdf), selects category "Bill of Lading", enters BOL number. System adds it to the file using fms_documents module and checks off "BOL" on the required documents checklist.

**Technical Note:** This feature integrates with the existing `fms_documents` module. Documents are linked to files using `relatedEntityType = 'fms_files:booking'` and `relatedEntityId = bookingId`.

---

### Story 24: Share Documents with Stakeholders
**As a** file coordinator
**I want to** share specific documents with customers, carriers, or customs brokers
**So that** stakeholders have access to required documentation

**Acceptance Criteria:**
- I can select one or more documents from booking
- I can click "Share" and select recipients:
  - Customer (client)
  - Carrier (per leg)
  - Customs broker
  - Other email addresses
- System sends email with secure download links
- Download links expire after 7 days
- I can see who documents were shared with and when
- Recipients can download but not delete documents

**Example:**
> Tom shares BOL, commercial invoice, and packing list with customs broker. Broker receives email with 3 download links, valid for 7 days.

---

### Story 25: Upload and Link Bill of Lading (BOL) from Carrier
**As a** file coordinator
**I want to** upload the Bill of Lading received from the carrier and link it to the file
**So that** I have the official BOL document attached and can track it

**Acceptance Criteria:**
- I can upload BOL PDF received from carrier (via email or carrier portal)
- System links document to file with category "Bill of Lading"
- I can enter BOL number and it's stored as document metadata
- System extracts BOL number from PDF using AI (optional, for validation)
- I can see BOL status: "Draft" (from carrier) or "Final" (confirmed)
- BOL document appears in Documents section with date uploaded
- System alerts if BOL is missing 48 hours before vessel departure
- I can share BOL with customer, customs broker, and destination agent

**Example:**
> Emma receives BOL (MAEU-BOL-12345678.pdf) from Maersk via email. She uploads it to the file, system auto-detects BOL number from PDF, and marks document as "Bill of Lading". Document is now available for sharing with customer and customs broker.

**Note:** BOL documents are generated by carrier systems (e.g., Maersk, MSC, CMA CGM portals). This feature is for uploading and managing carrier-issued BOLs, not generating them.

---

### Story 26: Track Required Documents
**As a** file coordinator
**I want to** see which documents are missing for each booking
**So that** I can chase them before deadlines and avoid delays

**Acceptance Criteria:**
- System shows "Required Documents" checklist based on:
  - Shipment type (EXP/IMP)
  - Cargo type (FCL/LCL)
  - Special requirements (dangerous goods, food products)
  - Destination country regulations
- Each document shows status:
  - ✅ Uploaded and verified
  - ⏳ Uploaded, pending verification
  - ❌ Missing
- System alerts 24 hours before document deadlines
- I can mark documents as "Not Required" with reason
- Dashboard shows all files with missing documents

**Example:**
> Import file shows checklist: ✅ BOL, ✅ Commercial Invoice, ❌ ISF Filing (due in 18 hours). System alerts Sarah to submit ISF urgently.

---

## Phase 10: File Amendments

### Story 27: Request File Amendment
**As a** file coordinator
**I want to** request changes to a confirmed file
**So that** I can accommodate customer changes before vessel departure

**Acceptance Criteria:**
- I can click "Request Amendment" after booking is confirmed but before vessel departure
- I can specify what to change:
  - Cargo details (container count, weight, volume)
  - Dates (ETD, pickup date)
  - Pickup/delivery address
  - Special instructions
- System creates amendment request with:
  - Current values vs. proposed values (diff view)
  - Timestamp of request
  - Requestor (user who requested)
- System checks with carrier if change is possible (API call or manual follow-up required)
- Filestays in "Amendment Pending" status
- Original data is preserved for audit trail

**Example:**
> Customer wants to add 1 more container to confirmed file. Sarah clicks "Request Amendment", changes container count from 2 to 3. System creates amendment request and marks booking as "Amendment Pending".

---

### Story 28: Approve/Reject Amendment
**As a** file coordinator
**I want to** approve or reject amendment requests based on carrier feedback
**So that** file data is updated only when carrier confirms

**Acceptance Criteria:**
- I can view pending amendments in amendments dashboard
- For each amendment, I can see:
  - What changed (old vs. new values)
  - When requested
  - Carrier feedback (confirmed/rejected/fee applies)
- If carrier confirms, I can:
  - Enter amendment fee (if any)
  - Approve amendment → system updates file data
  - Notify customer of approval and fee
- If carrier rejects, I can:
  - Reject amendment → booking reverts to original data
  - Add rejection reason
  - Notify customer with alternative options
- All amendments are logged in booking history

**Example:**
> Carrier confirms they can add 3rd container but charge $200 amendment fee. Sarah approves amendment, enters fee, updates booking. Customer is notified: "Amendment approved - additional container added. Amendment fee: $200."

---

### Story 29: Amendment Fee Calculation
**As a** file coordinator
**I want to** the system to calculate amendment fees
**So that** customers are charged correctly for last-minute changes

**Acceptance Criteria:**
- System calculates amendment fee based on:
  - How close to departure (< 7 days = higher fee)
  - Type of change (major vs. minor)
  - Carrier's amendment fee schedule
- I can override calculated fee with manual entry
- Fee is added to booking costs
- Fee appears on customer invoice as separate line item
- System tracks: base amendment fee + carrier pass-through fees

**Example:**
> Amendment requested 3 days before ETD (within 7-day window). System calculates: base fee $150 + carrier pass-through $200 = total $350. Sarah reviews and approves.

---

### Story 30: Cancel and Re-create File (Amendment Not Possible)
**As a** file coordinator
**I want to** cancel original file and create new one when amendment is not possible
**So that** I can handle major customer changes

**Acceptance Criteria:**
- If carrier rejects amendment (e.g., no space for extra containers), I can click "Cancel and Re-create File"
- System:
  - Cancels original file (with reason: "Rebooked due to customer changes")
  - Creates new file with amended details
  - Links new booking to original (for audit trail)
  - Transfers documents from original to new booking
  - Calculates cancellation fees from original + new booking costs
- I can notify customer of cancellation fees and new file confirmation
- Original file marked as "Cancelled - Rebooked" (not just "Cancelled")

**Example:**
> Customer wants to change ETD by 2 weeks - carrier says must cancel and rebook. Sarah clicks "Cancel and Re-create File", system cancels original (fee $500), creates new file for new date, transfers all documents. Customer invoiced $500 cancellation fee.

---

## Phase 11: Exception Handling

### Story 31: Report Cargo Damage or Shortage
**As a** file coordinator
**I want to** record cargo damage or shortage when reported
**So that** I can track issues and process claims

**Acceptance Criteria:**
- I can click "Report Exception" from file detail
- I can select exception type:
  - Cargo Damage
  - Cargo Shortage (less cargo than expected)
  - Container Damage
  - Package Damage
- I can enter:
  - Description of damage/shortage
  - Extent (partial/total loss)
  - Estimated value of loss
  - When discovered (at port, at delivery)
  - Photos (upload multiple)
- System creates exception record with:
  - Exception ID
  - Severity (minor/moderate/critical)
  - Status (reported/investigating/resolved)
  - Assigned to (user responsible for resolution)
- Customer and carrier are notified automatically
- Exception appears on booking dashboard with red flag

**Example:**
> Upon delivery, customer reports 1 of 10 pallets damaged by forklift. Sarah creates exception: "Cargo Damage - Partial", uploads 3 photos, estimates loss $1,200. System assigns to claims team and notifies customer and carrier.

---

### Story 32: Handle Major Delays (> 7 Days)
**As a** file coordinator
**I want to** manage files with significant delays
**So that** I can keep customers informed and explore alternatives

**Acceptance Criteria:**
- When tracking shows delay > 7 days, system auto-creates "Major Delay" exception
- I receive urgent notification with:
  - Filedetails
  - Original ETA vs. revised ETA
  - Delay reason (from carrier)
  - Impact on customer's operations
- I can take actions:
  - Notify customer immediately
  - Request expedited shipping at destination
  - Explore alternative routing (if still in transit)
  - Negotiate compensation with carrier
  - Update delivery appointments
- System tracks:
  - Delay duration
  - Root cause
  - Customer impact
  - Compensation agreed
- Delay appears on operations manager's exception dashboard

**Example:**
> Vessel delayed 10 days due to engine failure. System alerts Tom with urgent notification. He emails customer explaining situation, negotiates $800 credit with carrier for delay, updates ETA, reschedules delivery.

---

### Story 33: Manage Customs Hold
**As a** file coordinator
**I want to** handle situations where customs holds cargo
**So that** I can resolve issues quickly and minimize delays

**Acceptance Criteria:**
- When customs hold detected (from tracking or manual report), I can create "Customs Hold" exception
- I can record:
  - Hold reason (missing documents, valuation dispute, inspection required)
  - Which documents are missing or incorrect
  - Duties/taxes amount in question
  - Customs officer contact info
- I can assign to customs broker for resolution
- System tracks time in customs hold (alerts if > 48 hours)
- I can upload additional documents to resolve hold
- When cleared, I can mark exception as "Resolved" and record resolution details
- Customer receives updates at key milestones

**Example:**
> Customs holds shipment - missing certificate of origin. Sarah creates "Customs Hold" exception, uploads correct certificate, assigns to customs broker. Broker submits to customs. Cargo released 36 hours later. Sarah marks resolved.

---

### Story 34: Track and Resolve Disputes
**As a** file coordinator
**I want to** manage disputes with customers or carriers
**So that** issues are tracked and resolved formally

**Acceptance Criteria:**
- I can create "Dispute" exception for:
  - Customer disputes invoice amount
  - Customer disputes delivery condition
  - Carrier disputes liability for damage
  - Disagreement on charges (demurrage, detention)
- I can record:
  - Dispute type and description
  - Customer's position vs. our position
  - Supporting evidence (documents, emails, photos)
  - Proposed resolution
- I can assign to:
  - Operations manager (for review)
  - Legal team (if escalated)
  - Finance team (for invoice adjustments)
- System tracks dispute lifecycle:
  - Open → Under Review → Resolution Proposed → Accepted/Rejected → Closed
- Resolution (credit note, carrier claim, agreed split) is recorded
- All communications logged in dispute timeline

**Example:**
> Customer disputes $1,200 demurrage charge, claims they returned container on time. Mike creates dispute, uploads gate-out receipt, assigns to operations manager. After review, manager agrees to split 50/50 - issue $600 credit note. Dispute closed.

---

## Phase 12: Invoicing & Billing

### Story 35: Generate Customer Invoice
**As a** file coordinator (or billing specialist)
**I want to** generate a professional invoice for the customer
**So that** I can bill them for freight services

**Acceptance Criteria:**
- I can click "Generate Invoice" from completed booking
- System creates draft invoice with:
  - Invoice number (auto-generated sequence)
  - Customer billing details (name, address, tax ID)
  - Filereference number
  - Line items with charges:
    - Ocean freight (from offer or actual cost + markup)
    - Origin handling charges
    - Destination handling charges
    - Customs clearance fees
    - Documentation fees
    - Demurrage/detention charges (if any)
    - Insurance (if arranged)
    - Amendment fees (if any)
  - Subtotal, taxes (VAT/GST), total amount
  - Payment terms (Net 30, etc.)
  - Due date (calculated from payment terms)
- I can add/remove/edit line items before finalizing
- I can apply discounts or adjust amounts
- Invoice saved as PDF and attached to booking

**Example:**
> Lisa generates invoice for completed booking: Ocean freight $3,200, handling $450, customs $280, demurrage $600, documentation $150 = Subtotal $4,680 + VAT $936 = Total $5,616. Payment terms Net 30, due Feb 28.

---

### Story 36: Approve and Send Invoice to Customer
**As a** operations manager
**I want to** review and approve invoices before they're sent
**So that** customers receive accurate billing

**Acceptance Criteria:**
- Draft invoices appear in "Pending Approval" queue
- I can review:
  - All line items and amounts
  - Comparison to estimate (from offer)
  - Margin calculation (revenue - costs)
  - Any unusual charges
- I can:
  - Approve invoice → sends to customer automatically
  - Request changes → assign back to coordinator with notes
  - Reject invoice → returns to draft status
- Upon approval:
  - System sends invoice PDF to customer via email
  - Invoice status changes to "Sent"
  - Payment due date tracking begins
  - Invoice appears in accounts receivable
- Customer receives email: "Invoice #INV-2026-00123 for FileEXP/FCL/00001/2026/ABC - Amount $5,616 due by Feb 28"

**Example:**
> Manager reviews invoice, notices demurrage is higher than expected ($600). Confirms it matches calculated demurrage. Approves invoice. System sends to customer automatically.

---

### Story 37: Record Customer Payment
**As a** accounting clerk (or file coordinator)
**I want to** record when customer pays the invoice
**So that** accounts receivable is accurate

**Acceptance Criteria:**
- I can view "Outstanding Invoices" list showing all unpaid invoices with due dates
- For each invoice, I can click "Record Payment"
- I can enter:
  - Payment date
  - Payment amount (full or partial)
  - Payment method (bank transfer, check, credit card)
  - Payment reference (transaction ID, check number)
  - Bank fees (if deducted from payment)
- System calculates:
  - Remaining balance (if partial payment)
  - Payment status (Paid, Partially Paid, Overdue)
- If payment is late, system calculates late fees (if applicable)
- Payment appears on file financial summary
- If fully paid, invoice moves to "Paid" status and out of AR aging report

**Example:**
> Customer pays $5,616 via bank transfer on Feb 25 (3 days before due date). Clerk records payment with transaction ID "TXF-20260225-789". Invoice marked "Paid". No late fees.

---

### Story 38: Match Carrier Invoice to Booking
**As a** file coordinator
**I want to** match received carrier invoices to files
**So that** I can track actual costs and calculate margin

**Acceptance Criteria:**
- I can upload carrier invoice (PDF, email forward)
- System attempts OCR to extract:
  - Carrier name
  - Invoice number
  - Filereference / BOL number
  - Amount
  - Currency
- I can manually match invoice to booking if OCR fails
- For each matched invoice, I can:
  - Assign to specific leg
  - Categorize cost (freight, fuel surcharge, handling, etc.)
  - Enter amount per line item
  - Flag discrepancies (if amount differs from estimate)
- System updates booking actualCost fields
- Unmatched invoices appear in "Needs Matching" queue with alerts
- Once all carrier invoices are matched, file is ready for financial close

**Example:**
> Maersk invoice arrives for $3,180 (vs. estimate $3,200). Sarah uploads PDF, system extracts file reference, auto-matches to booking. She categorizes as "Ocean Freight - Main Carriage" and confirms amount. FileactualCost updated.

---

### Story 39: Issue Credit Note
**As a** billing specialist
**I want to** issue credit notes for overcharges or goodwill adjustments
**So that** customer account balances are corrected

**Acceptance Criteria:**
- I can click "Issue Credit Note" from file or invoice
- I can specify:
  - Credit reason (overcharge, service failure, goodwill, dispute settlement)
  - Credit amount
  - Which invoice to credit against
  - Description for customer
- System generates credit note with:
  - Credit note number (CN-2026-00001)
  - Reference to original invoice
  - Amount credited
  - New balance owed (if partial credit)
- Credit note sent to customer automatically
- Customer's AR balance reduced by credit amount
- Credit appears on next statement
- Credit linked to booking for margin recalculation

**Example:**
> After dispute settlement, manager issues credit note for $600 (demurrage dispute). System generates CN-2026-00015, credits against invoice INV-2026-00123, new balance $5,016. Customer notified and balance updated.

---

## Phase 13: Customs Clearance (Expanded)

### Story 40: Assign Customs Broker
**As a** file coordinator
**I want to** assign a customs broker to handle import clearance
**So that** cargo clears customs efficiently

**Acceptance Criteria:**
- For import files, I can click "Assign Customs Broker"
- I can select from list of approved customs brokers (filtered by port/country)
- System sends broker notification with:
  - Filedetails
  - ETA at port
  - Cargo description
  - Consignee details
  - Required actions (ISF filing, entry filing, etc.)
- Broker appears as stakeholder on file with access to documents
- I can see broker assignment history
- I can reassign broker if needed

**Example:**
> Import file arriving LAX. Sarah assigns "ABC Customs Brokers" who specialize in LAX imports. Broker receives email with file details and ETA (Jan 25), starts preparing customs entry.

---

### Story 41: Submit Documents for Customs
**As a** customs broker (or file coordinator)
**I want to** submit required documents to customs authorities
**So that** clearance can proceed

**Acceptance Criteria:**
- I can access "Customs Documents" section
- System shows checklist of required documents for import:
  - Bill of Lading (BOL)
  - Commercial Invoice
  - Packing List
  - Certificate of Origin (if applicable)
  - Import License (if required)
  - Other country-specific documents
- I can upload or link to documents already in booking
- I can click "Submit to Customs" which:
  - Validates all required docs are present
  - Sends docs via customs portal API (if integrated) OR
  - Generates submission package for manual filing
  - Records submission timestamp
- System tracks submission status:
  - Submitted → Under Review → Additional Docs Requested → Cleared
- If additional docs requested, system alerts coordinator

**Example:**
> Broker uploads commercial invoice and packing list, links to existing BOL. Clicks "Submit to Customs". System validates all docs present, submits via ACE (US customs portal). Status: "Submitted - Under Review".

---

### Story 42: Calculate Import Duties and Taxes
**As a** customs broker (or file coordinator)
**I want to** calculate estimated import duties and taxes
**So that** customer knows costs upfront

**Acceptance Criteria:**
- I can click "Calculate Duties" from import file
- System requires:
  - HS Code (harmonized tariff code)
  - Country of origin
  - Cargo value (FOB)
  - Destination country
- System calculates (via API or manual):
  - Import duty rate (% based on HS code and trade agreements)
  - Import duty amount
  - VAT/GST (if applicable)
  - Other taxes (excise, anti-dumping, etc.)
  - Total customs charges
- I can override calculated amounts if customs provides different assessment
- Estimated duties appear on customer quotation/invoice
- Actual duties (after customs assessment) recorded for billing

**Example:**
> Broker enters HS code 8517.62.00 (smartphones), value $50,000, origin China, destination USA. System calculates: Duty 0% (trade agreement), no VAT (USA), other fees $125. Total customs charges $125.

---

### Story 43: File Customs Entry (Formal Entry)
**As a** customs broker
**I want to** file formal customs entry electronically
**So that** cargo can be released from customs custody

**Acceptance Criteria:**
- I can click "File Customs Entry" when all docs are ready
- System pre-fills customs entry form with:
  - Importer of record details
  - Consignee details
  - Cargo description and HS codes
  - Declared value
  - Calculated duties
- I can review and adjust entry details
- I can submit entry via:
  - Integrated customs API (ACE for USA, ASYCUDA for others)
  - Manual filing (generate PDF for portal upload)
- System receives entry number from customs
- Entry status tracked:
  - Filed → Processing → Payment Required → Cleared → Released
- I can see estimated release date

**Example:**
> Broker reviews pre-filled entry for smartphone shipment, confirms HS code and value, submits via ACE. Customs returns entry number "ENT-USA-20260125-98765". Status: "Processing - Payment Required". Estimated release: Jan 27.

---

### Story 44: Pay Customs Duties on Behalf of Customer
**As a** file coordinator (or customs broker)
**I want to** pay import duties on customer's behalf
**So that** cargo can be released quickly

**Acceptance Criteria:**
- When customs entry shows "Payment Required", I can click "Pay Duties"
- System shows:
  - Total duties owed
  - Payment deadline (cargo on hold until paid)
  - Payment method options (ACH, wire transfer, customs bond)
- I can select:
  - Pay now (from company account) - faster
  - Instruct customer to pay directly - slower
- If paying on behalf:
  - I can enter payment reference
  - System records payment date and amount
  - Amount added to customer invoice as pass-through cost
  - Proof of payment attached to booking
- Customs receives payment notification
- Cargo status changes to "Cleared - Awaiting Release"

**Example:**
> Duties owed $5,280, due by Jan 27 or cargo incurs storage. Sarah pays via customs bond (instant). Records payment reference "BOND-2026-0125-ABC". Amount added to customer invoice. Customs clears cargo same day.

---

### Story 45: Receive Customs Release Notice
**As a** file coordinator
**I want to** receive notification when cargo is released by customs
**So that** I can arrange final delivery

**Acceptance Criteria:**
- When customs releases cargo, system receives notification via:
  - Customs portal API webhook
  - Manual entry by broker
  - Email parsing
- System records:
  - Release date and time
  - Release number
  - Any conditions (e.g., "released subject to post-clearance audit")
- Filestatus updates to "Customs Cleared"
- System automatically:
  - Notifies customer: "Cargo cleared customs - ready for delivery"
  - Triggers next workflow step (arrange final delivery)
  - Sends release notice to trucking company for pickup
- Release document attached to booking
- Customs clearance date field populated

**Example:**
> Customs releases cargo on Jan 27 at 14:30. System receives webhook from ACE, updates file status to "Customs Cleared", emails customer and trucker. Sarah schedules delivery for Jan 28.

---

## Phase 14: VGM Submission & Container Tracking

### Story 46: Calculate and Record VGM
**As a** file coordinator
**I want to** record the Verified Gross Mass (VGM) for each container
**So that** I comply with SOLAS regulations

**Acceptance Criteria:**
- For each FCL container, I can enter VGM details:
  - VGM weight (in kg or lbs)
  - VGM method:
    - Method 1: Weigh full container at certified scale
    - Method 2: Weigh cargo + add container tare weight
  - Weighing date and time
  - Scale certificate number (for Method 1)
  - Responsible party (shipper or freight forwarder)
- System validates:
  - VGM not more than 10% different from declared weight (alerts if discrepancy)
  - VGM submitted at least 48 hours before vessel departure (warns if deadline approaching)
- VGM appears on container detail card
- System generates VGM certificate (PDF) with required fields

**Example:**
> Container TCLU1234567 declared weight 18,500 kg. Customer weighs full container: 19,200 kg VGM (Method 1), scale cert SC-12345. Sarah records VGM 2 days before ETD. System validates within 10% tolerance, generates VGM certificate.

---

### Story 47: Submit VGM to Terminal/Carrier
**As a** file coordinator
**I want to** submit VGM to the shipping line or terminal
**So that** container is allowed to load on vessel

**Acceptance Criteria:**
- I can click "Submit VGM" from container detail
- System validates VGM is recorded and deadline not passed
- System submits VGM via:
  - Carrier API (if integrated) - instant
  - Email to carrier/terminal - manual
  - Terminal portal upload - semi-automated
- Submission includes:
  - Container number
  - VGM weight
  - Method used
  - Filereference
  - Shipper details
- System tracks submission:
  - Submitted at (timestamp)
  - Submission method
  - Confirmation received (yes/no)
- If not confirmed within 4 hours, system alerts coordinator
- VGM submission deadline countdown shown (e.g., "Due in 22 hours")

**Example:**
> Sarah clicks "Submit VGM" for container. System sends to Maersk API, receives confirmation "VGM accepted for TCLU1234567". Status: "VGM Submitted & Confirmed". Deadline met with 18 hours to spare.

---

### Story 48: Track VGM Submission Status
**As a** file coordinator
**I want to** see VGM submission status for all containers
**So that** I can chase missing submissions before cutoff

**Acceptance Criteria:**
- Dashboard shows "VGM Status" for all containers:
  - ✅ Submitted & Confirmed
  - ⏳ Submitted - Awaiting Confirmation
  - ⚠️ Not Submitted - Deadline Approaching (< 24 hours)
  - ❌ Missed Deadline
- I can filter files by VGM status
- System sends alerts:
  - 48 hours before deadline: "VGM due soon"
  - 24 hours before deadline: "URGENT: VGM due in 24h"
  - If deadline missed: "CRITICAL: VGM deadline passed - container will not load"
- I can resend VGM if terminal claims not received
- All VGM submissions logged with audit trail

**Example:**
> Dashboard shows: FileEXP/FCL/00001/2026/ABC has 2 containers - Container 1: ✅ VGM Confirmed, Container 2: ⚠️ Not Submitted (deadline in 18h). Sarah immediately chases customer for Container 2 VGM.

---

## Reporting & Analytics Stories

### Story 23: View My Active Files
**As a** file coordinator
**I want to** see all my active files with action items
**So that** I can prioritize my work

**Acceptance Criteria:**
- I can see "My Active Files" dashboard showing:
  - **Action Required** (pending user tasks with SLA approaching)
  - **Awaiting Customer** (waiting for customer confirmation)
  - **In Transit** (carrier reservations confirmed, monitoring)
  - **Completed** (delivered, awaiting financial close)
- Each booking shows:
  - Filenumber, customer, cargo type
  - Current workflow step with status badge
  - SLA countdown (if applicable)
  - Next action required
- I can click to jump directly to file detail
- Dashboard updates in real-time

**Example:**
> Sarah's dashboard shows:
> - **Action Required (3)**: 2 in "Plan Route" (SLA: 45 min left), 1 in "Add Cargo" (SLA: 1h 20m)
> - **Awaiting Customer (5)**: Waiting for confirmations
> - **In Transit (12)**: All legs confirmed, monitoring progress
> - **Completed (2)**: Waiting for financial close

---

### Story 24: File Performance Analytics
**As a** operations manager
**I want to** view booking performance metrics
**So that** I can identify bottlenecks and improve processes

**Acceptance Criteria:**
- I can access "File Analytics" dashboard showing:
  - **Volume**: Total files created/completed per month
  - **Conversion Rate**: % of files that reach "Financially Closed" vs. cancelled
  - **SLA Compliance**: % of user tasks completed within SLA
  - **Average Cycle Time**: Days from file creation to financial close
  - **Margin Analysis**: Average margin % by cargo type, direction, carrier
  - **Top Issues**: Most common failure reasons, delay causes
- I can filter by: date range, coordinator, customer, cargo type, direction
- Charts show trends over time

**Example:**
> Manager views analytics for Q4 2025:
> - 482 files created, 398 closed (82.6% conversion)
> - 94.2% SLA compliance (28 tasks missed SLA)
> - Avg cycle time: 18 days (create to close)
> - Avg margin: 14.3% (FCL: 12.1%, LCL: 19.8%)
> - Top delay cause: "Demurrage at destination port" (34 files)

---

## Summary of User Roles

| Role | Primary Stories | Key Responsibilities |
|------|----------------|---------------------|
| **File Coordinator** | 1-7, 11-16, 21, 23-27, 31-33, 35, 38, 40-41, 46-48 | Create files, plan routes, enter cargo, monitor shipments, confirm delivery, upload documents, handle amendments, manage exceptions, submit VGM |
| **Customer (External)** | 9-10 | Review and confirm files |
| **Financial Controller** | 17-20, 36-37, 39 | Monthly financial close, cost reconciliation, margin analysis, approve invoices, record payments, issue credit notes |
| **Operations Manager** | 50, 36 | Performance monitoring, process improvement, invoice approval |
| **Customs Broker** | 40-45 | Handle import customs clearance, file entries, pay duties |
| **Billing Specialist** | 35, 39 | Generate customer invoices, issue credit notes |
| **Accounting Clerk** | 37, 38 | Record customer payments, match carrier invoices |
| **System (Automated)** | 8, 11, 14-15, 17, 32 | Validation, carrier reservation, tracking updates, demurrage calculation, major delay detection |

**Total User Stories**: 50 stories across 14 phases
- **Phase 1-2**: File Creation & Route Planning (4 stories)
- **Phase 3**: Cargo Entry (3 stories)
- **Phase 4**: Validation & Confirmation (3 stories)
- **Phase 5**: Carrier Reservation & Execution (3 stories)
- **Phase 6**: Monitoring & Delivery (3 stories)
- **Phase 7**: Financial Close (4 stories)
- **Phase 8**: Cancellation (2 stories)
- **Phase 9**: Document Management (4 stories)
- **Phase 10**: File Amendments (4 stories)
- **Phase 11**: Exception Handling (4 stories)
- **Phase 12**: Invoicing & Billing (5 stories)
- **Phase 13**: Customs Clearance (6 stories)
- **Phase 14**: VGM Submission (3 stories)
- **Reporting**: Analytics & Dashboards (2 stories)

---

## Workflow Progress Example

Here's how a typical file progresses through all stories:

```
Day 1:  Story 1  → Sarah creates file (Draft)
        Story 3  → Sarah plans 3-leg route (Plan Route)
        Story 4  → Sarah completes planning (Add Cargo)
        Story 5  → Sarah adds 2 containers (Add Cargo)
        Story 7  → Sarah completes cargo entry (Validate)
        Story 8  → System validates automatically (Await Confirmation)

Day 2:  Story 9  → Customer confirms booking (File Confirmed)
        Story 11 → System books all 3 carriers (Request Carrier Reservations)
        Story 13 → System creates shipment S-2026-00123 (In Transit)

Day 3-18: Story 14 → System tracks shipment progress every 4 hours
        Story 15 → System calculates demurrage daily

Day 19: Story 16 → Sarah confirms delivery (Completed)

Feb 8:  Story 17 → System flags booking for financial close (Await Financial Close)

Feb 10: Story 18 → Janet reviews costs and margin (Financial Close)
        Story 19 → Janet approves financial close (Financially Closed)

        ✅ Filelifecycle complete!
```

---

## Estimated Timelines

- **Planning Phase** (Stories 1-4): 30-60 minutes per booking
- **Cargo Entry** (Stories 5-7): 15-30 minutes per booking
- **Validation & Confirmation** (Stories 8-10): 24-48 hours (waiting for customer)
- **Carrier Reservation** (Stories 11-13): 5-15 minutes (automated)
- **In Transit** (Stories 14-16): 10-21 days (depends on route)
- **Financial Close** (Stories 17-20): 10-15 minutes per booking

**Total Cycle Time**: ~12-23 days from file creation to financial close
