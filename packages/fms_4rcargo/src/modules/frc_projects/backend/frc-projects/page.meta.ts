import React from 'react'
import { FolderKanban } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_projects.view'],
  pageTitle: 'Projects',
  pageTitleKey: 'frc_projects.nav.projects',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 30,
  icon: React.createElement(FolderKanban, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Projects', labelKey: 'frc_projects.nav.projects' },
  ],
}
