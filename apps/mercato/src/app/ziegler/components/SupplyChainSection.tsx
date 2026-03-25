'use client'

import { useState } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { translateWithFallback } from '@open-mercato/shared/lib/i18n/translate'

const ZIEGLER_CDN = 'https://www.zieglergroup.com/wp-content/uploads'

const industries = [
  { id: 'aerospace', image: `${ZIEGLER_CDN}/2020/04/landing_aerospace.png` },
  { id: 'chemicals', image: `${ZIEGLER_CDN}/2020/04/landing_chemicals.png` },
  { id: 'cosmetics', image: `${ZIEGLER_CDN}/2020/04/landing_cosmetics.png` },
  { id: 'events', image: `${ZIEGLER_CDN}/2020/04/Fairs_and_expos-1.jpg` },
  { id: 'fashion', image: `${ZIEGLER_CDN}/2020/05/landing_fashion.png` },
  { id: 'fmcg', image: `${ZIEGLER_CDN}/2022/02/fmcg_2.jpg` },
  { id: 'generalCargo', image: `${ZIEGLER_CDN}/2022/01/6593fff4-9567-4a29-99bf-72c9665c8e34.jpg` },
  { id: 'sportsLeisure', image: `${ZIEGLER_CDN}/2020/04/Industries-Detail-Sport_and_Leisure-1-desktop.jpg` },
  { id: 'wineBeer', image: `${ZIEGLER_CDN}/2020/04/landing_wine.png` },
]

export function SupplyChainSection() {
  const t = useT()
  const translate = (key: string, fallback: string) => translateWithFallback(t, key, fallback)
  const [activeIndex, setActiveIndex] = useState(0)

  const activeIndustry = industries[activeIndex]

  return (
    <section className="mb-[55px] bg-white">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-[116px]">
        <h2 className="mx-auto pb-[56px] pt-[40px] text-center text-[18px] font-bold leading-[28px] tracking-[0.2px] text-[#066A5D] lg:text-[20px] lg:leading-[32px]">
          {translate('supplyChain.title', 'We provide unique expertise covering the entire supply chain.')}
        </h2>

        <div className="flex flex-col lg:flex-row">
          {/* Left panel - industry list (scrollable, matches image height) */}
          <div className="w-full shrink-0 overflow-y-auto border-b border-[#E2E8F0] lg:h-[449px] lg:w-[333px]">
            {industries.map((industry, index) => (
              <button
                key={industry.id}
                onClick={() => setActiveIndex(index)}
                className={`flex h-[56px] w-full items-center border-t border-[#E2E8F0] px-[24px] text-left text-[16px] font-bold leading-[24px] tracking-[0.16px] transition-colors ${
                  index === activeIndex
                    ? 'bg-[#FFEE4D] text-[#305B55] cursor-pointer'
                    : 'bg-white text-[#68778D] hover:bg-[#FFE91E] hover:text-[#1C3733] cursor-pointer'
                }`}
              >
                {translate(`supplyChain.industries.${industry.id}.name`, industry.id)}
              </button>
            ))}
          </div>

          {/* Right panel - detail view with image */}
          <div className="relative flex-1 overflow-hidden bg-[#066A5D]">
            <div className="relative h-[320px] lg:h-[449px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeIndustry.image}
                alt={translate(`supplyChain.industries.${activeIndustry.id}.name`, activeIndustry.id)}
                className="h-full w-full object-cover transition-opacity duration-[600ms]"
              />

              {/* Bottom overlay - solid semi-transparent teal, covers bottom 50% */}
              <div className="absolute inset-x-0 bottom-0 flex h-1/2 flex-col justify-center bg-[#066A5D]/[0.72] px-[32px]">
                <p className="text-[12px] font-bold leading-[20px] tracking-[0.12px] text-white">
                  {translate(`supplyChain.industries.${activeIndustry.id}.years`, '18')}{' '}
                  {translate('supplyChain.yearsIn', 'YEARS IN')}
                </p>
                <h3 className="mb-[8px] text-[24px] font-bold leading-[40px] tracking-[0.15px] text-white lg:text-[30px]">
                  {translate(`supplyChain.industries.${activeIndustry.id}.name`, activeIndustry.id)}
                </h3>
                <p className="max-w-[66%] text-[16px] leading-[28px] tracking-[0.18px] text-white lg:text-[18px]">
                  {translate(
                    `supplyChain.industries.${activeIndustry.id}.description`,
                    'Dedicated transport and logistics solutions for this industry.',
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
