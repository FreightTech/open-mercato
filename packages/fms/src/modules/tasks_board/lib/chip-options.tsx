import React from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Ship,
  Plane,
  TrainFront,
  Package,
  AlertTriangle,
  Snowflake,
  Maximize2,
} from 'lucide-react'

const ICON_SIZE = 'h-3.5 w-3.5'

export const DIRECTION_OPTIONS = [
  { value: 'import', label: 'Import', icon: <ArrowDownToLine className={ICON_SIZE} /> },
  { value: 'export', label: 'Export', icon: <ArrowUpFromLine className={ICON_SIZE} /> },
  { value: 'both', label: 'Both', icon: <ArrowLeftRight className={ICON_SIZE} /> },
]

export const TRANSPORT_MODE_OPTIONS = [
  { value: 'sea', label: 'Sea', icon: <Ship className={ICON_SIZE} /> },
  { value: 'air', label: 'Air', icon: <Plane className={ICON_SIZE} /> },
  { value: 'rail', label: 'Rail', icon: <TrainFront className={ICON_SIZE} /> },
]

export const CARGO_TYPE_OPTIONS = [
  { value: 'general', label: 'General', icon: <Package className={ICON_SIZE} /> },
  { value: 'dangerous', label: 'Dangerous', icon: <AlertTriangle className={ICON_SIZE} /> },
  { value: 'perishable', label: 'Perishable', icon: <Snowflake className={ICON_SIZE} /> },
  { value: 'oog', label: 'OOG', icon: <Maximize2 className={ICON_SIZE} /> },
]

export const CONTAINER_OPTIONS = [
  { value: '20GP', label: '20GP' },
  { value: '40GP', label: '40GP' },
  { value: '40HC', label: '40HC' },
  { value: '45HC', label: '45HC' },
  { value: '20RF', label: '20RF' },
  { value: '40RF', label: '40RF' },
  { value: '40RH', label: '40RH' },
  { value: 'LCL', label: 'LCL' },
]
