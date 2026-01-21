import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { EmailTemplateSettings } from '../../../components/EmailTemplateSettings'

export default function EmailTemplatesConfigPage() {
  return (
    <Page>
      <PageBody>
        <EmailTemplateSettings />
      </PageBody>
    </Page>
  )
}
