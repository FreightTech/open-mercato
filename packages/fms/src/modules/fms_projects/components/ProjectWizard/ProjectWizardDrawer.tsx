'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { ProjectWizardContent } from './ProjectWizardContent'

type ProjectWizardDrawerProps = {
  projectId: string | null
  mode: 'new' | 'edit'
  open: boolean
  onClose: () => void
  onProjectCreated?: (projectId: string) => void
}

export function ProjectWizardDrawer({ projectId, mode, open, onClose, onProjectCreated }: ProjectWizardDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-full sm:max-w-full p-0 flex flex-col [&>button:first-child]:hidden"
        onInteractOutside={(e: Event) => e.preventDefault()}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{mode === 'new' ? 'New Project' : 'Project Wizard'}</SheetTitle>
        </SheetHeader>
        <ProjectWizardContent
          projectId={projectId}
          mode={mode}
          onClose={onClose}
          onProjectCreated={onProjectCreated}
        />
      </SheetContent>
    </Sheet>
  )
}
