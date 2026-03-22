'use client'

import { useParams } from 'next/navigation'
import { InvoiceBuilderPage } from '../../../../components/InvoiceBuilderPage'

export default function InvoiceEditPage() {
  const params = useParams()
  const id = params?.id as string

  return <InvoiceBuilderPage editId={id} />
}
