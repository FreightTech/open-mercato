import React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'
import { SimpleTooltip } from '@open-mercato/ui/primitives/tooltip'

type UserAvatarProps = {
  name: string
  initials: string
  color?: string
  size?: 'sm' | 'md'
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
}

export function UserAvatar({ name, initials, color, size = 'sm' }: UserAvatarProps) {
  return (
    <SimpleTooltip content={name}>
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-full font-medium text-white shrink-0',
          sizeClasses[size],
        )}
        style={{ backgroundColor: color || '#6b7280' }}
      >
        {initials}
      </div>
    </SimpleTooltip>
  )
}
