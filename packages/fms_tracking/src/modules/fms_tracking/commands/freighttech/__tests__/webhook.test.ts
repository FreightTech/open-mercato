/** @jest-environment node */

import { WebhookEvent, Milestone } from '../../../data/entities'
import publishWebhookEventCommand from '../webhook'

// Simplified test fixtures
const createLocation = (override = {}) => ({
  name: 'Port of Los Angeles',
  city: 'Los Angeles',
  state: 'CA',
  country: 'US',
  unlocode: 'USLAX',
  firms_cd: null,
  bic_cd: null,
  smdg_cd: null,
  facility: null,
  geolocation: { latitude: 33.7405, longitude: -118.2716 },
  ...override,
})

const createMilestone = (override = {}) => ({
  id: 'ms_001',
  timestamp: '2024-12-29T10:00:00Z',
  location: createLocation(),
  description: 'Container loaded',
  raw_description: 'Container loaded at origin',
  journey_event: {
    journey_type: 'EXP',
    event_classifier: 'ACT',
    event_type: 'LOAD',
  },
  shipment_location: { type_code: 'POL' },
  vessel: 'MSC GÜLSÜN',
  vessel_imo: '9850615',
  vessel_mmsi: '636092535',
  voyage: '424E',
  planned: false,
  mode: 'VESSEL',
  source: 'carrier',
  ...override,
})

const createWebhookInput = (override = {}) => ({
  organizationId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  data: {
    id: '00000000-0000-4000-8000-000000000010',
    reference_id: '00000000-0000-4000-8000-000000000011',
    parent_reference_id: null,
    status: 'IN_TRANSIT',
    organization_id: '00000000-0000-4000-8000-000000000001',
    payload: {
      reference_id: '00000000-0000-4000-8000-000000000011',
      bill_of_lading: null,
      carrier_scac: 'MSCU',
      container_id: 'MSCU1234567',
      container_iso: '22G1',
      milestones: [createMilestone()],
      inland_origin: createLocation({ name: 'Inland Origin', unlocode: 'USINYC' }),
      origin_port: createLocation({ name: 'Origin Port', unlocode: 'USLAX' }),
      destination_port: createLocation({ name: 'Destination Port', unlocode: 'CNSHA' }),
      inland_destination: createLocation({ name: 'Inland Dest', unlocode: 'CNPEK' }),
    },
    created_at: '2024-12-29T09:00:00Z',
    updated_at: '2024-12-29T10:00:00Z',
  },
  ...override,
})

