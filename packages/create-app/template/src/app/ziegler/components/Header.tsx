'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { translateWithFallback } from '@open-mercato/shared/lib/i18n/translate'

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const t = useT()
  const translate = (key: string, fallback: string) => translateWithFallback(t, key, fallback)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav
      className={`sticky top-0 z-[200] bg-[#066A5D] transition-all duration-300 ${
        isScrolled ? 'py-3 shadow-lg' : 'pb-4 pt-[30px]'
      }`}
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 lg:px-[104px]">
        <Link href="/ziegler" className="shrink-0">
          <Image
            src="/fms/ziegler-logo-yellow.svg"
            alt="Ziegler"
            width={153}
            height={56}
            className="h-14 w-auto"
          />
        </Link>

        {/* Desktop - Yellow Login button */}
        <div className="hidden items-center lg:flex">
          <Link
            href="/ziegler/login"
            className="inline-flex h-8 items-center rounded-[4px] bg-[#FFEE4D] px-3 text-[14px] font-bold text-[#305B55] transition-colors hover:bg-[#ffe520]"
            style={{ letterSpacing: '0.14px' }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-1"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M11.837 13.0391C10.7722 13.8511 9.44242 14.3333 8 14.3333C6.55758 14.3333 5.22779 13.8511 4.16302 13.0391C4.797 11.5463 6.27685 10.5 8 10.5C9.72315 10.5 11.203 11.5463 11.837 13.0391ZM12.6136 12.3388C11.7624 10.655 10.0166 9.5 8 9.5C5.98343 9.5 4.2376 10.655 3.38636 12.3389C2.32002 11.2054 1.66667 9.67901 1.66667 8C1.66667 4.5022 4.5022 1.66667 8 1.66667C11.4978 1.66667 14.3333 4.5022 14.3333 8C14.3333 9.679 13.68 11.2054 12.6136 12.3388ZM15.3333 8C15.3333 12.0501 12.0501 15.3333 8 15.3333C3.94991 15.3333 0.666667 12.0501 0.666667 8C0.666667 3.94991 3.94991 0.666667 8 0.666667C12.0501 0.666667 15.3333 3.94991 15.3333 8ZM8 8.33333C8.92048 8.33333 9.66667 7.58714 9.66667 6.66667C9.66667 5.74619 8.92048 5 8 5C7.07953 5 6.33333 5.74619 6.33333 6.66667C6.33333 7.58714 7.07953 8.33333 8 8.33333ZM8 9.33333C9.47276 9.33333 10.6667 8.13943 10.6667 6.66667C10.6667 5.19391 9.47276 4 8 4C6.52724 4 5.33333 5.19391 5.33333 6.66667C5.33333 8.13943 6.52724 9.33333 8 9.33333Z"
                fill="#3C726A"
              />
            </svg>
            {translate('nav.login', 'Log in')}
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="rounded-[6px] bg-[#066A5D] p-2 lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="mt-2 border-t border-white/20 bg-[#00483B] lg:hidden">
          <div className="px-6 pb-4 pt-4">
            <Link
              href="/ziegler/login"
              className="block rounded-[4px] bg-[#FFEE4D] px-5 py-3 text-center text-sm font-bold text-[#305B55] transition-colors hover:bg-[#ffe520]"
            >
              {translate('nav.login', 'Log in')}
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
