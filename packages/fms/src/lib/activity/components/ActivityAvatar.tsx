'use client'

import { getAvatarColor, getInitials } from '../utils'

type ActivityAvatarProps = {
  name: string | null | undefined
  userId?: string | null
  size?: 'sm' | 'md'
}

export function ActivityAvatar({ name, userId, size = 'sm' }: ActivityAvatarProps) {
  const colorClass = getAvatarColor(userId)
  const initials = getInitials(name)
  const sizeClasses = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs'

  return (
    <div
      className={`${colorClass} ${sizeClasses} rounded-full flex items-center justify-center text-white font-medium shrink-0`}
    >
      {initials}
    </div>
  )
}