describe('Freighttech Webhook Handler', () => {
  let mockEm: any
  let mockEventBus: any
  let mockCtx: any
  let emittedEvents: Array<{ event: string; payload: any; options?: any }>

  beforeEach(() => {
    emittedEvents = []

    // Mock EntityManager
    mockEm = {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
      create: jest.fn((entity: any, data: any) => Object.assign(new entity(), data)),
      persist: jest.fn(),
      flush: jest.fn(async () => {}),
      transactional: jest.fn(async (callback: any) => await callback(mockEm)),
    }

    // Mock EventBus
    mockEventBus = {
      emitEvent: jest.fn(async (event: string, payload: any, options?: any) => {
        emittedEvents.push({ event, payload, options })
      }),
    }

    // Mock context
    mockCtx = {
      container: {
        resolve: jest.fn((name: string) => {
          if (name === 'em') return mockEm
          if (name === 'eventBus') return mockEventBus
          return null
        }),
      },
      auth: {
        userId: '00000000-0000-4000-8000-000000000001',
        orgId: '00000000-0000-4000-8000-000000000001',
        tenantId: '00000000-0000-4000-8000-000000000002',
      },
      organizationScope: null,
      selectedOrganizationId: '00000000-0000-4000-8000-000000000001',
      organizationIds: ['00000000-0000-4000-8000-000000000001'],
    } as any
  })

  describe('Initial Webhook Creation', () => {
    it('should create new webhook event with milestones', async () => {
      const input = createWebhookInput()

      await publishWebhookEventCommand.execute(input, mockCtx)

      // Verify webhook event was created
      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          referenceId: '00000000-0000-4000-8000-000000000011',
          status: 'IN_TRANSIT',
          containerId: 'MSCU1234567',
        })
      )

      // Verify flush was called to persist webhook before milestone sync
      expect(mockEm.flush).toHaveBeenCalled()

      // Verify tracking updated event was emitted
      const trackingEvent = emittedEvents.find(e => e.event === 'fms_tracking.tracking_updated')
      expect(trackingEvent).toBeDefined()
      expect(trackingEvent?.payload.changes.isNew).toBe(true)
      expect(trackingEvent?.payload.changes.fields).toEqual({})
    })

    it('should emit tracking_updated event with milestone counts', async () => {
      const input = createWebhookInput()
      input.data.payload.milestones = [
        createMilestone({ id: 'ms_001' }),
        createMilestone({ id: 'ms_002', description: 'Second milestone' }),
        createMilestone({ id: 'ms_003', description: 'Third milestone' }),
      ]

      await publishWebhookEventCommand.execute(input, mockCtx)

      const trackingEvent = emittedEvents.find(e => e.event === 'fms_tracking.tracking_updated')
      expect(trackingEvent?.payload.changes.milestones.created).toBe(3)
      expect(trackingEvent?.payload.changes.milestones.updated).toBe(0)
    })
  })

  describe('Webhook Updates', () => {
    it('should update existing webhook event and detect field changes', async () => {
      // Mock existing webhook event
      const existingEvent = new WebhookEvent()
      existingEvent.referenceId = '00000000-0000-4000-8000-000000000011'
      existingEvent.status = 'LOAD'
      existingEvent.containerId = 'MSCU1234567'
      existingEvent.carrierScac = 'MSCU'
      existingEvent.containerIso = '22G1'
      existingEvent.billOfLading = null
      existingEvent.parentReferenceId = null

      mockEm.findOne = jest.fn(async () => existingEvent)

      // Update with new status and BOL
      const input = createWebhookInput()
      input.data.status = 'DEPARTED'
      input.data.payload.bill_of_lading = 'BOL123' as any

      await publishWebhookEventCommand.execute(input, mockCtx)

      // Verify status was updated
      expect(existingEvent.status).toBe('DEPARTED')

      // Verify field changes were detected
      const trackingEvent = emittedEvents.find(e => e.event === 'fms_tracking.tracking_updated')
      expect(trackingEvent?.payload.changes.isNew).toBe(false)
      expect(trackingEvent?.payload.changes.fields.status).toEqual(['LOAD', 'DEPARTED'])
      expect(trackingEvent?.payload.changes.fields.billOfLading).toEqual([null, 'BOL123'])
    })
  })

  describe('Lifecycle Event Detection', () => {
    it('should emit departed event for DEPA milestone', async () => {
      const input = createWebhookInput()
      input.data.payload.milestones = [
        createMilestone({
          id: 'ms_departed',
          description: 'Vessel departed',
          journey_event: {
            journey_type: 'EXP',
            event_classifier: 'ACT',
            event_type: 'DEPA',
          },
        }),
      ]

      await publishWebhookEventCommand.execute(input, mockCtx)

      const departedEvent = emittedEvents.find(e => e.event === 'fms_tracking.container.departed')
      expect(departedEvent).toBeDefined()
      expect(departedEvent?.payload.eventType).toBe('departed')
      expect(departedEvent?.payload.containerId).toBe('MSCU1234567')
      expect(departedEvent?.options?.persistent).toBe(true)
    })

    it('should emit arrived event for ARRI milestone', async () => {
      const input = createWebhookInput()
      input.data.payload.milestones = [
        createMilestone({
          id: 'ms_arrived',
          description: 'Vessel arrived',
          journey_event: {
            journey_type: 'EXP',
            event_classifier: 'ACT',
            event_type: 'ARRI',
          },
        }),
      ]

      await publishWebhookEventCommand.execute(input, mockCtx)

      const arrivedEvent = emittedEvents.find(e => e.event === 'fms_tracking.container.arrived')
      expect(arrivedEvent).toBeDefined()
      expect(arrivedEvent?.payload.eventType).toBe('arrived')
    })

    it('should emit discharged event for DISC milestone', async () => {
      const input = createWebhookInput()
      input.data.payload.milestones = [
        createMilestone({
          id: 'ms_discharged',
          description: 'Container discharged',
          journey_event: {
            journey_type: 'EXP',
            event_classifier: 'ACT',
            event_type: 'DISC',
          },
        }),
      ]

      await publishWebhookEventCommand.execute(input, mockCtx)

      const dischargedEvent = emittedEvents.find(e => e.event === 'fms_tracking.container.discharged')
      expect(dischargedEvent).toBeDefined()
      expect(dischargedEvent?.payload.eventType).toBe('discharged')
    })

    it('should emit delivered event for DLVR milestone', async () => {
      const input = createWebhookInput()
      input.data.payload.milestones = [
        createMilestone({
          id: 'ms_delivered',
          description: 'Container delivered',
          journey_event: {
            journey_type: 'EXP',
            event_classifier: 'ACT',
            event_type: 'DLVR',
          },
        }),
      ]

      await publishWebhookEventCommand.execute(input, mockCtx)

      const deliveredEvent = emittedEvents.find(e => e.event === 'fms_tracking.container.delivered')
      expect(deliveredEvent).toBeDefined()
      expect(deliveredEvent?.payload.eventType).toBe('delivered')
    })

    it('should NOT emit lifecycle events for estimated (non-actual) events', async () => {
      const input = createWebhookInput()
      input.data.payload.milestones = [
        createMilestone({
          id: 'ms_estimated',
          description: 'Estimated arrival',
          journey_event: {
            journey_type: 'EXP',
            event_classifier: 'EST', // Estimated, not actual
            event_type: 'ARRI',
          },
        }),
      ]

      await publishWebhookEventCommand.execute(input, mockCtx)

      const arrivedEvent = emittedEvents.find(e => e.event === 'fms_tracking.container.arrived')
      expect(arrivedEvent).toBeUndefined()
    })

    it('should only emit lifecycle events for NEW milestones, not updates', async () => {
      // Mock existing milestone
      const existingMilestone = new Milestone()
      existingMilestone.externalId = 'ms_001'
      existingMilestone.eventType = 'DEPA'
      existingMilestone.eventClassifier = 'ACT'

      mockEm.findOne = jest.fn(async (entity: any, criteria: any) => {
        if (criteria.externalId === 'ms_001') {
          return existingMilestone
        }
        return null
      })

      // Send webhook with same milestone (should be update, not create)
      const input = createWebhookInput()
      input.data.payload.milestones = [
        createMilestone({
          id: 'ms_001', // Same ID as existing
          journey_event: {
            journey_type: 'EXP',
            event_classifier: 'ACT',
            event_type: 'DEPA',
          },
        }),
      ]

      await publishWebhookEventCommand.execute(input, mockCtx)

      // Should NOT emit departed event because milestone was updated, not created
      const departedEvents = emittedEvents.filter(e => e.event === 'fms_tracking.container.departed')
      expect(departedEvents.length).toBe(0)
    })
  })

  describe('Idempotency', () => {
    it('should handle duplicate webhook gracefully with no field changes', async () => {
      const existingEvent = new WebhookEvent()
      existingEvent.referenceId = '00000000-0000-4000-8000-000000000011'
      existingEvent.status = 'IN_TRANSIT'
      existingEvent.containerId = 'MSCU1234567'
      existingEvent.carrierScac = 'MSCU'
      existingEvent.containerIso = '22G1'
      existingEvent.billOfLading = null
      existingEvent.parentReferenceId = null

      mockEm.findOne = jest.fn(async () => existingEvent)

      // Send exact same webhook
      const input = createWebhookInput()

      await publishWebhookEventCommand.execute(input, mockCtx)

      const trackingEvent = emittedEvents.find(e => e.event === 'fms_tracking.tracking_updated')
      expect(trackingEvent?.payload.changes.isNew).toBe(false)
      expect(trackingEvent?.payload.changes.fields).toEqual({})
    })
  })

  describe('Multiple Field Changes', () => {
    it('should detect multiple field changes in single update', async () => {
      const existingEvent = new WebhookEvent()
      existingEvent.referenceId = '00000000-0000-4000-8000-000000000011'
      existingEvent.status = 'LOAD'
      existingEvent.containerId = 'MSCU1234567'
      existingEvent.carrierScac = 'MSCU'
      existingEvent.containerIso = '22G1'
      existingEvent.billOfLading = null
      existingEvent.parentReferenceId = null

      mockEm.findOne = jest.fn(async () => existingEvent)

      const input = createWebhookInput()
      input.data.status = 'ARRIVED'
      input.data.payload.bill_of_lading = 'BOL456' as any
      input.data.payload.container_iso = '45G1'

      await publishWebhookEventCommand.execute(input, mockCtx)

      const trackingEvent = emittedEvents.find(e => e.event === 'fms_tracking.tracking_updated')
      expect(trackingEvent?.payload.changes.fields.status).toEqual(['LOAD', 'ARRIVED'])
      expect(trackingEvent?.payload.changes.fields.billOfLading).toEqual([null, 'BOL456'])
      expect(trackingEvent?.payload.changes.fields.containerIso).toEqual(['22G1', '45G1'])
    })
  })
})
