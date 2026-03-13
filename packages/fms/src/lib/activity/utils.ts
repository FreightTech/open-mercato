const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

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

/** Fields whose values are internal IDs — hide them from the user */
const HIDDEN_FIELDS = new Set([
  'organizationId',
  'tenantId',
  'deletedAt',
  'id',
])

export function camelToLabel(key: string): string {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key]
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (s) => s.toUpperCase())
}

export function isHiddenField(field: string): boolean {
  if (HIDDEN_FIELDS.has(field)) return true
  // Hide fields that end in "Id" and whose values are UUIDs (internal references)
  return false
}

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && ISO_DATE_RE.test(value)
}

export function formatDateValue(isoString: string): string {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return isoString
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) return formatDateValue(value)
    return value
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function shouldHideChange(field: string, from: unknown, to: unknown): boolean {
  if (HIDDEN_FIELDS.has(field)) return true
  // Hide fields ending in Id where both values are UUIDs (internal FK changes)
  if (field.endsWith('Id') && (isUuid(from) || isUuid(to))) return true
  return false
}

export function getAvatarColor(userId: string | null | undefined): string {
  if (!userId) return '#94a3b8' // slate gray for system
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = [
    '#eab308', // yellow
    '#22c55e', // green
    '#a855f7', // purple
    '#f97316', // orange
    '#ec4899', // pink
    '#3b82f6', // blue
    '#14b8a6', // teal
    '#ef4444', // red
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
