'use client'

import * as React from 'react'
import { InlineDateField } from '../../../lib/inline-edit'
import type { Project } from './ProjectWizard/hooks/useProjectWizard'

export type ProjectCutoffsCardProps = {
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

export function ProjectCutoffsCard({ project, onUpdate }: ProjectCutoffsCardProps) {
  const saveDate = React.useCallback(
    (field: string) => async (value: string | null) => {
      onUpdate({ [field]: value } as Partial<Project>)
    },
    [onUpdate]
  )

  return (
    <div className="border rounded-lg bg-white">
      <div className="px-3 py-1.5 border-b">
        <h3 className="text-sm font-medium">Cutoffs & Schedule</h3>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        <div>
          <FieldLabel>Cargo Ready</FieldLabel>
          <InlineDateField
            value={project.cargoReadyDate}
            placeholder="Set date"
            onSave={saveDate('cargoReadyDate')}
          />
        </div>
        <div>
          <FieldLabel>VGM Cutoff</FieldLabel>
          <InlineDateField
            value={project.vgmCutoffDate}
            placeholder="Set date"
            onSave={saveDate('vgmCutoffDate')}
          />
        </div>
        <div>
          <FieldLabel>Doc Cutoff</FieldLabel>
          <InlineDateField
            value={project.docCutoffDate}
            placeholder="Set date"
            onSave={saveDate('docCutoffDate')}
          />
        </div>
        <div>
          <FieldLabel>Gate In</FieldLabel>
          <InlineDateField
            value={project.gateInDate}
            placeholder="Set date"
            onSave={saveDate('gateInDate')}
          />
        </div>
        <div>
          <FieldLabel>Gate Close</FieldLabel>
          <InlineDateField
            value={project.gateCloseDate}
            placeholder="Set date"
            onSave={saveDate('gateCloseDate')}
          />
        </div>
      </div>
    </div>
  )
}
