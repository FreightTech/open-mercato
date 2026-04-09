import { NextResponse } from 'next/server'
import { listAutomationNodeTypes } from '../../lib/node-type-registry'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['automations.view'],
}

export const openApi = {
  get: { summary: 'List available automation node types', tags: ['Automations'], responses: { 200: { description: 'Node type definitions' } } },
}

export async function GET() {
  const nodeTypes = listAutomationNodeTypes()

  const items = nodeTypes.map(nt => ({
    type: nt.type,
    category: nt.category,
    name: nt.name,
    description: nt.description,
    icon: nt.icon,
    color: nt.color,
    inputs: nt.inputs,
    outputs: nt.outputs,
  }))

  return NextResponse.json({ items })
}
