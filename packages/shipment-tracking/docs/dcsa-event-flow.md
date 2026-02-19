# DCSA Event Flow

This document describes the flow of DCSA-compliant tracking events from carrier APIs to webhook consumers.

## Event Processing Flow

```mermaid
flowchart TD
    subgraph Carrier["Carrier API (DCSA T&T)"]
        CA[Carrier API Response]
    end

    subgraph Polling["Tracking Service"]
        TS[trackingService.pollShipment]
        PA[Parse DCSA Events]
        DE[Deduplicate Events]
        PE[Persist CargoEvent]
    end

    subgraph Mapping["DCSA Event Mapping"]
        DM{isSignificantMilestone?}
        MT[mapDcsaEventToWebhookType]
    end

    subgraph Events["Event Bus Emissions"]
        E1[cargo_event.created<br/><i>backward compat</i>]
        E2[transport.departed<br/>transport.arrived<br/>transport.eta_updated<br/>transport.etd_updated<br/>transport.omitted]
        E3[equipment.loaded<br/>equipment.discharged<br/>equipment.gate_in<br/>equipment.gate_out<br/>equipment.available_pickup<br/>equipment.customs_released]
        E4[shipment.status_changed]
        E5[shipment.booked<br/>shipment.delivered]
    end

    subgraph Webhooks["Webhook Dispatch"]
        WS[webhookService.dispatchWithRetry]
        WM{Match Subscriptions}
        WD[HTTP POST to Subscriber]
    end

    subgraph Consumer["External Consumer"]
        EC[Webhook Endpoint]
    end

    CA -->|DCSA Events JSON| TS
    TS --> PA
    PA --> DE
    DE --> PE
    PE --> DM

    DM -->|No| E1
    DM -->|Yes| MT
    MT -->|TRANSPORT events| E2
    MT -->|EQUIPMENT events| E3
    E1 --> WS
    E2 --> WS
    E3 --> WS

    PE -->|Status Changed?| E4
    E4 -->|ORDERED→BOOKED| E5
    E4 -->|*→DELIVERED| E5
    E5 --> WS

    WS --> WM
    WM -->|Matched| WD
    WD --> EC
```

## ETA Update Flow (Ship at Sea)

```mermaid
sequenceDiagram
    participant Carrier as Carrier API
    participant TS as TrackingService
    participant DM as DCSA Mapper
    participant EB as Event Bus
    participant WS as Webhook Service
    participant Sub as Subscriber

    Note over Carrier: Ship at sea, ETA changes

    Carrier->>TS: ARRI event (classifier=EST)
    TS->>TS: Parse & persist CargoEvent
    TS->>DM: Check event significance

    DM->>DM: eventType=TRANSPORT<br/>eventCode=ARRI<br/>classifier=EST

    DM-->>TS: Significant milestone: YES<br/>webhookType: transport.eta_updated

    TS->>EB: emit('cargo_event.created')
    TS->>EB: emit('transport.eta_updated')

    EB->>WS: transport.eta_updated payload
    WS->>WS: Find matching webhooks

    WS->>Sub: POST /webhook<br/>{ type: "transport.eta_updated",<br/>  eventDateTime: "...",<br/>  shipment: {...} }

    Sub-->>WS: 200 OK
```

## DCSA Event Code Mapping

```mermaid
flowchart LR
    subgraph Input["Carrier Event"]
        ET[eventType]
        EC[eventCode]
        CL[classifier]
    end

    subgraph Transport["TRANSPORT Events"]
        T1[DEPA + ACT → transport.departed]
        T2[DEPA + EST/PLN → transport.etd_updated]
        T3[ARRI + ACT → transport.arrived]
        T4[ARRI + EST/PLN → transport.eta_updated]
        T5[OMIT → transport.omitted]
    end

    subgraph Equipment["EQUIPMENT Events"]
        Q1[LOAD → equipment.loaded]
        Q2[DISC → equipment.discharged]
        Q3[GTIN → equipment.gate_in]
        Q4[GTOT/GOUT → equipment.gate_out]
        Q5[AVPU → equipment.available_pickup]
        Q6[CUSR → equipment.customs_released]
        Q7[INSP/CUSS/CUSI → equipment.inspected]
        Q8[DLVR + ACT → shipment.delivered]
    end

    ET --> |TRANSPORT| Transport
    ET --> |EQUIPMENT| Equipment

    EC --> T1
    EC --> T2
    EC --> T3
    EC --> T4
    EC --> T5
    EC --> Q1
    EC --> Q2
    EC --> Q3
    EC --> Q4
    EC --> Q5
    EC --> Q6
    EC --> Q7
    EC --> Q8

    CL -.->|Determines ACT vs EST| T1
    CL -.->|Determines ACT vs EST| T2
    CL -.->|Determines ACT vs EST| T3
    CL -.->|Determines ACT vs EST| T4
```

## Internal vs External Events

```mermaid
flowchart TB
    subgraph Internal["Internal Events (No Webhook)"]
        direction TB
        I1[tracking_job.created]
        I2[tracking_job.updated]
        I3[tracking_job.failed]
        I4[tracking_job.completed]
        I5[webhook.delivery_success]
        I6[webhook.delivery_failed]
    end

    subgraph External["External Events (Webhook Dispatch)"]
        direction TB
        subgraph Shipment["Shipment"]
            S1[shipment.created]
            S2[shipment.updated]
            S3[shipment.status_changed]
            S4[shipment.booked]
            S5[shipment.delivered]
        end

        subgraph Transport["Transport"]
            T1[transport.departed]
            T2[transport.arrived]
            T3[transport.eta_updated]
            T4[transport.etd_updated]
            T5[transport.omitted]
        end

        subgraph Equipment["Equipment"]
            E1[equipment.loaded]
            E2[equipment.discharged]
            E3[equipment.gate_in]
            E4[equipment.gate_out]
            E5[equipment.available_pickup]
            E6[equipment.customs_released]
            E7[equipment.inspected]
        end
    end

    Internal -.->|excludeFromTriggers: true| LOG[Audit Log Only]
    External -->|Webhook Dispatch| WH[External Subscribers]
```
