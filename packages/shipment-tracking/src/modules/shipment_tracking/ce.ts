export const entities = [
  {
    id: 'shipment_tracking:shipment',
    label: 'Shipment',
    description: 'Ocean container shipment tracked across carriers.',
    labelField: 'containerNumber',
    showInSidebar: false,
    fields: [],
  },
  {
    id: 'shipment_tracking:tracking_job',
    label: 'Tracking Job',
    description: 'Scheduled polling job for a shipment carrier.',
    labelField: 'referenceValue',
    showInSidebar: false,
    defaultEditor: false,
    fields: [],
  },
  {
    id: 'shipment_tracking:cargo_event',
    label: 'Cargo Event',
    description: 'Individual tracking event for a shipment.',
    labelField: 'eventCode',
    showInSidebar: false,
    defaultEditor: false,
    fields: [],
  },
]

export default entities
