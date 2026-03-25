'use client'

import { useT } from '@open-mercato/shared/lib/i18n/context'
import { translateWithFallback } from '@open-mercato/shared/lib/i18n/translate'

export function StatsSection() {
  const t = useT()
  const translate = (key: string, fallback: string) => translateWithFallback(t, key, fallback)

  return (
    <section className="bg-[#EDF2F7]">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-[104px]">
        <h2 className="mx-auto max-w-[700px] pt-[40px] text-center text-[18px] font-bold leading-[28px] text-[#066A5D] lg:text-[20px] lg:leading-[32px]">
          {translate('stats.title', 'We know regional conditions and give individual support to our customers to be globally successful.')}
        </h2>

        <div className="flex flex-wrap items-start justify-between border-b border-gray-300 py-[56px] lg:flex-nowrap">
          {/* +3200 Experts */}
          <div className="flex w-[calc(50%-12px)] flex-col items-center text-center text-[#54A699] lg:w-auto lg:flex-1">
            <svg className="mb-2 h-[42px] w-auto" viewBox="0 0 64 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M42.246 6.301l.178-.088a10.5 10.5 0 0 1 7.33-.088 10.5 10.5 0 0 1 6.396 6.05 10.5 10.5 0 0 1-1.09 9.368l-.146.22a10.5 10.5 0 0 1-3.54 3.304M21.754 6.301l-.178-.088a10.5 10.5 0 0 0-7.33-.088 10.5 10.5 0 0 0-6.396 6.05 10.5 10.5 0 0 0 1.09 9.368l.146.22a10.5 10.5 0 0 0 3.54 3.304M32 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 20c-7.18 0-13 4.477-13 10v4h26v-4c0-5.523-5.82-10-13-10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="text-[28px] font-bold leading-tight lg:text-[36px]">+3200</div>
            <div className="mt-1 text-[12px] tracking-[0.12px]">
              {translate('stats.experts', 'Experts')}
            </div>
          </div>

          {/* 155 Operational offices */}
          <div className="flex w-[calc(50%-12px)] flex-col items-center text-center text-[#54A699] lg:w-auto lg:flex-1">
            <svg className="mb-2 h-[42px] w-auto" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 2C9.059 2 1 10.059 1 20c0 13.5 18 26 18 26s18-12.5 18-26C37 10.059 28.941 2 19 2zm0 24.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="text-[28px] font-bold leading-tight lg:text-[36px]">155</div>
            <div className="mt-1 text-[12px] tracking-[0.12px]">
              {translate('stats.offices', 'Operational offices')}
            </div>
          </div>

          {/* 195 Supported countries */}
          <div className="flex w-[calc(50%-12px)] flex-col items-center text-center text-[#54A699] lg:w-auto lg:flex-1">
            <svg className="mb-2 h-[42px] w-auto" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5"/>
              <ellipse cx="24" cy="24" rx="10" ry="22" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 24h44M4 14h40M4 34h40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <div className="text-[28px] font-bold leading-tight lg:text-[36px]">195</div>
            <div className="mt-1 text-[12px] tracking-[0.12px]">
              {translate('stats.countries', 'Supported countries')}
            </div>
          </div>

          {/* Offices in 16 countries */}
          <div className="flex w-[calc(50%-12px)] flex-col items-center text-center text-[#54A699] lg:w-auto lg:flex-1">
            <svg className="mb-2 h-[42px] w-auto" viewBox="0 0 44 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 46h40M6 46V6h14v40M20 46V18h18v28M10 12h2M10 18h2M10 24h2M10 30h2M10 36h2M10 42h2M16 12h-2M26 24h2M26 30h2M26 36h2M26 42h2M32 24h2M32 30h2M32 36h2M32 42h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="text-[12px] tracking-[0.12px]">
              {translate('stats.officesIn', 'Offices')}
            </div>
            <div className="text-[12px] tracking-[0.12px]">
              in <span className="text-[28px] font-bold leading-tight lg:text-[36px]">16</span> {translate('stats.inCountries', 'countries')}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
