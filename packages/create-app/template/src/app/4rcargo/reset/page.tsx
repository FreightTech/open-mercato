"use client"
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardDescription } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export default function FRCargoResetPage() {
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
    <div className="min-h-svh w-full bg-gradient-to-br from-[#00002a] via-[#1a1a4a] to-[#2d1f5c]">
      {/* Abstract gradient blobs */}
      <div
        className="pointer-events-none fixed right-[10%] top-[20%] h-[500px] w-[500px] rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(149, 101, 245, 0.6) 0%, rgba(149, 101, 245, 0.2) 40%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed left-[5%] bottom-[10%] h-[400px] w-[400px] rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(149, 101, 245, 0.5) 0%, transparent 60%)',
          filter: 'blur(80px)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm border-0 bg-white shadow-2xl">
          <CardHeader className="flex flex-col items-center gap-4 text-center px-8 pt-8 pb-0">
            <Link href="/" className="flex items-center">
              <Image
                src="/fms/4rcargo-logo-black.png"
                alt="4R Cargo"
                width={160}
                height={40}
                priority
              />
            </Link>
            <CardDescription className="text-gray-600">{t('auth.resetPassword')}</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            {sent ? (
              <div className="text-sm text-gray-600 text-center">
                If an account with that email exists, we sent a reset link. Please check your inbox.
              </div>
            ) : (
              <form className="grid gap-3" onSubmit={onSubmit} noValidate>
                {error && <div className="text-sm text-red-600 text-center">{error}</div>}
                <div className="grid gap-1">
                  <Label htmlFor="email" className="text-gray-700">{t('auth.email')}</Label>
                  <Input id="email" name="email" type="email" required className="border-gray-300 bg-white text-gray-900 focus-visible:ring-[#9565f5]" />
                </div>
                <button
                  disabled={submitting}
                  className="h-10 rounded-full bg-[#9565f5] text-white mt-2 font-medium hover:bg-[#8050e0] transition disabled:opacity-60"
                >
                  {submitting ? '...' : t('auth.sendResetLink')}
                </button>
                <div className="text-xs text-gray-500 mt-2 text-center">
                  <Link className="hover:text-[#9565f5] hover:underline" href="/login">
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
