const LABEL_OVERRIDES: Record<string, string> = {
  blNumber: 'B/L Number',
  bolNumber: 'B/L Number',
  hsCode: 'HS Code',
  etd: 'ETD',
  eta: 'ETA',
  atd: 'ATD',
  ata: 'ATA',
  vgmWeight: 'VGM Weight',
  vgmStatus: 'VGM Status',
  vgmCutoffDate: 'VGM Cutoff',
  docCutoffDate: 'Doc Cutoff',
  cargoReadyDate: 'Cargo Ready',
  gateInDate: 'Gate In',
  gateCloseDate: 'Gate Close',
  operatorId: 'Operator',
  operatorName: 'Operator',
  salesPersonId: 'Sales Person',
  salesPersonName: 'Sales Person',
  carrierId: 'Carrier',
}

export function camelToLabel(key: string): string {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key]
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (s) => s.toUpperCase())
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function getAvatarColor(userId: string | null | undefined): string {
  if (!userId) return '#9ca3af' // gray for system
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  ]
  return colors[Math.abs(hash) % colors.length]
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
