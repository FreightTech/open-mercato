'use client'

import type { ActivityActor } from '../types'
import { getAvatarColor, getInitials } from '../utils'

type ActivityAvatarProps = {
  actor: ActivityActor
  size?: number
}

export function ActivityAvatar({ actor, size = 32 }: ActivityAvatarProps) {
  // Only treat as system if no userId AND name is "System" or empty
  const isSystem = !actor.userId && (!actor.name || actor.name === 'System' || actor.name === 'Unknown')
  // Use userId for color, but fallback to name hash so named actors without userId still get color
  const colorSeed = actor.userId || (isSystem ? null : actor.name)
  const bgColor = getAvatarColor(colorSeed)
  const initials = isSystem ? 'Sys' : getInitials(actor.name)

  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold shrink-0 select-none"
      style={{
        width: size,
        height: size,
        backgroundColor: bgColor,
        color: '#fff',
        fontSize: isSystem ? size * 0.3 : size * 0.375,
        letterSpacing: '0.02em',
      }}
    >
      {initials}
    </div>
  )
}
