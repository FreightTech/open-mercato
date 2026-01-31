// src/modules/transports/acl.ts
export const features = [
    { id: 'transports.transports.view', label: 'View Transports' },
    { id: 'transports.transports.create', label: 'Create Transports' },
    { id: 'transports.transports.edit', label: 'Edit Transports' },
    { id: 'transports.transports.delete', label: 'Delete Transports' },
    { id: 'transports.import', label: 'Import Transports from Excel' },
] as const;

export const roles = [
    {
        id: 'transports_operator',
        label: 'Transports Operator',
        features: [
            'transports.transports.view',
            'transports.transports.create',
            'transports.transports.edit',
            'transports.import'
        ]
    },
    {
        id: 'transports_manager',
        label: 'Transports Manager',
        features: [
            'transports.transports.view',
            'transports.transports.create',
            'transports.transports.edit',
            'transports.transports.delete',
            'transports.import'
        ]
    }
];

export default features
