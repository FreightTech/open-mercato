'use client'

import * as React from 'react'
import { InlineEntitySearchField } from '../../../lib/inline-edit'
import type { Project } from './ProjectWizard/hooks/useProjectWizard'

export type ProjectPartiesCardProps = {
  project: Project
  onUpdate: (updates: Partial<Project>) => void
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
      {children}
    </div>
  )
}

export function ProjectPartiesCard({ project, onUpdate }: ProjectPartiesCardProps) {
  const saveParty = React.useCallback(
    (idField: string, nameField: string) =>
      async (value: { id: string; name: string } | null) => {
        if (value) {
          onUpdate({ [idField]: value.id, [nameField]: value.name } as unknown as Partial<Project>)
        } else {
          onUpdate({ [idField]: null, [nameField]: null } as unknown as Partial<Project>)
        }
      },
    [onUpdate]
  )

  return (
    <div className="border rounded-lg bg-white">
      <div className="px-3 py-1.5 border-b">
        <h3 className="text-sm font-medium">Parties</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 p-4">
        <div>
          <FieldLabel>Client</FieldLabel>
          <InlineEntitySearchField
            value={
              project.clientId && project.clientName
                ? { id: project.clientId, name: project.clientName }
                : null
            }
            entityType="contractors:contractor"
            placeholder="Select client"
            onSave={saveParty('clientId', 'clientName')}
          />
        </div>
        <div>
          <FieldLabel>Shipper</FieldLabel>
          <InlineEntitySearchField
            value={
              project.shipperId && project.shipperName
                ? { id: project.shipperId, name: project.shipperName }
                : null
            }
            entityType="contractors:contractor"
            placeholder="Select shipper"
            onSave={saveParty('shipperId', 'shipperName')}
          />
        </div>
        <div>
          <FieldLabel>Consignee</FieldLabel>
          <InlineEntitySearchField
            value={
              project.consigneeId && project.consigneeName
                ? { id: project.consigneeId, name: project.consigneeName }
                : null
            }
            entityType="contractors:contractor"
            placeholder="Select consignee"
            onSave={saveParty('consigneeId', 'consigneeName')}
          />
        </div>
        <div>
          <FieldLabel>Agent</FieldLabel>
          <InlineEntitySearchField
            value={null}
            entityType="contractors:contractor"
            placeholder="Select agent"
            readOnly
            onSave={async () => {}}
          />
        </div>
      </div>
    </div>
  )
}
