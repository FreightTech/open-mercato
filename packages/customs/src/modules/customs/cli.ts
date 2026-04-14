import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import {
  CustomsShipment,
  ParsedDocument,
  ConsistencyCheck,
  HsClassification,
} from './data/entities'
import {
  seedShipment,
  seedDocuments,
  seedConsistencyChecks,
  seedAiSuggestions,
  seedIsztar4Results,
} from './seed/seed-set4-demo'

function parseArgs(rest: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a) continue
    if (a.startsWith('--')) {
      const [k, v] = a.replace(/^--/, '').split('=')
      if (v !== undefined) args[k] = v
      else if (rest[i + 1] && !rest[i + 1]!.startsWith('--')) { args[k] = rest[i + 1]!; i++ }
      else args[k] = true
    }
  }
  return args
}

const seedDemoCommand: ModuleCli = {
  command: 'seed-demo',
  async run(rest) {
    const args = parseArgs(rest)
    const tenantId = String(args.tenant ?? args.tenantId ?? '')
    const organizationId = String(args.org ?? args.organizationId ?? args.orgId ?? '')
    if (!tenantId || !organizationId) {
      console.error('Usage: mercato customs seed-demo --tenant <tenantId> --org <organizationId>')
      return
    }

    const container = await createRequestContainer()
    try {
      const em = container.resolve('em') as EntityManager
      await em.transactional(async (tem) => {
        const existingCount = await tem.count(CustomsShipment, { tenantId, organizationId })
        if (existingCount > 0) {
          console.log(`Skipping seed: ${existingCount} shipment(s) already exist for this organization`)
          return
        }

        const scope = { tenantId, organizationId }

        const now = new Date()
        const shipment = tem.create(CustomsShipment, {
          ...scope,
          status: seedShipment.status,
          blNumber: seedShipment.blNumber,
          invoiceNumber: seedShipment.invoiceNumber,
          shipperName: seedShipment.shipperName,
          consigneeName: seedShipment.consigneeName,
          loadingPort: seedShipment.loadingPort,
          dischargePort: seedShipment.dischargePort,
          vessel: seedShipment.vessel,
          shippedOnBoard: seedShipment.shippedOnBoard,
          productLines: seedShipment.productLines,
          createdAt: now,
          updatedAt: now,
        })
        tem.persist(shipment)
        await tem.flush()

        for (const doc of seedDocuments) {
          const parsedDoc = tem.create(ParsedDocument, {
            ...scope,
            shipment,
            documentType: doc.documentType,
            fileName: doc.fileName,
            fileData: '',
            extracted: doc.extracted,
            createdAt: now,
          })
          tem.persist(parsedDoc)
        }

        for (const check of seedConsistencyChecks) {
          const consistencyCheck = tem.create(ConsistencyCheck, {
            ...scope,
            shipment,
            field: check.field,
            label: check.label,
            sourceDoc1: check.sourceDoc1,
            sourceDoc2: check.sourceDoc2,
            value1: check.value1,
            value2: check.value2,
            status: check.status,
            discrepancy: check.discrepancy,
            createdAt: now,
          })
          tem.persist(consistencyCheck)
        }

        const productLines = seedShipment.productLines
        for (const line of productLines) {
          const hsClassification = tem.create(HsClassification, {
            ...scope,
            shipment,
            lineNumber: line.lineNumber,
            productDescription: line.description,
            aiSuggestions: seedAiSuggestions,
            isztar4Results: seedIsztar4Results,
            selectedHsCode: seedAiSuggestions[0]?.hsCode ?? null,
            selectedDescription: seedAiSuggestions[0]?.description ?? null,
            selectedDutyRate: seedIsztar4Results[0]?.dutyAmount ?? null,
            selectedAt: new Date(),
            createdAt: now,
          })
          tem.persist(hsClassification)
        }

        await tem.flush()
        console.log(`Seeded customs shipment ${shipment.id} with ${seedDocuments.length} documents, ${seedConsistencyChecks.length} consistency checks, ${productLines.length} HS classifications`)
      })
    } finally {
      const disposable = container as unknown as { dispose?: () => Promise<void> }
      if (typeof disposable.dispose === 'function') {
        await disposable.dispose()
      }
    }
  },
}

export default [seedDemoCommand]
