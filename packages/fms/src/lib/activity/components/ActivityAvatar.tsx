'use client'

import type { ActivityActor } from '../types'
import { getAvatarColor, getInitials } from '../utils'

type ActivityAvatarProps = {
  actor: ActivityActor
  size?: number
}

export function ActivityAvatar({ actor, size = 32 }: ActivityAvatarProps) {
  const isSystem = !actor.userId
  const bgColor = getAvatarColor(actor.userId)
  const initials = isSystem ? 'Sys' : getInitials(actor.name)

  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-medium shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: bgColor,
        fontSize: size * 0.375,
      }}
    >
      {initials}
    </div>
  )
}
