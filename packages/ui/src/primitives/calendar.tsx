"use client"

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import type { DayPickerProps } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'

export type CalendarProps = DayPickerProps

const navButtonBase = cn(
  'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
  'inline-flex items-center justify-center rounded-md text-sm font-medium',
  'ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  'hover:bg-accent hover:text-accent-foreground border-0'
)

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const isAround = props.navLayout === 'around'

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: isAround
          ? 'grid grid-cols-[auto_1fr_auto] gap-y-4 items-center'
          : 'space-y-4',
        month_caption: isAround
          ? 'flex items-center justify-center'
          : 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        button_previous: isAround ? navButtonBase : cn(navButtonBase, 'absolute left-1'),
        button_next: isAround ? navButtonBase : cn(navButtonBase, 'absolute right-1'),
        month_grid: isAround
          ? 'w-full border-collapse space-y-1 col-span-3'
          : 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        weeks: 'w-full border-collapse space-y-1',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-full [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-full last:[&:has([aria-selected])]:rounded-full focus-within:relative focus-within:z-20',
        day_button: cn(
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
          'inline-flex items-center justify-center rounded-full text-sm',
          'ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none',
          'hover:bg-accent hover:text-accent-foreground'
        ),
        selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-full',
        today: 'border border-muted-foreground/40 text-foreground rounded-full',
        outside:
          'day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30',
        disabled: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  )
}
