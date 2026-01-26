import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { PdfTemplateSettings } from '../../../components/PdfTemplateSettings'

export default function PdfTemplatesConfigPage() {
  return (
    <Page>
      <PageBody>
        <PdfTemplateSettings />
      </PageBody>
    </Page>
  )
}
