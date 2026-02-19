import React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@open-mercato/ui/primitives/tooltip'

type UserAvatarProps = {
  name: string
  initials: string
  color?: string
  size?: 'sm' | 'md'
}

const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
]

function getColorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

export function FrcUserAvatar({ name, initials, color, size = 'sm' }: UserAvatarProps) {
  const bgColor = color ?? getColorFromName(name)
  const sizeClasses = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'rounded-full flex items-center justify-center text-white font-medium shrink-0',
            sizeClasses,
            bgColor
          )}
        >
          {initials}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {name}
      </TooltipContent>
    </Tooltip>
  )
}
