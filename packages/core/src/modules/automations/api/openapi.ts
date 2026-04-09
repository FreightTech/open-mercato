import { createCrudOpenApiFactory } from '@open-mercato/shared/lib/openapi/crud'

export const buildAutomationsCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: 'Automations',
})
