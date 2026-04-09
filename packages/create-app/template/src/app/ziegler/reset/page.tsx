"use client"
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardDescription } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export default function ZieglerResetPage() {
  const t = useT()
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const form = new FormData(e.currentTarget)
      const res = await fetch('/api/auth/reset', { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Something went wrong')
        return
      }
      setSent(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh w-full bg-[#066A5D]">
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm border-0 bg-[#FDFDFD] shadow-2xl rounded-2xl">
          <CardHeader className="flex flex-col items-center gap-4 text-center px-8 pt-8 pb-0">
            <Link href="/">
              <Image
                src="/fms/myziegler-logo.svg"
                alt="MyZiegler"
                width={175}
                height={38}
              />
            </Link>
            <CardDescription className="text-[#272E3C] text-lg font-medium">{t('auth.resetPassword')}</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            {sent ? (
              <div className="text-sm text-[#3C485E] text-center">
                If an account with that email exists, we sent a reset link. Please check your inbox.
              </div>
            ) : (
              <form className="grid gap-3" onSubmit={onSubmit} noValidate>
                {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 text-center">{error}</div>}
                <div className="grid gap-1">
                  <Label htmlFor="email" className="text-[#3C485E]">{t('auth.email')}</Label>
                  <Input id="email" name="email" type="email" required className="border-[#E2E8F0] bg-[#FAFAFA] text-[#151515] placeholder:text-gray-400 focus:border-[#066A5D] focus:ring-[#066A5D]" />
                </div>
                <button
                  disabled={submitting}
                  className="h-10 rounded bg-[#066A5D] text-[#FDFDFD] mt-2 font-medium hover:bg-[#055A4F] transition disabled:opacity-60"
                >
                  {submitting ? '...' : t('auth.sendResetLink')}
                </button>
                <div className="text-sm mt-2 text-center">
                  <Link className="text-[#3B81F6] hover:underline" href="/ziegler/login">
                    Back to login
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
