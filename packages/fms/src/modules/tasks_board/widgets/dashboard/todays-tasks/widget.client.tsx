"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import type { TodaysTasksSettings } from './config'
import { Circle, CheckCircle2, Clock } from 'lucide-react'

type TaskItem = {
  id: string
  title: string
  project: string
  status: 'done' | 'in_progress' | 'pending'
  dueTime: string
}

const DUMMY_TASKS: TaskItem[] = [
  { id: '1', title: 'Confirm pickup — PRJ-1042', project: 'Hamburg → Warsaw', status: 'done', dueTime: '09:00' },
  { id: '2', title: 'Send CMR to carrier', project: 'Rotterdam → Prague', status: 'done', dueTime: '10:30' },
  { id: '3', title: 'Follow up on customs clearance', project: 'Gdansk → Berlin', status: 'in_progress', dueTime: '12:00' },
  { id: '4', title: 'Review rate confirmation', project: 'Antwerp → Vienna', status: 'pending', dueTime: '14:00' },
  { id: '5', title: 'Update delivery ETA for client', project: 'Bremen → Bratislava', status: 'pending', dueTime: '15:30' },
]

const statusConfig = {
  done: { icon: CheckCircle2, color: 'text-green-500', bg: '', label: 'Done' },
  in_progress: { icon: Clock, color: 'text-blue-500', bg: '', label: 'In progress' },
  pending: { icon: Circle, color: 'text-muted-foreground', bg: '', label: 'Pending' },
}

const TodaysTasksWidget: React.FC<DashboardWidgetComponentProps<TodaysTasksSettings>> = ({ mode }) => {
  if (mode === 'settings') {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">No configuration options for this widget.</p>
      </div>
    )
  }

  const doneCount = DUMMY_TASKS.filter((t) => t.status === 'done').length
  const totalCount = DUMMY_TASKS.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {doneCount}/{totalCount} completed
        </span>
        <div className="h-1.5 flex-1 mx-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${(doneCount / totalCount) * 100}%` }}
          />
        </div>
      </div>
      <ul className="divide-y">
        {DUMMY_TASKS.map((task) => {
          const cfg = statusConfig[task.status]
          const Icon = cfg.icon
          return (
            <li key={task.id} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
              <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${task.status === 'done' ? 'line-through text-muted-foreground' : 'font-medium'}`}>
                    {task.title}
                  </span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">{task.dueTime}</span>
                </div>
                <span className="text-xs text-muted-foreground">{task.project}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default TodaysTasksWidget
