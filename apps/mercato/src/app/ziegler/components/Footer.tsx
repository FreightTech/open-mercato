'use client'

import Image from 'next/image'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { translateWithFallback } from '@open-mercato/shared/lib/i18n/translate'

export function Footer() {
  const t = useT()
  const translate = (key: string, fallback: string) => translateWithFallback(t, key, fallback)

  return (
    <footer className="bg-[#066A5D] py-8">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-3 px-6 lg:px-[104px]">
        <Image
          src="/fms/ziegler-logo-yellow.svg"
          alt="Ziegler"
          width={120}
          height={44}
          className="h-10 w-auto"
        />
        <p className="text-[12px] text-white/60">
          &copy; {new Date().getFullYear()} {translate('footer.copyright', 'Ziegler Group. All rights reserved.')}
        </p>
      </div>
    </footer>
  )
}
